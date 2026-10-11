import {PaystackError,paymentReadiness,provider,banks,resolve,safeEqual} from './paystack.mjs';
const fail=(status,message)=>{throw new PaystackError(status,message);};
const first=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const all=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
const run=(db,sql,...v)=>db.prepare(sql).bind(...v).run();
const now=()=>new Date().toISOString();
const modeOf=env=>paymentReadiness(env).mode;
const amount=v=>{if(!Number.isSafeInteger(v)||v<10000||v>100000000)fail(400,'Enter an amount from ₦100 to ₦1,000,000.');return v;};
const requestId=v=>{if(typeof v!=='string'||!/^[-a-zA-Z0-9]{16,70}$/.test(v))fail(400,'Refresh this form and try again.');return v;};
const plusDays=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString();
const monthEnd=date=>{const d=new Date(date),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString();};
const pubOrder=r=>({reference:r.reference,kind:r.kind,amount:r.amount,status:r.status,createdAt:r.created_at,paidAt:r.paid_at});
export async function commercialSettings(db){const s=await first(db,"SELECT * FROM lh_commerce_settings WHERE id='main'");return {commissionBps:s?.commission_bps||0,premiumAmount:s?.premium_amount||0,planCode:s?.plan_code||null,planAmount:s?.plan_amount||null};}
export async function billingState(db,user,env){
 const mode=modeOf(env),settings=await commercialSettings(db);
 if(!user)return {commerce:{commissionBps:settings.commissionBps,premiumAmount:settings.premiumAmount},credits:null,premium:null};
 const held=(await first(db,"SELECT COALESCE(SUM(amount),0) AS n FROM lh_dispute_holds WHERE user_id=? AND mode=? AND status='held'",user.id,mode)).n;
 const balance=(await first(db,'SELECT balance FROM lh_credit_balances WHERE user_id=? AND mode=?',user.id,mode))?.balance||0;
 const m=await first(db,'SELECT * FROM lh_memberships WHERE user_id=? AND mode=?',user.id,mode);
 return {commerce:{commissionBps:settings.commissionBps,premiumAmount:settings.premiumAmount,recurringReady:settings.planAmount===settings.premiumAmount&&!!settings.planCode},credits:{balance:balance-held,held,history:await all(db,'SELECT kind,amount,reference,created_at AS createdAt FROM lh_credit_entries WHERE user_id=? AND mode=? ORDER BY created_at DESC LIMIT 50',user.id,mode),orders:(await all(db,'SELECT * FROM lh_orders WHERE user_id=? AND mode=? ORDER BY created_at DESC LIMIT 30',user.id,mode)).map(pubOrder)},premium:m?{active:m.expires_at>now()&&held===0,expiresAt:m.expires_at,renewalStatus:m.renewal_status,canManage:!!m.subscription_code}:null};
}
async function initialize(db,user,env,body,kind){
 const mode=modeOf(env),claim=requestId(body.requestId),settings=await commercialSettings(db);
 const fee=kind==='topup'?amount(body.amount):settings.premiumAmount;
 if(kind!=='topup'&&!fee)fail(409,'Premium listings are awaiting pricing setup.');
 if(kind!=='topup'&&body.amount!==fee)fail(409,'Premium pricing changed. Refresh before paying.');
 if(kind==='recurring'&&(!settings.planCode||settings.planAmount!==fee))fail(409,'Monthly renewal is awaiting activation.');
 if(body.consent!==true)fail(400,'Review and approve this payment first.');
 if(kind!=='topup'&&(await first(db,'SELECT subscription_code FROM lh_memberships WHERE user_id=? AND mode=?',user.id,mode))?.subscription_code)fail(409,'Manage your current monthly subscription before starting another.');
 const old=await first(db,'SELECT * FROM lh_orders WHERE user_id=? AND mode=? AND claim=?',user.id,mode,claim);
 if(old){if(old.kind!==kind||old.amount!==fee)fail(409,'This request belongs to a different payment.');return {order:pubOrder(old),checkoutUrl:old.checkout_url,message:old.checkout_url?'Continue your saved checkout.':'Payment is being checked. Use Check status before starting another.'};}
 const ref='LHCR-'+crypto.randomUUID().replaceAll('-',''),at=now();
 const inserted=await run(db,"INSERT OR IGNORE INTO lh_orders(reference,user_id,mode,kind,amount,status,plan_code,created_at,claim) VALUES(?,?,?,?,?,'initializing',?,?,?)",ref,user.id,mode,kind,fee,kind==='recurring'?settings.planCode:null,at,claim);
 if(inserted.meta?.changes!==1)fail(409,'Checkout is already being created.');
 let r;try{r=await provider(env,'/transaction/initialize',{email:user.email,amount:fee,currency:'NGN',reference:ref,callback_url:env.APP_ORIGIN+'/?credit_reference='+ref+'#wallet',...(kind==='recurring'?{plan:settings.planCode}:{}),metadata:{lochire_user:user.id,lochire_kind:kind}});}catch(e){if(e.status===422)await run(db,"UPDATE lh_orders SET status='failed' WHERE reference=? AND applied=0",ref);throw e;}
 let url;try{url=new URL(r.authorization_url);}catch{fail(503,'Checkout could not be confirmed. Check the saved payment.');}
 if(url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||r.reference!==ref)fail(503,'Checkout could not be validated.');
 await run(db,"UPDATE lh_orders SET checkout_url=?,status=CASE WHEN status='initializing' THEN 'pending' ELSE status END WHERE reference=?",url.href,ref);
 return {order:pubOrder(await first(db,'SELECT * FROM lh_orders WHERE reference=?',ref)),checkoutUrl:url.href};
}
const planCode=d=>typeof d.plan==='string'?d.plan:d.plan?.plan_code||d.plan_object?.plan_code;
export async function reconcileOrder(db,env,row){
 const d=await provider(env,'/transaction/verify/'+encodeURIComponent(row.reference));
 const user=await first(db,'SELECT email FROM users WHERE id=?',row.user_id);
 if(d.reference!==row.reference||d.amount!==row.amount||d.currency!=='NGN'||d.domain!==row.mode||d.customer?.email?.toLowerCase()!==user.email||((typeof d.subaccount==='string'?d.subaccount:d.subaccount?.subaccount_code))||(row.plan_code&&planCode(d)!==row.plan_code))fail(409,'Payment verification does not match your saved purchase.');
 const at=now(),paid=d.paid_at||at,fee=Number.isSafeInteger(d.fees)&&d.fees>=0?d.fees:0;
 if(d.status==='success'){
  // The applied flag and every credit/revenue entry share one database transaction.
  // Its unique reference is the gate, so parallel callbacks cannot double-credit.
  if(!Number.isFinite(Date.parse(paid)))fail(409,'Payment date could not be confirmed.');
  const condition="EXISTS(SELECT 1 FROM lh_orders WHERE reference=? AND applied=0 AND reversed=0 AND status='success')";
  const batch=[db.prepare("UPDATE lh_orders SET status='success',paid_at=COALESCE(paid_at,?),fees=? WHERE reference=? AND reversed=0").bind(paid,fee,row.reference)];
  if(row.kind==='topup')batch.push(db.prepare('INSERT INTO lh_credit_balances(user_id,mode,balance) SELECT ?,?,? WHERE '+condition+' ON CONFLICT(user_id,mode) DO UPDATE SET balance=balance+excluded.balance').bind(row.user_id,row.mode,row.amount,row.reference),db.prepare('INSERT OR IGNORE INTO lh_credit_entries SELECT ?,?,?,?,?,?,? WHERE '+condition).bind(row.reference+'-credit',row.user_id,row.mode,row.amount,'topup',row.reference,at,row.reference));
  else{
   const expires=row.kind==='recurring'?monthEnd(paid):plusDays(paid,30);
   batch.push(db.prepare('INSERT INTO lh_memberships(user_id,mode,expires_at,renewal_status,customer_code,plan_code) SELECT ?,?,?,?,?,? WHERE '+condition+" ON CONFLICT(user_id,mode) DO UPDATE SET expires_at=CASE WHEN excluded.renewal_status='manual' THEN strftime('%Y-%m-%dT%H:%M:%fZ',MAX(expires_at,?),'+30 days') ELSE MAX(expires_at,excluded.expires_at) END,customer_code=COALESCE(excluded.customer_code,customer_code),plan_code=COALESCE(excluded.plan_code,plan_code),renewal_status=excluded.renewal_status").bind(row.user_id,row.mode,expires,row.kind==='recurring'?'active':'manual',d.customer?.customer_code||null,row.plan_code,row.reference,paid),db.prepare('INSERT OR IGNORE INTO lh_platform_entries SELECT ?,?,?,?,?,? WHERE '+condition).bind(row.reference+'-revenue',row.mode,row.amount,'premium',row.reference,at,row.reference));
  }
  batch.push(db.prepare('INSERT OR IGNORE INTO lh_platform_entries SELECT ?,?,?,?,?,? WHERE '+condition).bind(row.reference+'-fee',row.mode,-fee,'provider_fee',row.reference,at,row.reference),db.prepare('UPDATE lh_orders SET applied=1 WHERE reference=? AND status=\'success\' AND reversed=0').bind(row.reference));
  await db.batch(batch);
 }else if(d.status==='reversed')await reverseOrder(db,row,'reversed');
 else if(['failed','abandoned'].includes(d.status))await run(db,"UPDATE lh_orders SET status=? WHERE reference=? AND applied=0",d.status,row.reference);
 return first(db,'SELECT * FROM lh_orders WHERE reference=?',row.reference);
}
async function reverseOrder(db,row,status){
 const already=(await first(db,'SELECT COALESCE(SUM(amount),0) AS n FROM lh_refund_adjustments WHERE reference=? AND applied=1',row.reference)).n;const remaining=Math.max(0,row.amount-already);
 const at=now(),gate='EXISTS(SELECT 1 FROM lh_orders WHERE reference=? AND applied=1 AND reversed=0)';
 const batch=[];
 if(row.kind==='topup')batch.push(db.prepare('UPDATE lh_credit_balances SET balance=balance-? WHERE user_id=? AND mode=? AND '+gate).bind(remaining,row.user_id,row.mode,row.reference),db.prepare('INSERT OR IGNORE INTO lh_credit_entries SELECT ?,?,?,?,?,?,? WHERE '+gate).bind(row.reference+'-reverse',row.user_id,row.mode,-remaining,'reversal',row.reference,at,row.reference));
 else batch.push(db.prepare('INSERT OR IGNORE INTO lh_platform_entries SELECT ?,?,?,?,?,? WHERE '+gate).bind(row.reference+'-reverse',row.mode,-remaining,'premium_reversal',row.reference,at,row.reference),db.prepare('UPDATE lh_memberships SET expires_at=?,renewal_status=\'payment_reversed\' WHERE user_id=? AND mode=? AND '+gate).bind(at,row.user_id,row.mode,row.reference));
 batch.push(db.prepare('UPDATE lh_orders SET reversed=1,status=? WHERE reference=?').bind(status,row.reference));await db.batch(batch);
}
export async function billingAction({db,user,env,request,body,path}){
 if(!paymentReadiness(env).ready)fail(503,'Wallet funding and premium payments are awaiting Paystack activation.');
 if(request.method!=='POST')fail(405,'Method not allowed.');
 if(path==='payments/topup')return initialize(db,user,env,body,'topup');
 if(path==='payments/premium/checkout')return initialize(db,user,env,body,body.autoRenew===true?'recurring':'premium');
 if(path==='payments/credits/verify'){
  if(typeof body.reference!=='string'||body.reference.length>70)fail(400,'Invalid payment reference.');
  const row=await first(db,'SELECT * FROM lh_orders WHERE reference=? AND user_id=? AND mode=?',body.reference,user.id,modeOf(env));if(!row)fail(404,'Payment not found.');return {order:pubOrder(await reconcileOrder(db,env,row))};
 }
 if(path==='payments/premium/credits'){
  if(await first(db,"SELECT id FROM lh_dispute_holds WHERE user_id=? AND mode=? AND status='held' LIMIT 1",user.id,modeOf(env)))fail(409,'A payment is under review. Balance purchases are paused.');
  const mode=modeOf(env),settings=await commercialSettings(db),fee=settings.premiumAmount,id=requestId(body.requestId),ref='credit-'+id;
  if(body.consent!==true||!fee||body.amount!==fee)fail(409,'Review the current premium price and approve it.');
  const old=await first(db,'SELECT * FROM lh_orders WHERE reference=?',ref);if(old){if(old.user_id!==user.id||old.amount!==fee||old.mode!==mode)fail(409,'This request belongs to a different purchase.');if(old.applied)return {ok:true};}
  const m=await first(db,'SELECT * FROM lh_memberships WHERE user_id=? AND mode=?',user.id,mode);if(m?.subscription_code)fail(409,'Manage your current subscription before buying another.');
  const at=now(),gate="EXISTS(SELECT 1 FROM lh_orders WHERE reference=? AND applied=0 AND status='pending')";
  const entryGate=gate+' AND EXISTS(SELECT 1 FROM lh_credit_entries WHERE id=?)';
  await db.batch([
   db.prepare("INSERT OR IGNORE INTO lh_orders(reference,user_id,mode,kind,amount,status,created_at,claim) VALUES(?,?,?,?,?,'pending',?,?)").bind(ref,user.id,mode,'wallet_premium',fee,at,id),
   db.prepare('INSERT OR IGNORE INTO lh_credit_entries SELECT ?,?,?,?,?,?,? WHERE '+gate+' AND EXISTS(SELECT 1 FROM lh_credit_balances WHERE user_id=? AND mode=? AND balance>=?)').bind(ref,user.id,mode,-fee,'premium',ref,at,ref,user.id,mode,fee),
   db.prepare('UPDATE lh_credit_balances SET balance=balance-? WHERE user_id=? AND mode=? AND '+entryGate).bind(fee,user.id,mode,ref,ref),
   db.prepare("INSERT INTO lh_memberships(user_id,mode,expires_at,renewal_status) SELECT ?,?,?, 'manual' WHERE "+entryGate+" ON CONFLICT(user_id,mode) DO UPDATE SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',MAX(expires_at,?),'+30 days'),renewal_status='manual'").bind(user.id,mode,plusDays(at,30),ref,ref,at),
   db.prepare('INSERT OR IGNORE INTO lh_platform_entries SELECT ?,?,?,?,?,? WHERE '+entryGate).bind(ref,mode,fee,'premium',ref,at,ref,ref),
   db.prepare("UPDATE lh_orders SET applied=1,status='success',paid_at=? WHERE reference=? AND "+entryGate).bind(at,ref,ref,ref)
  ]);
  if(!(await first(db,'SELECT applied FROM lh_orders WHERE reference=?',ref))?.applied)fail(409,'Your balance is too low. Add money or pay with Paystack.');return {ok:true};
 }
 if(path==='payments/premium/manage'){
  const m=await first(db,'SELECT * FROM lh_memberships WHERE user_id=? AND mode=?',user.id,modeOf(env));if(!m?.subscription_code)fail(409,'No monthly subscription is connected.');const r=await provider(env,'/subscription/'+encodeURIComponent(m.subscription_code)+'/manage/link');let url;try{url=new URL(r.link);}catch{fail(503,'Subscription management is temporarily unavailable.');}if(url.protocol!=='https:'||!['paystack.com','www.paystack.com'].includes(url.hostname))fail(503,'Subscription link could not be validated.');return {url:url.href};
 }
 fail(404,'Payment route not found.');
}
export async function recordWorkRevenue(db,row,status){
 const at=now();if(status==='success'&&row.platform_fee>0)await run(db,'INSERT OR IGNORE INTO lh_platform_entries VALUES(?,?,?,?,?,?)',row.reference+'-commission',row.mode,row.platform_fee,'work_fee',row.reference,at);
 if(status==='reversed')await run(db,"INSERT OR IGNORE INTO lh_platform_entries SELECT ?,?, -SUM(amount),'work_fee_reversal',?,? FROM lh_platform_entries WHERE reference=? AND kind IN ('work_fee','work_fee_refund')",row.reference+'-commission-reverse',row.mode,row.reference,at,row.reference);
}
async function checkPassword(user,body,passwordHash){if(typeof body.password!=='string'||!safeEqual(await passwordHash(body.password,user.password_salt),user.password_hash))fail(401,'Confirm your LocHire password.');}
const terminal=['success','failed','reversed','abandoned','rejected'];
const pubWithdrawal=r=>({reference:r.reference,amount:r.amount,status:r.status,actualFee:r.actual_fee,createdAt:r.created_at,needsOtp:r.status==='otp'});
export async function financeOverview(db,env,fetchBalance=false){
 const mode=modeOf(env),settings=await commercialSettings(db),ready=paymentReadiness(env).ready;
 const totals=await first(db,"SELECT COALESCE(SUM(amount),0) AS net,COALESCE(SUM(CASE WHEN kind='premium' THEN amount ELSE 0 END),0) AS premium,COALESCE(SUM(CASE WHEN kind='work_fee' THEN amount ELSE 0 END),0) AS fees,COALESCE(-SUM(CASE WHEN kind='provider_fee' THEN amount ELSE 0 END),0) AS providerFees FROM lh_platform_entries WHERE mode=?",mode);
 const liability=(await first(db,'SELECT COALESCE(SUM(MAX(balance,0)),0) AS n FROM lh_credit_balances WHERE mode=?',mode)).n;
 const pendingTopups=(await first(db,"SELECT COALESCE(SUM(amount),0) AS n FROM lh_orders WHERE mode=? AND kind='topup' AND applied=0 AND status IN ('initializing','pending')",mode)).n;
 const used=(await first(db,"SELECT COALESCE(SUM(amount+COALESCE(actual_fee,reserve_fee)),0) AS n FROM lh_withdrawals WHERE mode=? AND status NOT IN ('failed','reversed','abandoned','rejected')",mode)).n;
 let providerBalance=null,balanceError='';
 if(fetchBalance&&ready)try{const b=await provider(env,'/balance');providerBalance=b.find(x=>x.currency==='NGN')?.balance;if(!Number.isSafeInteger(providerBalance)||providerBalance<0)throw Error();}catch{providerBalance=null;balanceError='Paystack balance could not be read. Withdrawals stay unavailable until it can be confirmed.';}
 const held=(await first(db,"SELECT COALESCE(SUM(amount),0) AS n FROM lh_dispute_holds WHERE mode=? AND status='held'",mode)).n;
 const available=providerBalance===null?null:Math.max(0,Math.min(totals.net-used-held,providerBalance-liability-pendingTopups)-100000);
 const bank=await first(db,'SELECT bank_name AS bankName,account_name AS accountName,last4 FROM lh_payout_bank WHERE mode=?',mode);
 return {ready,mode,settings:{commissionBps:settings.commissionBps,premiumAmount:settings.premiumAmount,recurringReady:!!settings.planCode&&settings.planAmount===settings.premiumAmount},totals,liability,pendingTopups,held,providerBalance,balanceError,available,feeBuffer:100000,bank,orders:await all(db,'SELECT o.reference,o.kind,o.amount,o.status,o.created_at AS createdAt,u.name FROM lh_orders o JOIN users u ON u.id=o.user_id WHERE o.mode=? ORDER BY o.created_at DESC LIMIT 50',mode),withdrawals:(await all(db,'SELECT * FROM lh_withdrawals WHERE mode=? ORDER BY created_at DESC LIMIT 30',mode)).map(pubWithdrawal),transactions:await all(db,'SELECT kind,amount,reference,created_at AS createdAt FROM lh_platform_entries WHERE mode=? ORDER BY created_at DESC LIMIT 50',mode)};
}
export async function financeAction({db,user,env,request,body,path,passwordHash}){
 if(path==='admin/finance'&&request.method==='GET')return financeOverview(db,env,true);
 if(request.method!=='POST')fail(405,'Method not allowed.');
 await checkPassword(user,body,passwordHash);
 const mode=modeOf(env);
 if(path==='admin/finance/settings'){
  const bps=body.commissionBps,price=body.premiumAmount;
  if(!Number.isSafeInteger(bps)||bps<0||bps>2000||!Number.isSafeInteger(price)||price<0||price>10000000||(price>0&&price<10000))fail(400,'Choose a fee from 0–20% and a premium price from ₦100–₦100,000, or zero to pause it.');
  await run(db,"INSERT INTO lh_commerce_settings(id,commission_bps,premium_amount,updated_at) VALUES('main',?,?,?) ON CONFLICT(id) DO UPDATE SET commission_bps=excluded.commission_bps,premium_amount=excluded.premium_amount,updated_at=excluded.updated_at",bps,price,now());return {ok:true};
 }
 if(!paymentReadiness(env).ready)fail(503,'Payments are awaiting Paystack activation.');
 if(path==='admin/finance/order/verify'){const r=await first(db,'SELECT * FROM lh_orders WHERE reference=? AND mode=?',String(body.reference||''),mode);if(!r||r.kind==='wallet_premium')fail(404,'Paystack order not found.');return {order:pubOrder(await reconcileOrder(db,env,r))};}
 if(path==='admin/finance/plan'){
  const settings=await commercialSettings(db);if(!settings.premiumAmount)fail(409,'Set your premium price first.');
  if(settings.planCode&&settings.planAmount===settings.premiumAmount)return {ok:true};
  const r=await provider(env,'/plan',{name:'LocHire Premium '+settings.premiumAmount,interval:'monthly',amount:settings.premiumAmount,currency:'NGN'});if(!/^PLN_[a-zA-Z0-9]+$/.test(r.plan_code||''))fail(503,'Plan could not be confirmed.');await run(db,"UPDATE lh_commerce_settings SET plan_code=?,plan_amount=? WHERE id='main' AND premium_amount=?",r.plan_code,settings.premiumAmount,settings.premiumAmount);return {ok:true};
 }
 if(path==='admin/finance/bank/resolve'){
  if(body.consent!==true)fail(400,'Approve bank verification first.');const r=await resolve(env,body.bankCode,body.accountNumber),token=crypto.randomUUID();const bytes=new TextEncoder().encode(token),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');await run(db,'INSERT INTO paystack_bank_tokens VALUES(?,?,?,?,?,?,?,?)',hash,user.id,body.bankCode,body.accountNumber,r.accountName,r.bankName,mode,Date.now()+600000);return {...r,token,last4:body.accountNumber.slice(-4)};
 }
 if(path==='admin/finance/bank/save'){
  if(body.consent!==true)fail(400,'Confirm this payout account first.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(body.token||'')))),n=>n.toString(16).padStart(2,'0')).join('');const t=await first(db,'SELECT * FROM paystack_bank_tokens WHERE hash=? AND user_id=? AND mode=? AND expires_at>?',hash,user.id,mode,Date.now());if(!t)fail(409,'Account confirmation expired.');
  const r=await provider(env,'/transferrecipient',{type:'nuban',name:t.account_name,account_number:t.account_number,bank_code:t.bank_code,currency:'NGN'});if(!/^RCP_[a-zA-Z0-9]+$/.test(r.recipient_code||'')||r.details?.account_number!==t.account_number||r.details?.bank_code!==t.bank_code||r.currency!=='NGN')fail(409,'Payout account could not be confirmed.');await db.batch([db.prepare('INSERT INTO lh_payout_bank VALUES(?,?,?,?,?,?) ON CONFLICT(mode) DO UPDATE SET recipient_code=excluded.recipient_code,bank_name=excluded.bank_name,account_name=excluded.account_name,last4=excluded.last4,updated_at=excluded.updated_at').bind(mode,r.recipient_code,t.bank_name,t.account_name,t.account_number.slice(-4),now()),db.prepare('DELETE FROM paystack_bank_tokens WHERE hash=?').bind(hash)]);return {ok:true};
 }
 if(path==='admin/finance/withdraw'){
  if(body.consent!==true)fail(400,'Review and approve the withdrawal.');const value=amount(body.amount),rid=requestId(body.requestId),ref='lhwd-'+rid.toLowerCase().replaceAll('-','').slice(0,40);
  const old=await first(db,'SELECT * FROM lh_withdrawals WHERE reference=?',ref);if(old){if(old.owner_id!==user.id||old.amount!==value)fail(409,'This request belongs to another withdrawal.');return {withdrawal:pubWithdrawal(old)};}
  const current=await financeOverview(db,env,true);if(current.available===null||value>current.available)fail(409,'Only confirmed, available LocHire earnings can be withdrawn.');
  const bank=await first(db,'SELECT * FROM lh_payout_bank WHERE mode=?',mode);if(!bank)fail(409,'Connect your payout bank first.');
  if(await first(db,"SELECT reference FROM lh_withdrawals WHERE mode=? AND status NOT IN ('success','failed','reversed','abandoned','rejected')",mode))fail(409,'Check the pending withdrawal before starting another.');
  const at=now();try{await run(db,"INSERT INTO lh_withdrawals VALUES(?,?,?,?,?,?, 'initializing',NULL,NULL,?,?)",ref,user.id,mode,value,current.feeBuffer,bank.recipient_code,at,at);}catch{fail(409,'A withdrawal is already being created.');}
  let r;try{r=await provider(env,'/transfer',{source:'balance',amount:value,recipient:bank.recipient_code,reference:ref,currency:'NGN',reason:'LocHire fees and premium earnings'});}catch(e){if(e.status===422)await run(db,"UPDATE lh_withdrawals SET status='failed',updated_at=? WHERE reference=? AND status='initializing'",now(),ref);throw e;}await saveTransfer(db,env,await first(db,'SELECT * FROM lh_withdrawals WHERE reference=?',ref),r);return {withdrawal:pubWithdrawal(await first(db,'SELECT * FROM lh_withdrawals WHERE reference=?',ref))};
 }
 if(['admin/finance/withdraw/verify','admin/finance/withdraw/otp'].includes(path)){
  const row=await first(db,'SELECT * FROM lh_withdrawals WHERE reference=? AND mode=?',String(body.reference||''),mode);if(!row)fail(404,'Withdrawal not found.');
  if(path.endsWith('/otp')){if(row.status!=='otp'||!row.transfer_code)fail(409,'This withdrawal does not need an OTP.');if(typeof body.otp!=='string'||!/^\d{4,10}$/.test(body.otp))fail(400,'Enter the OTP sent by Paystack.');await provider(env,'/transfer/finalize_transfer',{transfer_code:row.transfer_code,otp:body.otp});}
  const r=await provider(env,'/transfer/verify/'+encodeURIComponent(row.reference));await saveTransfer(db,env,row,r);return {withdrawal:pubWithdrawal(await first(db,'SELECT * FROM lh_withdrawals WHERE reference=?',row.reference))};
 }
 fail(404,'Finance route not found.');
}
async function saveTransfer(db,env,row,d){
 let recipient=typeof d.recipient==='string'?d.recipient:d.recipient?.recipient_code;
 if(typeof d.recipient==='number'||/^\d+$/.test(String(d.recipient||''))){const r=await provider(env,'/transferrecipient/'+encodeURIComponent(d.recipient));if(r.currency!=='NGN'||r.domain!==row.mode)fail(409,'Withdrawal destination could not be confirmed.');recipient=r.recipient_code;}
 if(d.reference!==row.reference||d.amount!==row.amount||d.currency!=='NGN'||d.domain!==row.mode||recipient!==row.recipient_code)fail(409,'Withdrawal verification does not match the saved request.');
 const allowed=['otp','pending','received','processing','success','failed','reversed','abandoned','rejected'];if(!allowed.includes(d.status))fail(503,'Withdrawal status is awaiting provider confirmation.');
 const fee=Number.isSafeInteger(d.fee_charged)&&d.fee_charged>=0?d.fee_charged:null;
 await run(db,"UPDATE lh_withdrawals SET status=?,transfer_code=COALESCE(?,transfer_code),actual_fee=COALESCE(?,actual_fee),updated_at=? WHERE reference=? AND (status NOT IN ('success','reversed') OR ?='reversed' OR status=?)",d.status,d.transfer_code||null,fee,now(),row.reference,d.status,d.status);
}
export async function commerceWebhook(db,env,event){
 const mode=modeOf(env);let ref=event.data?.reference||event.data?.transaction?.reference||event.data?.transaction_reference;
 if(event.event.startsWith('charge.dispute.')){const id=event.data?.id;if(!/^\d+$/.test(String(id||'')))fail(409,'Dispute identifier is missing.');const d=await provider(env,'/dispute/'+id),t=d.transaction;if(d.domain!==mode||t?.domain!==mode||t.currency!=='NGN'||typeof t.reference!=='string')fail(409,'Dispute could not be independently confirmed.');const row=await first(db,'SELECT * FROM lh_orders WHERE reference=? AND mode=?',t.reference,mode),work=await first(db,'SELECT * FROM paystack_payments WHERE reference=? AND mode=?',t.reference,mode);if(!row&&!work)return;const value=row?.amount||work.amount,uid=row?.user_id||null;if(d.status==='resolved'&&d.resolution==='declined')await run(db,"UPDATE lh_dispute_holds SET status='released' WHERE id=?",String(id));else{await run(db,"INSERT INTO lh_dispute_holds VALUES(?,?,?,?,?,'held') ON CONFLICT(id) DO NOTHING",String(id),t.reference,mode,uid,value);}return;}
 if(event.event==='refund.processed'){const refundId=event.data?.id;if(!Number.isSafeInteger(refundId)&&!/^\d+$/.test(String(refundId||'')))fail(409,'Refund identifier is missing.');const r=await provider(env,'/refund/'+refundId);let transaction=r.transaction;if(typeof transaction==='number'||typeof transaction==='string')transaction=await provider(env,'/transaction/'+encodeURIComponent(transaction));if(r.status!=='processed'||r.domain!==mode||r.currency!=='NGN'||transaction.domain!==mode||typeof transaction.reference!=='string'||!Number.isSafeInteger(r.amount)||r.amount<=0)fail(409,'Refund could not be independently confirmed.');return applyRefund(db,mode,transaction.reference,r,refundId);}
 if(event.event.startsWith('transfer.')&&typeof ref==='string'){const r=await first(db,'SELECT * FROM lh_withdrawals WHERE reference=? AND mode=?',ref,mode);if(r)await saveTransfer(db,env,r,await provider(env,'/transfer/verify/'+encodeURIComponent(ref)));return;}
 if(event.event.startsWith('subscription.')){
  const e=event.data,code=e.subscription_code,customer=e.customer?.customer_code,p=typeof e.plan==='string'?e.plan:e.plan?.plan_code;
  if(event.event==='subscription.create'){
   const u=await first(db,"SELECT o.* FROM lh_orders o JOIN users u ON u.id=o.user_id WHERE o.kind='recurring' AND o.mode=? AND o.plan_code=? AND u.email=? ORDER BY o.created_at DESC LIMIT 1",mode,p,e.customer?.email?.toLowerCase());
   if(u&&/^SUB_[a-zA-Z0-9]+$/.test(code||'')){await reconcileOrder(db,env,u);await run(db,"UPDATE lh_memberships SET subscription_code=?,customer_code=?,plan_code=?,renewal_status='active' WHERE user_id=? AND mode=?",code,customer,p,u.user_id,mode);}
  }else if(['subscription.not_renew','subscription.disable'].includes(event.event))await run(db,"UPDATE lh_memberships SET renewal_status='non-renewing' WHERE subscription_code=? AND mode=?",code,mode);
  return;
 }
 if(typeof ref!=='string')return;
 let row=await first(db,'SELECT * FROM lh_orders WHERE reference=? AND mode=?',ref,mode);
 if(!row&&event.event==='charge.success'){
  const d=await provider(env,'/transaction/verify/'+encodeURIComponent(ref)),p=planCode(d),customer=d.customer?.customer_code;
  const m=await first(db,'SELECT * FROM lh_memberships WHERE customer_code=? AND plan_code=? AND mode=? AND subscription_code IS NOT NULL',customer||'',p||'',mode);
  if(m&&d.status==='success'&&Number.isSafeInteger(d.amount)&&d.amount>0&&ref.length<=70){await run(db,"INSERT OR IGNORE INTO lh_orders VALUES(?,?,?,?,?,'pending',NULL,?,?,NULL,NULL,0,0,?)",ref,m.user_id,mode,'recurring',d.amount,p,now(),'renewal-'+ref);row=await first(db,'SELECT * FROM lh_orders WHERE reference=?',ref);}
 }
 if(row){
  if(event.event==='charge.dispute.create')await reverseOrder(db,row,'disputed');
  else if(['charge.success','charge.dispute.resolve'].includes(event.event))await reconcileOrder(db,env,row);
 }
}

async function applyRefund(db,mode,ref,refund,rid){
 const row=await first(db,'SELECT * FROM lh_orders WHERE reference=? AND mode=?',ref,mode),work=await first(db,'SELECT * FROM paystack_payments WHERE reference=? AND mode=?',ref,mode);
 if(!row&&!work)return;
 const id='refund-'+rid,at=now(),total=row?.amount||work.amount;
 if(refund.amount>total)fail(409,'Refund is larger than its original payment.');
 if(row&&!row.applied){await run(db,"UPDATE lh_orders SET reversed=1,status='refunded' WHERE reference=?",ref);return;}
 if(row?.reversed||work?.status==='reversed')return;
 const already=(await first(db,'SELECT COALESCE(SUM(amount),0) AS n FROM lh_refund_adjustments WHERE reference=? AND applied=1',ref)).n;
 if(await first(db,'SELECT id FROM lh_refund_adjustments WHERE id=? AND applied=1',id))return;
 if(already+refund.amount>total)fail(409,'Refund total exceeds the original payment.');
 const gate='EXISTS(SELECT 1 FROM lh_refund_adjustments WHERE id=? AND applied=0)';
 const batch=[db.prepare('INSERT OR IGNORE INTO lh_refund_adjustments VALUES(?,?,?,?,0)').bind(id,ref,mode,refund.amount)];
 if(row?.kind==='topup')batch.push(db.prepare('UPDATE lh_credit_balances SET balance=balance-? WHERE user_id=? AND mode=? AND '+gate).bind(refund.amount,row.user_id,mode,id),db.prepare('INSERT OR IGNORE INTO lh_credit_entries SELECT ?,?,?,?,?,?,? WHERE '+gate).bind(id,row.user_id,mode,-refund.amount,'refund',ref,at,id));
 else {const reduction=row?refund.amount:Math.min(work.platform_fee,Math.round(work.platform_fee*refund.amount/total));batch.push(db.prepare('INSERT OR IGNORE INTO lh_platform_entries SELECT ?,?,?,?,?,? WHERE '+gate).bind(id,mode,-reduction,row?'premium_refund':'work_fee_refund',ref,at,id));}
 if(row){batch.push(db.prepare("UPDATE lh_orders SET status=?,reversed=? WHERE reference=? AND "+gate).bind(already+refund.amount===total?'refunded':'partially_refunded',already+refund.amount===total?1:0,ref,id));if(row.kind!=='topup')batch.push(db.prepare('UPDATE lh_memberships SET expires_at=? WHERE user_id=? AND mode=? AND '+gate).bind(at,row.user_id,mode,id));}
 batch.push(db.prepare("UPDATE lh_dispute_holds SET status='settled' WHERE reference=? AND "+gate).bind(ref,id));
 batch.push(db.prepare('UPDATE lh_refund_adjustments SET applied=1 WHERE id=?').bind(id));await db.batch(batch);
}
