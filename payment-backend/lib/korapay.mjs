// Initial Kora notification inbox. This module does not issue accounts, credit
// balances, settle work or make payouts. Enable those only after their own
// approved, independently tested ledger integration exists.
export class KoraError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const fail=(status,message)=>{throw new KoraError(status,message);};
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;};
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));

// Called only after service.mjs authenticates x-lochire-service-key. The
// Vercel gateway supplies its own saved test secret; client headers are dropped.
// Live credentials are never accepted through this testing-only relay.
export function koraRequestEnvironment(env,request){
  if(env.KORAPAY_SECRET_KEY||env.KORAPAY_MODE==='live'||env.KORAPAY_ALLOW_TEST_KEY_RELAY!=='true')return env;
  const testKey=request.headers.get('x-lochire-kora-test-key');
  return typeof testKey==='string'&&testKey.startsWith('sk_test_')?{...env,KORAPAY_MODE:'test',KORAPAY_SECRET_KEY:testKey}:env;
}

export function koraWebhookStatus(env){
  const mode=env.KORAPAY_MODE==='live'?'live':'test';
  const keyMatches=String(env.KORAPAY_SECRET_KEY||'').startsWith(mode==='live'?'sk_live_':'sk_test_');
  const ready=env.KORAPAY_WEBHOOKS_ENABLED==='true'&&keyMatches&&(mode==='test'||env.KORAPAY_BUSINESS_APPROVED==='true');
  return {provider:'Kora',mode,webhookReady:ready,status:ready?'notification_inbox_ready':'awaiting_configuration',automaticCredits:false,virtualAccounts:false,workerPayouts:false};
}

async function queryCharge(env,reference){
  let response;
  try {
    response=await fetch('https://api.korapay.com/merchant/api/v1/charges/'+encodeURIComponent(reference),{
      headers:{Authorization:'Bearer '+env.KORAPAY_SECRET_KEY,Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(15000)
    });
  } catch {fail(503,'Kora verification is unavailable. The notification can be retried.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!==true||!result.data)fail(503,'Kora could not independently confirm this notification.');
  return result.data;
}

function toKobo(value){
  const text=String(value??'');
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))fail(409,'Kora returned an invalid payment amount.');
  const [whole,fraction='']=text.split('.');
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<=0)fail(409,'Kora returned an invalid payment amount.');
  return amount;
}

export async function koraWebhook(db,request,raw,env){
  const readiness=koraWebhookStatus(env);
  if(!readiness.webhookReady)fail(503,'Kora notifications are awaiting private backend configuration.');
  if(encoder.encode(raw).byteLength>16000)fail(413,'Request is too large.');
  let event;
  try {event=JSON.parse(raw);}catch{fail(400,'Invalid JSON notification.');}
  if(!event||Array.isArray(event)||typeof event!=='object'||typeof event.event!=='string'||!event.data||Array.isArray(event.data)||typeof event.data!=='object')fail(400,'Invalid Kora notification.');
  const signature=request.headers.get('x-korapay-signature');
  if(!/^[a-fA-F0-9]{64}$/.test(signature||''))fail(401,'Invalid Kora notification signature.');
  // Kora signs JSON.stringify(data), not the whole request body.
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.KORAPAY_SECRET_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=hex(await crypto.subtle.sign('HMAC',key,encoder.encode(JSON.stringify(event.data))));
  if(!equal(expected,signature.toLowerCase()))fail(401,'Invalid Kora notification signature.');
  // Payout/refund events need their own future reconciliation handlers.
  if(event.event!=='charge.success')return {received:true,handled:false};
  const reference=event.data.reference;
  if(typeof reference!=='string'||!/^[-A-Za-z0-9_]{5,120}$/.test(reference))fail(400,'Invalid Kora payment reference.');
  const id='KORA-'+await digest(readiness.mode+':'+event.event+':'+reference);
  const existing=await db.prepare('SELECT id FROM bank_events WHERE id=?').bind(id).first();
  if(existing)return {received:true,recorded:true,duplicate:true,credited:false};
  const charge=await queryCharge(env,reference);
  if(charge.reference!==reference||charge.currency!=='NGN'||charge.status!=='success')fail(409,'Kora verification does not match a successful NGN payment.');
  const account=charge.virtual_bank_account;
  if(!account||typeof account.account_reference!=='string'||account.account_reference.length>120||!account.account_reference||!/^\d{10}$/.test(account.account_number||''))fail(409,'Kora has not confirmed a dedicated virtual-account payment.');
  const amount=toKobo(charge.amount_paid??charge.amount);
  // Store only the minimum verified receipt data. Never store the complete
  // provider payload, payer bank details, secret key or customer BVN.
  const state=JSON.stringify({provider:'Kora',mode:readiness.mode,event:'charge.success',amount,currency:'NGN',accountReference:account.account_reference,status:'verified_unapplied',credited:false});
  const inserted=await db.prepare('INSERT OR IGNORE INTO bank_events(id,reference,state,created_at) VALUES(?,?,?,?)').bind(id,reference,state,new Date().toISOString()).run();
  return {received:true,recorded:true,duplicate:inserted.meta?.changes!==1,credited:false};
}
