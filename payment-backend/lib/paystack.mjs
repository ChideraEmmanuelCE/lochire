// Hosted checkout and direct bank settlement. No locally simulated money.
export class PaystackError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(s,m)=>{throw new PaystackError(s,m);};
const first=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const all=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
const run=(db,sql,...v)=>db.prepare(sql).bind(...v).run();
const now=()=>new Date().toISOString();
const encoder=new TextEncoder();
const hex=v=>Array.from(new Uint8Array(v),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async v=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(v)));
const safeEqual=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const valid=(v,re,label)=>{if(typeof v!=='string'||!re.test(v))fail(400,'Enter a valid '+label+'.');return v;};
export function paymentReadiness(env){const mode=env.PAYSTACK_MODE==='test'?'test':'live',key=env.PAYSTACK_SECRET_KEY||'',ready=env.PAYSTACK_ENABLED==='true'&&key.startsWith(mode==='live'?'sk_live_':'sk_test_')&&(!((env.APP_MODE==='production')&&mode!=='live'));
 return {provider:'Paystack',mode,ready,status:ready?'ready':'awaiting_activation',settlement:'direct_to_worker_bank',currency:'NGN',message:ready?'Pay securely; settlement goes to the worker’s connected bank account.':'Online payments are awaiting Paystack activation. Cash and direct bank-transfer records are available.'};}
function requireProvider(env){const r=paymentReadiness(env);if(!r.ready)fail(503,'Online payments are awaiting Paystack activation.');return r;}
async function provider(env,path,body){requireProvider(env);let response;try{response=await fetch('https://api.paystack.co'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{fail(503,'Paystack could not be reached. Check the saved payment before trying again.');}
 const data=await response.json().catch(()=>null);if(!response.ok||data?.status!==true)fail(response.status===400?422:503,'Paystack could not complete this request. Check the details or contact support.');return data.data;}
const bankPublic=r=>r?{bankName:r.bank_name,accountName:r.account_name,last4:r.last4,mode:r.mode,connected:r.status==='ready',status:r.status}:null;
const paymentPublic=r=>({reference:r.reference,engagementId:r.engagement_id,payer:r.payer,recipient:r.recipient,amount:r.amount,currency:'NGN',mode:r.mode,status:r.status,period:r.period,termsVersion:r.terms_version,createdAt:r.created_at,paidAt:r.paid_at,fees:r.fees,settlement:'Bank settlement handled by Paystack; payment success does not confirm bank receipt.'});
export async function onlineState(db,user,env){const mode=paymentReadiness(env).mode;if(!user)return {provider:paymentReadiness(env),bank:null,onlinePayments:[]};
 const bank=await first(db,"SELECT * FROM paystack_destinations WHERE user_id=? AND mode=? AND status='ready' ORDER BY created_at DESC LIMIT 1",user.id,mode);
 const payments=await all(db,'SELECT p.* FROM paystack_payments p JOIN live_profiles a ON a.id=p.payer JOIN live_profiles b ON b.id=p.recipient WHERE (a.user_id=? OR b.user_id=?) AND p.mode=? ORDER BY p.created_at DESC LIMIT 250',user.id,user.id,mode);
 return {provider:paymentReadiness(env),bank:bankPublic(bank),onlinePayments:payments.map(paymentPublic)};}
async function work(db,user,gid,payerOnly=false){valid(gid,/^[A-Za-z0-9-]{8,120}$/,'engagement');const row=await first(db,'SELECT g.*,a.user_id AS payer_user,b.user_id AS worker_user FROM live_engagements g JOIN live_profiles a ON a.id=g.employer_id JOIN live_profiles b ON b.id=g.worker_id WHERE g.id=? AND (a.user_id=? OR b.user_id=?)',gid,user.id,user.id);if(!row)fail(404,'This work is not available to your account.');if(payerOnly&&row.payer_user!==user.id)fail(403,'Only the hirer can pay for this work.');return {...row,details:JSON.parse(row.data)};}
async function banks(env){let out=[],next=1;for(let i=0;i<10;i++){const p=await provider(env,'/bank?country=nigeria&currency=NGN&perPage=100&page='+next);if(!Array.isArray(p))fail(503,'Bank list is unavailable.');out.push(...p.filter(b=>b.active!==false&&b.is_deleted!==true&&b.currency==='NGN').map(b=>({name:b.name,code:b.code})));if(p.length<100)break;next++;}return [...new Map(out.map(b=>[b.code,b])).values()].sort((a,b)=>a.name.localeCompare(b.name));}
async function resolve(env,bankCode,accountNumber){valid(bankCode,/^[0-9A-Za-z_-]{2,20}$/,'bank');valid(accountNumber,/^\d{10}$/,'account number');const b=(await banks(env)).find(b=>b.code===bankCode);if(!b)fail(400,'Choose a supported Nigerian bank.');const d=await provider(env,'/bank/resolve?account_number='+accountNumber+'&bank_code='+encodeURIComponent(bankCode));if(d.account_number!==accountNumber||typeof d.account_name!=='string'||!d.account_name.trim())fail(422,'The bank account could not be confirmed.');return {bankName:b.name,accountName:d.account_name.trim()};}
export async function paymentAction({db,user,env,request,body,path,passwordHash}){
 const mode=requireProvider(env).mode;
 await run(db,'DELETE FROM paystack_bank_tokens WHERE expires_at<=?',Date.now());
 if(path==='payments/banks'&&request.method==='GET')return {banks:await banks(env)};
 if(path==='payments/bank/resolve'){
  if(body.consent!==true)fail(400,'Agree to bank-account verification first.');const d=await resolve(env,body.bankCode,body.accountNumber),token=crypto.randomUUID();await run(db,'INSERT INTO paystack_bank_tokens (hash,user_id,bank_code,account_number,account_name,bank_name,mode,expires_at) VALUES (?,?,?,?,?,?,?,?)',await hash(token),user.id,body.bankCode,body.accountNumber,d.accountName,d.bankName,mode,Date.now()+600000);return {...d,token,last4:body.accountNumber.slice(-4)};
 }
 if(path==='payments/bank/save'){
  const profile=await first(db,"SELECT * FROM live_profiles WHERE user_id=? AND role='worker' AND suspended=0",user.id);if(!profile)fail(403,'Create a worker profile first.');
  if(body.consent!==true)fail(400,'Confirm that this is your account and approve Paystack settlement.');if(typeof body.password!=='string'||!safeEqual(await passwordHash(body.password,user.password_salt),user.password_hash))fail(401,'Confirm your LocHire password.');
  const t=await first(db,'SELECT * FROM paystack_bank_tokens WHERE hash=? AND user_id=? AND mode=? AND expires_at>?',await hash(String(body.token||'')),user.id,mode,Date.now());if(!t)fail(409,'Account confirmation expired. Check your bank details again.');
  const id='BANK-'+await hash(user.id+':'+mode+':'+t.bank_code+':'+t.account_number),old=await first(db,'SELECT * FROM paystack_destinations WHERE id=?',id);if(old?.status==='ready')return {bank:bankPublic(old)};if(old)fail(409,'Bank setup is being checked. Contact support before repeating it.');
  await run(db,"INSERT OR IGNORE INTO paystack_destinations (id,user_id,worker_id,mode,bank_name,account_name,last4,status,created_at) VALUES (?,?,?,?,?,?,?,'creating',?)",id,user.id,profile.id,mode,t.bank_name,t.account_name,t.account_number.slice(-4),now());
  // One claim owns the provider POST, including concurrent requests.
  const claim=crypto.randomUUID(),r=await run(db,"UPDATE paystack_destinations SET claim=? WHERE id=? AND claim IS NULL AND status='creating'",claim,id);if(r.meta?.changes!==1)fail(409,'Bank setup is already in progress.');
  const d=await provider(env,'/subaccount',{business_name:JSON.parse(profile.data).name,bank_code:t.bank_code,account_number:t.account_number,percentage_charge:0,description:'LocHire worker settlement',primary_contact_email:user.email});
  if(!/^ACCT_[a-zA-Z0-9]+$/.test(d.subaccount_code||''))fail(503,'Bank setup is waiting for provider confirmation.');
  await db.batch([db.prepare("UPDATE paystack_destinations SET status='ready',subaccount=? WHERE id=? AND claim=?").bind(d.subaccount_code,id,claim),db.prepare('DELETE FROM paystack_bank_tokens WHERE user_id=?').bind(user.id)]);
  return {bank:bankPublic(await first(db,'SELECT * FROM paystack_destinations WHERE id=?',id))};
 }
 if(path==='payments/checkout'){
  const g=await work(db,user,body.engagementId,true),d=g.details;if(!['Confirmed','Completed'].includes(g.status)||!d.terms||d.confirmations?.[g.worker_id]!==d.version||d.confirmations?.[g.employer_id]!==d.version)fail(409,'Both participants must confirm the work details before payment.');
  if(body.version!==d.version)fail(409,'Work details changed. Review the latest price before paying.');
  const period=d.terms.basis==='Per task'?'once':valid(body.period,/^[A-Za-z0-9][A-Za-z0-9 .\/-]{1,59}$/,'payment period');
  const reference='LHPS-'+(await hash(g.id+':'+d.version+':'+mode+':'+period.toLowerCase())).slice(0,40);
  const old=await first(db,'SELECT * FROM paystack_payments WHERE reference=?',reference);if(old){if(old.status==='success'||old.status==='reversed')fail(409,'This work period already has a completed payment.');if(old.checkout_url)return {payment:paymentPublic(old),checkoutUrl:old.checkout_url};return {payment:paymentPublic(old),checkoutUrl:null,message:'This payment is being checked. Check its status before trying again.'};}
  const target=await first(db,"SELECT * FROM paystack_destinations WHERE worker_id=? AND mode=? AND status='ready' ORDER BY created_at DESC LIMIT 1",g.worker_id,mode);if(!target)fail(409,'The worker needs to connect a bank account in Payments first.');
  const amount=Math.round(Number(d.terms.pay)*100);if(!Number.isSafeInteger(amount)||amount<10000||amount>100000000)fail(400,'Online payment supports agreed amounts from ₦100 to ₦1,000,000.');
  const at=now(),claim=crypto.randomUUID();await run(db,"INSERT OR IGNORE INTO paystack_payments (reference,engagement_id,payer,recipient,amount,mode,terms_version,period,subaccount,status,created_at,claim) VALUES (?,?,?,?,?,?,?,?,?,'initializing',?,?)",reference,g.id,g.employer_id,g.worker_id,amount,mode,d.version,period,target.subaccount,at,claim);
  const row=await first(db,'SELECT * FROM paystack_payments WHERE reference=?',reference);if(row.claim!==claim)fail(409,'A checkout for this work is already being created.');
  const result=await provider(env,'/transaction/initialize',{email:user.email,amount,currency:'NGN',reference,subaccount:target.subaccount,transaction_charge:0,bearer:'subaccount',callback_url:env.APP_ORIGIN+'/?payment_reference='+reference+'#wallet',metadata:{engagement_id:g.id,terms_version:d.version,period}});
  let url;try{url=new URL(result.authorization_url);}catch{fail(503,'Checkout is awaiting confirmation.');}if(url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||result.reference!==reference)fail(503,'Checkout could not be validated.');
  await run(db,"UPDATE paystack_payments SET checkout_url=?,status=CASE WHEN status='initializing' THEN 'pending' ELSE status END WHERE reference=?",url.href,reference);
  return {payment:paymentPublic(await first(db,'SELECT * FROM paystack_payments WHERE reference=?',reference)),checkoutUrl:url.href};
 }
 if(path==='payments/verify'){
  const ref=valid(body.reference,/^LHPS-[a-f0-9]{40}$/,'payment reference'),row=await first(db,'SELECT * FROM paystack_payments WHERE reference=? AND mode=?',ref,mode);if(!row)fail(404,'Payment not found.');await work(db,user,row.engagement_id);return {payment:paymentPublic(await reconcile(db,env,row))};
 }
 fail(404,'Payment endpoint not found.');
}
async function reconcile(db,env,row){
 const d=await provider(env,'/transaction/verify/'+encodeURIComponent(row.reference));
 const sub=typeof d.subaccount==='string'?d.subaccount:d.subaccount?.subaccount_code;
 if(d.reference!==row.reference||d.amount!==row.amount||d.currency!=='NGN'||d.domain!==row.mode||sub!==row.subaccount)fail(409,'Payment verification does not match the saved agreement. Contact support.');
 if(d.status==='success'||d.status==='reversed'){
  const status=d.status,at=now(),fee=Number.isSafeInteger(d.fees)&&d.fees>=0?d.fees:null;
  const notification=(profile)=>db.prepare("INSERT OR IGNORE INTO live_notifications (id,user_id,kind,title,engagement_id,created_at) SELECT ?,user_id,'payment',?,?,? FROM live_profiles WHERE id=?").bind('PS-'+row.reference+'-'+status+'-'+profile,status==='success'?'Payment confirmed by Paystack':'Payment reversed by Paystack',row.engagement_id,at,profile);
  await db.batch([db.prepare("UPDATE paystack_payments SET status=?,paid_at=COALESCE(paid_at,?),fees=? WHERE reference=? AND (status!='reversed' OR ?='reversed')").bind(status,d.paid_at||at,fee,row.reference,status),notification(row.payer),notification(row.recipient)]);
 }else if(['failed','abandoned'].includes(d.status))await run(db,"UPDATE paystack_payments SET status=? WHERE reference=? AND status NOT IN ('success','reversed')",d.status,row.reference);
 return first(db,'SELECT * FROM paystack_payments WHERE reference=?',row.reference);
}
export async function paystackWebhook(db,request,raw,env){
 requireProvider(env);const signature=request.headers.get('x-paystack-signature');if(!/^[a-f0-9]{128}$/.test(signature||''))fail(401,'Invalid payment signature.');const key=await crypto.subtle.importKey('raw',encoder.encode(env.PAYSTACK_SECRET_KEY),{name:'HMAC',hash:'SHA-512'},false,['sign']);const expected=hex(await crypto.subtle.sign('HMAC',key,encoder.encode(raw)));if(!safeEqual(expected,signature))fail(401,'Invalid payment signature.');
 let event;try{event=JSON.parse(raw);}catch{fail(400,'Invalid payment event.');}
 if(!['charge.success','refund.processed','charge.dispute.create','charge.dispute.resolve'].includes(event.event))return {received:true};
 const ref=event.data?.reference||event.data?.transaction?.reference||event.data?.transaction_reference;if(typeof ref!=='string')return {received:true};const row=await first(db,'SELECT * FROM paystack_payments WHERE reference=? AND mode=?',ref,paymentReadiness(env).mode);if(!row)return {received:true};
 // The signed event only triggers authoritative verification; it never credits a wallet.
 await reconcile(db,env,row);return {received:true};
}
