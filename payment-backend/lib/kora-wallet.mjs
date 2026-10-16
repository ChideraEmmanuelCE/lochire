import {KoraError,koraApi,queryCharge,toKobo} from './korapay.mjs';
import {commercialSettings} from './commerce.mjs';
import {safeEqual} from './paystack.mjs';

const fail=(s,m)=>{throw new KoraError(s,m);};
const one=(db,s,...v)=>db.prepare(s).bind(...v).first();
const all=async(db,s,...v)=>(await db.prepare(s).bind(...v).all()).results;
const run=(db,s,...v)=>db.prepare(s).bind(...v).run();
const at=()=>new Date().toISOString();
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),n=>n.toString(16).padStart(2,'0')).join('');
const reference=v=>{if(typeof v!=='string'||!/^[-A-Za-z0-9_]{5,120}$/.test(v))fail(400,'Invalid sandbox reference.');return v;};
const requestId=v=>{if(typeof v!=='string'||!/^[-A-Za-z0-9]{16,70}$/.test(v))fail(400,'Refresh the form before trying again.');return v;};
const amount=v=>{if(!Number.isSafeInteger(v)||v<10000||v>100000000)fail(400,'Use a test amount from ₦100 to ₦1,000,000.');return v;};
const allowedEmails=env=>new Set([env.ADMIN_EMAILS,env.KORAPAY_TESTER_EMAILS].filter(Boolean).join(',').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
export function koraSandboxAvailable(user,env){return !!user&&env.KORAPAY_SANDBOX_WALLET_ENABLED==='true'&&env.KORAPAY_MODE==='test'&&allowedEmails(env).has(user.email.toLowerCase());}
async function permitted(db,user,env,readOnly=false){
 if(!koraSandboxAvailable(user,env))fail(403,'This sandbox is private to approved test accounts. Live wallet funding is disabled.');
 if(!(await one(db,'SELECT email_verified_at FROM live_account_settings WHERE user_id=?',user.id))?.email_verified_at)fail(403,'Verify your LocHire email before testing payments.');
 if(!readOnly&&(await one(db,'SELECT frozen FROM kora_test_wallets WHERE user_id=?',user.id))?.frozen)fail(409,'This test wallet needs reconciliation before more activity.');
}
async function role(db,user,wanted){if((await one(db,'SELECT active_role FROM wallets WHERE user_id=?',user.id))?.active_role!==wanted)fail(403,wanted==='employer'?'Switch to Hiring to add money or make purchases.':'Switch to Finding work to withdraw earnings.');}
async function password(user,body,passwordHash){if(typeof body.password!=='string'||!safeEqual(await passwordHash(body.password,user.password_salt),user.password_hash))fail(401,'Confirm your LocHire password.');}
const consent=body=>{if(body.consent!==true)fail(400,'Approve this simulated operation first.');};
const pubOperation=r=>({reference:r.id,kind:r.kind,amount:r.amount,status:r.status,createdAt:r.created_at});
const pubAccount=r=>r?{reference:r.reference,number:r.account_number,name:r.account_name,bank:r.bank_name,status:r.status}:null;
const gate="EXISTS(SELECT 1 FROM kora_test_operations WHERE id=? AND status='applying')";
const entry=(db,id,user,bucket,kind,value,ref,time,condition=gate)=>db.prepare('INSERT OR IGNORE INTO kora_test_entries SELECT ?,?,?,?,?,?,? WHERE '+condition).bind(id,user,bucket,kind,value,ref,time,ref);

// Read-only public connectivity probe: cached for one minute, no account data.
export async function checkKoraTestConnection(db,env){
 if(env.KORAPAY_MODE!=='test'||env.KORAPAY_SANDBOX_WALLET_ENABLED!=='true')fail(503,'Kora sandbox testing is disabled.');
 const id='KORA-TEST-CONNECTION',cutoff=new Date(Date.now()-60000).toISOString(),time=at();
 let row=await one(db,'SELECT * FROM bank_events WHERE id=?',id);
 if(row&&row.created_at>cutoff)return {verified:row.state==='verified',mode:'test',status:row.state};
 if(!row){const r=await run(db,"INSERT OR IGNORE INTO bank_events VALUES(?,?,'checking',?)",id,id,time);if(r.meta?.changes!==1)return {verified:false,mode:'test',status:'checking'};}
 else {const r=await run(db,"UPDATE bank_events SET state='checking',created_at=? WHERE id=? AND created_at<=?",time,id,cutoff);if(r.meta?.changes!==1)return {verified:false,mode:'test',status:'checking'};}
 try{const banks=await koraApi(env,'/misc/banks?countryCode=NG');if(!Array.isArray(banks)||!banks.length)fail(503,'Kora returned an unexpected bank list.');await run(db,"UPDATE bank_events SET state='verified' WHERE id=?",id);return {verified:true,mode:'test',status:'verified'};}
 catch(error){const status=['credentials_rejected','provider_access_denied','provider_request_rejected','provider_unreachable','provider_unavailable'].includes(error.code)?error.code:'provider_unavailable';await run(db,'UPDATE bank_events SET state=? WHERE id=?',status,id);return {verified:false,mode:'test',status};}
}

export async function koraWalletState(db,user,env){
 await permitted(db,user,env,true);
 const wallet=await one(db,'SELECT * FROM kora_test_wallets WHERE user_id=?',user.id);
 const premium=await one(db,'SELECT expires_at FROM kora_test_memberships WHERE user_id=?',user.id);
 const settings=await commercialSettings(db);
 return {sandbox:true,currency:'TEST-NGN',funds:wallet?.funds||0,earnings:wallet?.earnings||0,account:pubAccount(await one(db,'SELECT * FROM kora_test_accounts WHERE user_id=?',user.id)),premiumUntil:premium?.expires_at||null,premiumAmount:settings.premiumAmount||100000,commissionBps:settings.commissionBps,operations:(await all(db,'SELECT * FROM kora_test_operations WHERE user_id=? ORDER BY created_at DESC LIMIT 40',user.id)).map(pubOperation),history:await all(db,'SELECT bucket,kind,amount,reference,created_at AS createdAt FROM kora_test_entries WHERE user_id=? ORDER BY created_at DESC LIMIT 60',user.id),deposits:await all(db,'SELECT reference,gross,fee,net,created_at AS createdAt FROM kora_test_deposits WHERE user_id=? AND applied=1 ORDER BY created_at DESC LIMIT 30',user.id)};
}

async function saveAccount(db,row,d){
 if(d.account_reference!==row.reference||d.currency!=='NGN'||d.account_status!=='active'||!/^\d{10}$/.test(d.account_number||'')||typeof d.account_name!=='string'||!d.account_name||typeof d.bank_name!=='string'||!d.bank_name)fail(409,'Kora has not confirmed an active sandbox account for this user.');
 await run(db,"UPDATE kora_test_accounts SET account_number=?,account_name=?,bank_name=?,status='active' WHERE user_id=? AND reference=?",d.account_number,d.account_name,d.bank_name,row.user_id,row.reference);
 return pubAccount(await one(db,'SELECT * FROM kora_test_accounts WHERE user_id=?',row.user_id));
}
async function createAccount(db,user,env){
 const existing=await one(db,'SELECT * FROM kora_test_accounts WHERE user_id=?',user.id);
 if(existing){if(existing.status==='active')return pubAccount(existing);return saveAccount(db,existing,await koraApi(env,'/virtual-bank-account/'+encodeURIComponent(existing.reference)));}
 const ref='LHTEST-'+(await hash(user.id)).slice(0,32);
 const inserted=await run(db,"INSERT OR IGNORE INTO kora_test_accounts(user_id,reference,status,created_at) VALUES(?,?,'creating',?)",user.id,ref,at());
 if(inserted.meta?.changes!==1)fail(409,'Account creation is already in progress. Use Check account.');
 // Published Kora sandbox identity fixture; never collect or persist a real BVN.
 const d=await koraApi(env,'/virtual-bank-account',{account_name:'LocHire Test '+user.name,account_reference:ref,permanent:true,bank_code:'000',customer:{name:user.name,email:user.email},kyc:{bvn:'22222222222'}});
 return saveAccount(db,{user_id:user.id,reference:ref},d);
}

export async function applySandboxDeposit(db,env,d,expectedUser=null){
 if(env.KORAPAY_SANDBOX_WALLET_ENABLED!=='true'||env.KORAPAY_MODE!=='test'||!String(env.KORAPAY_SECRET_KEY||'').startsWith('sk_test_'))return false;
 const account=d.virtual_bank_account;
 if(d.status!=='success'||d.currency!=='NGN'||!account)return false;
 const a=await one(db,"SELECT * FROM kora_test_accounts WHERE reference=? AND account_number=? AND status='active'",account.account_reference||'',account.account_number||'');
 if(!a){if(expectedUser)fail(409,'This payment does not belong to your test account.');return false;}
 if(expectedUser&&expectedUser!==a.user_id)fail(403,'This payment belongs to another test account.');
 const ref=reference(d.reference),gross=toKobo(d.amount_paid??d.amount),fee=toKobo(d.fee??0,true),net=gross-fee;
 if(gross>100000000||net<=0)fail(409,'The verified deposit amount is outside the sandbox limits.');
 const previous=await one(db,'SELECT * FROM kora_test_deposits WHERE reference=?',ref);
 if(previous&&(previous.user_id!==a.user_id||previous.gross!==gross||previous.fee!==fee))fail(409,'The deposit changed after verification.');
 const time=at(),condition='EXISTS(SELECT 1 FROM kora_test_deposits WHERE reference=? AND applied=0)';
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO kora_test_deposits VALUES(?,?,?,?,?,0,?)').bind(ref,a.user_id,gross,fee,net,time),
  db.prepare('INSERT INTO kora_test_wallets(user_id,funds) SELECT ?,? WHERE '+condition+' ON CONFLICT(user_id) DO UPDATE SET funds=funds+excluded.funds').bind(a.user_id,net,ref),
  entry(db,'dep-'+ref,a.user_id,'funds','deposit',net,ref,time,condition),
  db.prepare('UPDATE kora_test_deposits SET applied=1 WHERE reference=?').bind(ref)
 ]);return true;
}
async function reconcileDeposits(db,user,env,page=1){
 const account=await one(db,"SELECT * FROM kora_test_accounts WHERE user_id=? AND status='active'",user.id);if(!account)fail(409,'Create your test account first.');
 if(!Number.isSafeInteger(page)||page<1||page>10000)fail(400,'Invalid history page.');
 const d=await koraApi(env,'/virtual-bank-account/transactions?account_number='+account.account_number+'&page='+page+'&limit=20');
 if(d.account_number!==account.account_number||d.currency!=='NGN'||!Array.isArray(d.transactions)||d.transactions.length>20)fail(409,'Kora returned an unexpected account history.');
 const verified=await Promise.all(d.transactions.filter(t=>t.status==='success').map(async t=>{const ref=reference(t.reference),charge=await queryCharge(env,ref);if(charge.reference!==ref)fail(409,'Kora returned a different charge.');return charge;}));
 for(const charge of verified)await applySandboxDeposit(db,env,charge,user.id);
 const pages=Number(d.pagination?.totalPages||d.pagination?.pageCount||1);
 return {checked:d.transactions.length,nextPage:page<pages?page+1:null};
}

async function savedOperation(db,id,user,kind,value,data){
 const old=await one(db,'SELECT * FROM kora_test_operations WHERE id=?',id),raw=JSON.stringify(data);
 if(old&&(old.user_id!==user.id||old.kind!==kind||old.amount!==value||old.data!==raw))fail(409,'This request belongs to a different operation.');
 if(!old)await run(db,"INSERT OR IGNORE INTO kora_test_operations VALUES(?,?,?,?,'pending',?,?,?)",id,user.id,kind,value,raw,at(),at());
 const saved=await one(db,'SELECT * FROM kora_test_operations WHERE id=?',id);
 if(saved.user_id!==user.id||saved.kind!==kind||saved.amount!==value||saved.data!==raw)fail(409,'This request belongs to a different operation.');
 return saved;
}
async function purchase(db,user,env,body,kind){
 const settings=await commercialSettings(db);let value,data,id,worker;
 if(kind==='premium'){
  value=settings.premiumAmount||100000;if(body.amount!==value)fail(409,'Review the current test premium price.');
  data={days:30};id='KPRE-'+await hash(user.id+':'+requestId(body.requestId));
 }else{
  const g=await one(db,'SELECT g.*,p.user_id AS payer_user,w.user_id AS worker_user FROM live_engagements g JOIN live_profiles p ON p.id=g.employer_id JOIN live_profiles w ON w.id=g.worker_id WHERE g.id=? AND p.user_id=?',String(body.engagementId||''),user.id);
  if(!g)fail(404,'Agreed work was not found.');const d=JSON.parse(g.data);
  if(!['Confirmed','Completed'].includes(g.status)||!d.terms||d.confirmations?.[g.worker_id]!==d.version||d.confirmations?.[g.employer_id]!==d.version||body.version!==d.version)fail(409,'Both people must confirm the current work terms before a test payment.');
  worker=await one(db,'SELECT * FROM users WHERE id=?',g.worker_user);if(worker.id===user.id)fail(409,'Use a separate worker account.');await permitted(db,worker,env);
  const period=d.terms.basis==='Per task'?'once':String(body.period||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9 .\/-]{1,59}$/.test(period))fail(400,'Enter the work period being paid.');
  value=amount(Math.round(Number(d.terms.pay)*100));const fee=Math.round(value*settings.commissionBps/10000);
  data={engagementId:g.id,worker:worker.id,version:d.version,period,fee};id='KWORK-'+await hash(g.id+':'+d.version+':'+period);
 }
 const old=await savedOperation(db,id,user,kind,value,data);if(old.status==='applied')return {operation:pubOperation(old)};
 const time=at(),batch=[db.prepare("UPDATE kora_test_operations SET status='applying' WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM kora_test_wallets WHERE user_id=? AND frozen=0 AND funds>=?)").bind(id,user.id,value),db.prepare('UPDATE kora_test_wallets SET funds=funds-? WHERE user_id=? AND '+gate).bind(value,user.id,id),entry(db,id+'-debit',user.id,'funds',kind,-value,id,time)];
 if(kind==='premium')batch.push(db.prepare('INSERT INTO kora_test_memberships SELECT ?,? WHERE '+gate+" ON CONFLICT(user_id) DO UPDATE SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',MAX(expires_at,?),'+30 days')").bind(user.id,new Date(Date.now()+30*86400000).toISOString(),id,time));
 else batch.push(db.prepare('INSERT INTO kora_test_wallets(user_id,earnings) SELECT ?,? WHERE '+gate+' ON CONFLICT(user_id) DO UPDATE SET earnings=earnings+excluded.earnings').bind(worker.id,value-data.fee,id),entry(db,id+'-earnings',worker.id,'earnings','work',value-data.fee,id,time));
 batch.push(db.prepare("UPDATE kora_test_operations SET status='applied',updated_at=? WHERE id=? AND status='applying'").bind(time,id));await db.batch(batch);
 const result=await one(db,'SELECT * FROM kora_test_operations WHERE id=?',id);if(result.status!=='applied')fail(409,'Your test balance is too low. Add simulated money first.');return {operation:pubOperation(result)};
}

export async function reconcileSandboxPayout(db,env,ref,expectedUser=null){
 reference(ref);const row=await one(db,"SELECT * FROM kora_test_operations WHERE id=? AND kind='withdraw'",ref);if(!row)return false;
 if(expectedUser&&row.user_id!==expectedUser)fail(404,'Withdrawal not found.');
 if(!['submitting','processing','unknown','success','failed','reversed'].includes(row.status))return false;
 const d=await koraApi(env,'/transactions/'+encodeURIComponent(ref)),saved=JSON.parse(row.data);
 if(d.reference!==ref||d.currency!=='NGN'||toKobo(d.amount)!==row.amount||d.customer?.email?.toLowerCase()!==saved.email.toLowerCase())fail(409,'Kora payout verification does not match the saved withdrawal.');
 const bank=d.destination?.bank_account;if(bank&&(bank.bank!==saved.bankCode||bank.account!==saved.account))fail(409,'Kora payout destination does not match.');
 if(!['pending','processing','success','failed','reversed'].includes(d.status))fail(503,'Kora has not confirmed a known payout status.');
 const conflict="EXISTS(SELECT 1 FROM kora_test_operations WHERE id=? AND ((status IN ('failed','reversed') AND ?='success') OR (status='success' AND ?='failed')))",time=at();
 const batch=[db.prepare('UPDATE kora_test_wallets SET frozen=1 WHERE user_id=? AND '+conflict).bind(row.user_id,ref,d.status,d.status),db.prepare("UPDATE kora_test_operations SET status='review',updated_at=? WHERE id=? AND "+conflict).bind(time,ref,ref,d.status,d.status)];
 if(['failed','reversed'].includes(d.status)){
  const condition="EXISTS(SELECT 1 FROM kora_test_operations WHERE id=? AND status IN ('submitting','processing','unknown','success'))";
  batch.push(db.prepare('UPDATE kora_test_wallets SET earnings=earnings+? WHERE user_id=? AND '+condition).bind(row.amount,row.user_id,ref),entry(db,ref+'-returned',row.user_id,'earnings','withdrawal_return',row.amount,ref,time,condition),db.prepare("UPDATE kora_test_operations SET status=?,updated_at=? WHERE id=? AND status IN ('submitting','processing','unknown','success')").bind(d.status,time,ref));
 }else batch.push(db.prepare("UPDATE kora_test_operations SET status=?,updated_at=? WHERE id=? AND status IN ('submitting','processing','unknown')").bind(d.status==='pending'?'processing':d.status,time,ref));
 await db.batch(batch);
 if((await one(db,'SELECT status FROM kora_test_operations WHERE id=?',ref)).status==='review')fail(409,'Kora returned contradictory results. The test wallet is paused for review.');
 return true;
}

export async function koraWalletAction({db,user,env,request,body,path,passwordHash}){
 await permitted(db,user,env,request.method==='GET');
 if(path==='payments/kora/state'&&request.method==='GET')return koraWalletState(db,user,env);
 if(request.method!=='POST')fail(405,'Method not allowed.');
 consent(body);
 if(path==='payments/kora/check'){const banks=await koraApi(env,'/misc/banks?countryCode=NG');if(!Array.isArray(banks)||!banks.length)fail(503,'Kora returned an unexpected bank list.');return {verified:true,mode:'test'};}
 if(path==='payments/kora/account'){await role(db,user,'employer');return {account:await createAccount(db,user,env)};}
 if(path==='payments/kora/deposits/check'){await role(db,user,'employer');return reconcileDeposits(db,user,env,body.page??1);}
 if(path==='payments/kora/deposits/simulate'){
  await role(db,user,'employer');const value=amount(body.amount),id='KSIM-'+await hash(user.id+':'+requestId(body.requestId));
  const account=await one(db,"SELECT * FROM kora_test_accounts WHERE user_id=? AND status='active'",user.id);if(!account)fail(409,'Create a sandbox account first.');
  const row=await savedOperation(db,id,user,'simulate',value,{account:account.account_number});if(row.status!=='pending')return {operation:pubOperation(row),message:'Check deposits before starting another simulation.'};
  const claim=await run(db,"UPDATE kora_test_operations SET status='submitting' WHERE id=? AND status='pending'",id);if(claim.meta?.changes!==1)fail(409,'Simulation is already being submitted.');
  await koraApi(env,'/virtual-bank-account/sandbox/credit',{account_number:account.account_number,currency:'NGN',amount:value/100});await run(db,"UPDATE kora_test_operations SET status='submitted',updated_at=? WHERE id=?",at(),id);
  return {message:'Test transfer requested. Use Check deposits; submission does not credit a balance.'};
 }
 if(path==='payments/kora/work'||path==='payments/kora/premium'){await role(db,user,'employer');await password(user,body,passwordHash);return purchase(db,user,env,body,path.endsWith('/work')?'work':'premium');}
 if(path==='payments/kora/withdraw/check'){return {checked:await reconcileSandboxPayout(db,env,reference(body.reference),user.id)};}
 if(path==='payments/kora/withdraw'){
  await role(db,user,'worker');await password(user,body,passwordHash);const value=amount(body.amount),id='KWD-'+(await hash(user.id+':'+requestId(body.requestId))).slice(0,40);
  // Only published Kora test payout destinations are accepted. No real bank data.
  const bankCode=body.scenario==='failed'?'035':'033',account='0000000000';
  const row=await savedOperation(db,id,user,'withdraw',value,{bankCode,account,email:user.email});
  if(row.status!=='pending')return {operation:pubOperation(row)};
  const time=at();let batch;
  batch=await db.batch([db.prepare("UPDATE kora_test_operations SET status='applying' WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM kora_test_wallets WHERE user_id=? AND frozen=0 AND earnings>=?) AND NOT EXISTS(SELECT 1 FROM kora_test_operations WHERE user_id=? AND kind='withdraw' AND id!=? AND status IN ('applying','submitting','processing','unknown'))").bind(id,user.id,value,user.id,id),db.prepare('UPDATE kora_test_wallets SET earnings=earnings-? WHERE user_id=? AND '+gate).bind(value,user.id,id),entry(db,id+'-reserved',user.id,'earnings','withdrawal',-value,id,time),db.prepare("UPDATE kora_test_operations SET status='submitting',updated_at=? WHERE id=? AND status='applying'").bind(time,id)]);
  if(batch[0].meta?.changes!==1){const latest=await one(db,'SELECT * FROM kora_test_operations WHERE id=?',id);if(latest.status!=='pending')return {operation:pubOperation(latest)};fail(409,'Insufficient test earnings or another withdrawal is pending.');}
  try {await koraApi(env,'/transactions/disburse',{reference:id,destination:{type:'bank_account',amount:value/100,currency:'NGN',narration:'LocHire sandbox withdrawal',bank_account:{bank:bankCode,account},customer:{name:user.name,email:user.email}}});}
  catch(error){await run(db,"UPDATE kora_test_operations SET status='unknown',updated_at=? WHERE id=? AND status='submitting'",at(),id);throw error;}
  await reconcileSandboxPayout(db,env,id,user.id);return {operation:pubOperation(await one(db,'SELECT * FROM kora_test_operations WHERE id=?',id))};
 }
 fail(404,'Kora sandbox route not found.');
}
