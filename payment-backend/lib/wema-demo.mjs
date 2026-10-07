import { demoMode } from './bank-mode.mjs';
export class DemoBankError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(s,m)=>{throw new DemoBankError(s,m);};
const one=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const run=(db,sql,...v)=>db.prepare(sql).bind(...v).run();
const at=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const amount=n=>{if(!Number.isSafeInteger(n)||n<100||n>10000000)fail(400,'Use ₦1–₦100,000 of simulated funds, in whole kobo.');return n;};
async function connected(db,u){const w=await one(db,"SELECT * FROM wallets WHERE user_id=? AND bank_environment='demo' AND bank_status='active'",u.id);if(!w)fail(409,'Set up your simulated Wema wallet first.');return w;}
async function snapshot(db,userId){const b=await one(db,"SELECT d.available,w.bank_account FROM demo_bank_balances d JOIN wallets w ON w.user_id=d.user_id WHERE d.user_id=? AND w.bank_environment='demo'",userId);if(b)await run(db,"INSERT INTO bank_balances (user_id,account,available,environment,checked_at) VALUES (?,?,?,'demo',?) ON CONFLICT(user_id) DO UPDATE SET account=excluded.account,available=excluded.available,environment='demo',checked_at=excluded.checked_at",userId,b.bank_account,b.available,at());}
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
// The shared transaction helper evaluates the guard and all writes atomically.
const write=(sql,values)=>({id,opCondition})=>[sql.replace('@op',opCondition),[...values,id]];
export async function demoBank(db,user,request,body,path,env,transact){
 if(!demoMode(env))fail(503,'Simulated banking is disabled.');
 if(body.nin!==undefined)fail(400,'Demo mode does not accept a real NIN.');
 let wallet=await one(db,'SELECT * FROM wallets WHERE user_id=?',user.id);
 if(path==='wema/onboarding/request'){
  if(body.consent!==true)fail(400,'Confirm this is a simulated account setup.');
  if(wallet.bank_environment&&wallet.bank_environment!=='demo')fail(409,'This account is connected to another bank environment.');
  if(wallet.bank_status==='active')return {status:'active',message:'Your simulated bank wallet is already set up.'};
  await run(db,"UPDATE wallets SET bank_status='otp_required',bank_environment='demo',bank_tracking=?,bank_consent_at=? WHERE user_id=?",'DEMO-'+user.id,at(),user.id);
  return {status:'otp_required',message:'Demo only: use code 123456. No SMS was sent.'};
 }
 if(path==='wema/onboarding/verify'){
  if(wallet.bank_environment!=='demo'||wallet.bank_status!=='otp_required')fail(409,'Start simulated account setup first.');
  if(body.otp!=='123456')fail(400,'Use the displayed demo code 123456. No real bank OTP is needed.');
  const account='DEMO-'+user.id.slice(3).replace(/-/g,'').toUpperCase();
  await db.batch([db.prepare("UPDATE wallets SET bank_status='active',bank_account=?,bank_name=? WHERE user_id=? AND bank_environment='demo'").bind(account,user.name+' · Demo',user.id),db.prepare('INSERT OR IGNORE INTO demo_bank_balances (user_id,available,held) VALUES (?,0,0)').bind(user.id)]);
  await snapshot(db,user.id);return {status:'active',message:'Simulated Wema wallet ready. This is not a real bank account.'};
 }
 wallet=await connected(db,user);
 if(path==='wema/balance/refresh'){await snapshot(db,user.id);return {status:'refreshed',message:'Simulated balance refreshed. No Wema request was made.'};}
 if(path==='wema/demo/deposits/create'){
  const n=amount(body.amount),scenario=body.scenario||'successful';if(!['successful','pending','failed'].includes(scenario))fail(400,'Choose a supported demo outcome.');
  const depId='DEMO-DEP-'+await sha(user.id+':'+request.headers.get('idempotency-key')),reference=depId,time=at();
  await transact(db,user,request,'demo_deposit',{amount:n,scenario},"COALESCE((SELECT SUM(amount) FROM bank_deposits WHERE user_id=? AND environment='demo' AND created_at>?),0)+?<=10000000",[user.id,new Date(Date.now()-86400000).toISOString(),n],[write("INSERT INTO bank_deposits (id,user_id,reference,account,status,amount,environment,created_at) SELECT ?,?,?,?,'pending',?,'demo',? WHERE @op",[depId,user.id,reference,wallet.bank_account,n,time])]);
  // The saved operation key identifies its deposit, including a replay.
  const deposit=await one(db,"SELECT * FROM bank_deposits WHERE id=? AND user_id=? AND environment='demo'",depId,user.id);
  if(scenario!=='pending')await settleDeposit(db,user,request,deposit,scenario,transact);
  await snapshot(db,user.id);return {status:scenario,reference:deposit.reference,message:scenario==='pending'?'Simulated deposit pending. Check the same reference to complete the demo.':scenario==='failed'?'Simulated deposit failed. No funds were added.':'Simulated deposit completed. No real money moved.'};
 }
 if(path==='wema/deposits/check'){
  const d=await one(db,"SELECT * FROM bank_deposits WHERE user_id=? AND reference=? AND environment='demo'",user.id,String(body.reference||''));if(!d)fail(404,'Use a deposit reference created by your own demo wallet.');
  if(d.status==='pending')await settleDeposit(db,user,request,d,'successful',transact);
  await snapshot(db,user.id);return {status:d.status==='pending'?'successful':d.status,message:'Simulated deposit checked. No bank was contacted.'};
 }
 if(path==='wema/payments/create'){
  const job=await one(db,"SELECT * FROM payment_jobs WHERE id=? AND employer_id=? AND rail='wema' AND bank_environment='demo'",String(body.jobId||''),user.id);if(!job)fail(404,'Payment agreement not found.');
  const recipient=await connected(db,{id:job.worker_id}),reference='DEMO-PAY-'+id(),bankId='DEMO-'+id();
  await transact(db,user,request,'demo_bank_payment',{jobId:job.id},"EXISTS(SELECT 1 FROM payment_jobs j JOIN demo_bank_balances b ON b.user_id=j.employer_id WHERE j.id=? AND j.status='accepted' AND b.available>=j.amount) AND NOT EXISTS(SELECT 1 FROM bank_requests WHERE job_id=? AND kind='payment')",[job.id,job.id],[write("INSERT INTO bank_requests (id,user_id,kind,reference,amount,source,destination,job_id,status,environment,created_at) SELECT ?,?,'payment',?,?,?,?,?,'pending','demo',? WHERE @op",[bankId,user.id,reference,job.amount,wallet.bank_account,recipient.bank_account,job.id,at()]),write('UPDATE demo_bank_balances SET available=available-?,held=held+? WHERE user_id=? AND @op',[job.amount,job.amount,user.id]),write("UPDATE payment_jobs SET status='bank_pending' WHERE id=? AND @op",[job.id])]);
  const saved=await one(db,"SELECT reference FROM bank_requests WHERE job_id=? AND kind='payment'",job.id);await snapshot(db,user.id);return {status:'pending',reference:saved.reference,message:'Simulated payment pending. Choose Check demo payment to complete it.'};
 }
 if(path==='wema/payments/reconcile'){
  const payment=await one(db,"SELECT * FROM bank_requests WHERE reference=? AND user_id=? AND environment='demo' AND kind='payment'",String(body.reference||''),user.id);if(!payment)fail(404,'Your simulated payment was not found.');
  if(payment.status==='successful')return {status:'successful',message:'Simulated payment already completed.'};
  const job=await one(db,'SELECT * FROM payment_jobs WHERE id=?',payment.job_id),time=at();
  await transact(db,user,request,'demo_bank_settle',{reference:payment.reference},"EXISTS(SELECT 1 FROM bank_requests WHERE reference=? AND status='pending' AND environment='demo')",[payment.reference],[write('UPDATE demo_bank_balances SET held=held-? WHERE user_id=? AND @op',[payment.amount,user.id]),write('UPDATE demo_bank_balances SET available=available+? WHERE user_id=? AND @op',[payment.amount,job.worker_id]),...[[user.id,'bank_paid',-payment.amount],[job.worker_id,'bank_received',payment.amount]].map(([u,kind,n])=>write("INSERT INTO transactions (id,reference,user_id,job_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,?,?,?,'successful',?,'wema_demo',? WHERE @op",[payment.id+'-'+kind,payment.reference+'-'+kind,u,job.id,kind,n,'Simulated Wema payment for '+job.title,time])),write("UPDATE bank_requests SET status='successful' WHERE reference=? AND @op",[payment.reference]),write("UPDATE payment_jobs SET status='bank_paid' WHERE id=? AND @op",[job.id])]);
  await snapshot(db,user.id);await snapshot(db,job.worker_id);return {status:'successful',message:'Simulated Wema payment completed. No real money moved.'};
 }
 if(path==='wema/statements/request'){
  if(body.consent!==true)fail(400,'Confirm this is a simulated history request.');
  await run(db,"INSERT INTO bank_requests (id,user_id,kind,reference,status,environment,created_at) VALUES (?,?,'statement',?,'demo_approved','demo',?)",'DEMO-'+id(),user.id,'DEMO-ST-'+id(),at());return {status:'demo_approved',message:'Demo history consent simulated. No ALAT approval is required.'};
 }
 if(path==='wema/statements/sync'){
  const consent=await one(db,"SELECT id FROM bank_requests WHERE user_id=? AND kind='statement' AND environment='demo' AND created_at>?",user.id,new Date(Date.now()-900000).toISOString());if(!consent)fail(409,'Request simulated history consent first.');
  const records=(await db.prepare("SELECT reference,created_at AS date,amount,status FROM transactions WHERE user_id=? AND mode='wema_demo' ORDER BY created_at DESC LIMIT 50").bind(user.id).all()).results;
  return {status:'synced',records:records.map(r=>({...r,amount:r.amount/100,currency:'TEST-NGN'})),message:'Simulated history only.'};
 }
 fail(404,'Simulated banking action not found.');
}
async function settleDeposit(db,user,request,d,state,transact){
 if(d.status!=='pending')return;
 const receipt=d.reference+'-receipt',time=at();
 // Derived settlement key makes callbacks/checks for the same deposit one operation.
 const settleRequest=new Request(request.url,{headers:{'idempotency-key':d.id+'-settle'}});
 await transact(db,user,settleRequest,'demo_deposit_settle',{reference:d.reference,state},"EXISTS(SELECT 1 FROM bank_deposits WHERE id=? AND status='pending' AND environment='demo')",[d.id],[...(state==='successful'?[write('UPDATE demo_bank_balances SET available=available+? WHERE user_id=? AND @op',[d.amount,user.id]),write("INSERT INTO transactions (id,reference,user_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,'bank_deposit',?,'successful','Simulated Wema deposit','wema_demo',? WHERE @op",[d.id,receipt,user.id,d.amount,time])]:[]),write('UPDATE bank_deposits SET status=?,receipt_reference=?,verified_at=? WHERE id=? AND @op',[state,state==='successful'?receipt:null,time,d.id])]);
}
