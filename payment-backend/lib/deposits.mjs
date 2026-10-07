import { demoMode } from './bank-mode.mjs';
import { WemaProvider, bankReadiness } from './wema.mjs';

export class DepositError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const fail=(status,message)=>{throw new DepositError(status,message);};
const one=(db,sql,...values)=>db.prepare(sql).bind(...values).first();
const now=()=>new Date().toISOString();
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
export function depositReadiness(env){
  if(env.WEMA_MODE==='demo')return {ready:demoMode(env),enabled:demoMode(env),simulated:true,environment:'demo',missing:[],method:'simulated_transfer',provider:'LocHire Wema simulation'};
  const bank=bankReadiness(env),missing=['WEMA_DEPOSIT_STATUS_PATH','WEMA_BALANCE_PATH','WEMA_AMOUNT_UNIT'].filter(k=>!env[k]);
  if(env.WEMA_DEPOSIT_CONTRACT_CONFIRMED!=='true')missing.push('WEMA_DEPOSIT_CONTRACT_CONFIRMED');
  if(!['naira','kobo'].includes(env.WEMA_AMOUNT_UNIT))missing.push('WEMA_AMOUNT_UNIT');
  return {ready:bank.ready&&env.WEMA_DEPOSITS_ENABLED==='true'&&missing.length===0,enabled:env.WEMA_DEPOSITS_ENABLED==='true',environment:bank.environment,missing:[...new Set(missing)],method:'bank_transfer',provider:'Wema / ALAT'};
}
function kobo(value,unit){
  const text=String(value??'');
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('Invalid bank amount.');
  const [whole,fraction='']=text.split('.');
  const n=unit==='kobo'?Number(text):Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid bank amount.');
  return n;
}
const statusOf=v=>({SUCCESS:'successful',SUCCESSFUL:'successful',PENDING:'pending',FAILED:'failed'})[String(v||'').toUpperCase()];
export class WemaDeposits extends WemaProvider {
  async verifyCredit(reference){
    const response=await this.request(this.env.WEMA_DEPOSIT_STATUS_PATH.replace('{reference}',encodeURIComponent(reference)).replace('{channelId}',encodeURIComponent(this.env.WEMA_CHANNEL_ID)),undefined,'GET');
    // Subscription-specific projection: confirm with Wema before enabling.
    const d=response.data||response.result||response,status=statusOf(d.status);
    if(!status||d.transactionReference!==reference||d.currency!=='NGN'||!/^\d{10}$/.test(d.destinationAccountNumber||''))throw Error('Bank deposit does not match.');
    if(String(d.direction||'').toUpperCase()!=='CREDIT')throw Error('Bank transaction is not a wallet credit.');
    const amount=status==='successful'?kobo(d.amount,this.env.WEMA_AMOUNT_UNIT):null;
    if(status==='successful'&&amount<1)throw Error('Deposit amount must be positive.');
    return {status,account:d.destinationAccountNumber,amount};
  }
  async balance(account){
    const response=await this.request(this.env.WEMA_BALANCE_PATH.replace('{accountNumber}',encodeURIComponent(account)).replace('{channelId}',encodeURIComponent(this.env.WEMA_CHANNEL_ID)),undefined,'GET');
    const d=response.data||response.result||response;
    if(d.accountNumber!==account||d.currency!=='NGN')throw Error('Bank balance account does not match.');
    return {available:kobo(d.availableBalance,this.env.WEMA_AMOUNT_UNIT)};
  }
}
export async function depositSummary(db,user){
  const deposits=(await db.prepare('SELECT reference,status,amount,environment,receipt_reference,created_at,verified_at FROM bank_deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all()).results;
  const balance=await one(db,'SELECT account,available,environment,checked_at FROM bank_balances WHERE user_id=?',user.id);
  const demoHeld=balance?.environment==='demo'?await one(db,'SELECT available,held FROM demo_bank_balances WHERE user_id=?',user.id):null;
  return {bankDeposits:deposits,bankBalance:balance?{available:demoHeld?.available??balance.available,held:demoHeld?.held||0,environment:balance.environment,account:balance.account,checkedAt:balance.checked_at,currency:balance.environment==='production'?'NGN':'TEST-NGN'}:null};
}
function ready(env){if(!depositReadiness(env).ready)fail(503,'Wema deposits are not connected yet. Test funds remain available.');}
function referenceOf(body){const ref=body.reference||body.data?.transactionReference||body.transactionReference;if(typeof ref!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(ref))fail(400,'Enter the bank transaction reference using 8–100 letters, numbers, hyphens or underscores.');return ref;}
async function activeWallet(db,user,env){const w=await one(db,"SELECT * FROM wallets WHERE user_id=? AND bank_status='active' AND bank_environment=?",user.id,env.WEMA_ENVIRONMENT);if(!w||!/^\d{10}$/.test(w.bank_account||''))fail(409,'Connect a bank-confirmed Wema wallet in this environment first.');return w;}
async function record(db,user,wallet,reference,verified,env){
  if(verified.account!==wallet.bank_account)fail(409,'This deposit does not belong to your Wema wallet.');
  // An in-app job transfer already has its own paired receipts.
  const jobPayment=await one(db,"SELECT reference FROM bank_requests WHERE reference=? AND kind='payment'",reference);
  if(jobPayment)return {status:'job_payment',message:'This is a job payment. Check its payment agreement for the receipt.'};
  const id='DEP-'+await sha(`${env.WEMA_ENVIRONMENT}:${reference}:${user.id}`),receipt='LH-'+id,at=now();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO bank_deposits (id,user_id,reference,account,status,environment,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,user.id,reference,wallet.bank_account,'pending',env.WEMA_ENVIRONMENT,at),
    db.prepare("UPDATE bank_deposits SET status=?,amount=?,verified_at=?,receipt_reference=? WHERE id=? AND status!='successful'").bind(verified.status,verified.amount,at,verified.status==='successful'?receipt:null,id),
    ...(verified.status==='successful'?[db.prepare("INSERT OR IGNORE INTO transactions (id,reference,user_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,'bank_deposit',?,'successful','Deposit to Wema wallet',?,? WHERE EXISTS(SELECT 1 FROM bank_deposits WHERE id=? AND status='successful')").bind(id,receipt,user.id,verified.amount,env.WEMA_ENVIRONMENT==='production'?'wema':'wema_sandbox',at,id)]:[]),
  ]);
  const saved=await one(db,'SELECT status FROM bank_deposits WHERE id=?',id);
  return {status:saved.status,message:saved.status==='successful'?'Wema confirmed the deposit. Your receipt is saved. Refresh the Wema balance to see current funds.':saved.status==='failed'?'Wema reports this transfer failed. Contact your sending bank before trying another transfer.':'Wema has not confirmed this deposit yet. Check this same reference again later.'};
}
export async function depositAction(db,user,body,path,env){
  ready(env);const wallet=await activeWallet(db,user,env),bank=new WemaDeposits(env);
  if(path==='wema/balance/refresh'){
    let balance;try{balance=await bank.balance(wallet.bank_account);}catch{fail(502,'Wema could not confirm the balance. Any previous balance keeps its original timestamp.');}
    await db.prepare('INSERT INTO bank_balances (user_id,account,available,environment,checked_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET account=excluded.account,available=excluded.available,environment=excluded.environment,checked_at=excluded.checked_at').bind(user.id,wallet.bank_account,balance.available,env.WEMA_ENVIRONMENT,now()).run();
    return {status:'refreshed',message:'Wema balance checked.'};
  }
  const reference=referenceOf(body),existing=await one(db,'SELECT status FROM bank_deposits WHERE user_id=? AND reference=? AND environment=?',user.id,reference,env.WEMA_ENVIRONMENT);
  if(existing?.status==='successful')return {status:'successful',message:'This deposit is already confirmed. Its receipt is saved.'};
  const id='DEP-'+await sha(`${env.WEMA_ENVIRONMENT}:${reference}:${user.id}`);
  await db.prepare('INSERT OR IGNORE INTO bank_deposits (id,user_id,reference,account,status,environment,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,user.id,reference,wallet.bank_account,'pending',env.WEMA_ENVIRONMENT,now()).run();
  let verified;try{verified=await bank.verifyCredit(reference);}catch{
    await db.prepare("UPDATE bank_deposits SET status='unknown' WHERE id=? AND status!='successful'").bind(id).run();
    return {status:'unknown',message:'Wema could not confirm this reference yet. It is saved for checking again; no deposit receipt has been issued.'};
  }
  return record(db,user,wallet,reference,verified,env);
}
export async function depositCallback(db,body,env){
  ready(env);const reference=referenceOf(body),bank=new WemaDeposits(env);
  let verified;try{verified=await bank.verifyCredit(reference);}catch{fail(502,'The deposit could not be independently verified. Retry the notification later.');}
  const wallet=await one(db,"SELECT * FROM wallets WHERE bank_account=? AND bank_status='active' AND bank_environment=?",verified.account,env.WEMA_ENVIRONMENT);
  if(!wallet)fail(404,'A confirmed LocHire Wema wallet was not found.');
  return {received:true,...await record(db,{id:wallet.user_id},wallet,reference,verified,env)};
}
