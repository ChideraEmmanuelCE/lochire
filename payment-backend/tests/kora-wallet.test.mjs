import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {harness} from './paystack-fixture.mjs';

async function fixture(){
 const h=harness(),people=await h.setup();Object.assign(h.env,{KORAPAY_MODE:'test',KORAPAY_SECRET_KEY:'sk_test_wallet_fixture',KORAPAY_WEBHOOKS_ENABLED:'true',KORAPAY_SANDBOX_WALLET_ENABLED:'true',KORAPAY_TESTER_EMAILS:'hirer@example.test,artisan@example.test'});
 for(const u of [people.e,people.w])await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at) VALUES(?,?)').bind(u.id,new Date().toISOString()).run();
 await h.call('wallet/role',{role:'worker'},people.w);
 await h.db.prepare("INSERT INTO lh_commerce_settings VALUES('main',500,100000,NULL,NULL,?)").bind(new Date().toISOString()).run();
 const accounts=new Map(),charges=new Map(),payouts=new Map(),calls=[];let sequence=0;
 const fetcher=async(url,opts={})=>{
  const u=new URL(url),path=u.pathname.replace('/merchant/api/v1',''),b=opts.body?JSON.parse(opts.body):null;calls.push({path,body:b});assert.equal(opts.headers.Authorization,'Bearer '+h.env.KORAPAY_SECRET_KEY);
  let data;
  if(path==='/misc/banks')data=[{name:'Test bank',code:'033'}];
  else if(path==='/virtual-bank-account'&&b){data={account_reference:b.account_reference,account_number:String(++sequence).padStart(10,'0'),account_name:b.account_name,bank_name:'Kora Sandbox',currency:'NGN',account_status:'active'};accounts.set(b.account_reference,data);}
  else if(path==='/virtual-bank-account/sandbox/credit'){
   const a=[...accounts.values()].find(a=>a.account_number===b.account_number);const ref='KPY-PAY-'+(++sequence);charges.set(ref,{reference:ref,status:'success',currency:'NGN',amount:String(b.amount),amount_paid:String(b.amount),fee:15,virtual_bank_account:{...a}});data=null;
  }
  else if(path==='/virtual-bank-account/transactions'){const account=u.searchParams.get('account_number');data={account_number:account,currency:'NGN',transactions:[...charges.values()].filter(c=>c.virtual_bank_account.account_number===account),pagination:{totalPages:1}};}
  else if(path.startsWith('/virtual-bank-account/'))data=accounts.get(path.split('/').at(-1));
  else if(path.startsWith('/charges/'))data=charges.get(path.split('/').at(-1));
  else if(path==='/transactions/disburse'){
   data={reference:b.reference,status:b.destination.bank_account.bank==='035'?'failed':'success',currency:'NGN',amount:b.destination.amount,customer:b.destination.customer,fee:10};payouts.set(b.reference,data);
  }
  else if(path.startsWith('/transactions/'))data=payouts.get(path.split('/').at(-1));
  else throw Error('Unexpected Kora request '+path);
  return Response.json({status:true,data});
 };
 const post=(path,body={},user=people.e)=>h.call('payments/kora/'+path,{consent:true,...body},user);
 const state=async user=>(await h.call('payments/kora/state',undefined,user||people.e)).data;
 const password='SecureFixturePassword123!';
 async function fund(value=3000000){assert.equal((await post('account')).status,200);assert.equal((await post('deposits/simulate',{amount:value,requestId:crypto.randomUUID()})).status,200);const r=await post('deposits/check');assert.equal(r.status,200,JSON.stringify(r.data));return [...charges.keys()].at(-1);}
 async function work(){const gid=await h.invite(people.e,people.w,people.oid);await h.confirmWork(people.e,people.w,gid);return {engagementId:gid,version:1,password};}
 const hook=async(ref,event='charge.success')=>{const e={event,data:{reference:ref}};const signature=createHmac('sha256',h.env.KORAPAY_SECRET_KEY).update(JSON.stringify(e.data)).digest('hex');return h.call('webhooks/korapay',e,null,{'x-korapay-signature':signature});};
 return {...h,...people,accounts,charges,payouts,calls,fetcher,post,state,password,fund,work,hook};
}

test('private test wallet requires allowlist, email verification and test mode; key check queries provider',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  assert.equal((await h.call('payments/kora/state',undefined,h.outsider)).status,403);assert.equal((await h.post('check')).data.verified,true);
  h.env.KORAPAY_MODE='live';assert.equal((await h.post('account')).status,403);h.env.KORAPAY_MODE='test';
  await h.db.prepare('DELETE FROM live_account_settings WHERE user_id=?').bind(h.e.id).run();assert.equal((await h.post('check')).status,403);
 }finally{global.fetch=old;}
});
test('sandbox accounts bind to the user, use published test identity and recover ambiguous creation without another POST',async()=>{
 const h=await fixture(),old=global.fetch;let fail=true;global.fetch=async(u,o)=>{const r=await h.fetcher(u,o);if(new URL(u).pathname.endsWith('/virtual-bank-account')&&fail){fail=false;throw Error('timeout');}return r;};try{
  assert.equal((await h.post('account')).status,503);assert.equal((await h.post('account')).status,200);assert.equal((await h.post('account')).status,200);
  const creates=h.calls.filter(c=>c.path==='/virtual-bank-account');assert.equal(creates.length,1);assert.equal(creates[0].body.bank_code,'000');assert.equal(creates[0].body.kyc.bvn,'22222222222');
  assert.equal(JSON.stringify(await h.state()).includes('22222222222'),false);assert.equal((await h.post('account',{},h.w)).status,403);
 }finally{global.fetch=old;}
});
test('simulated transfer submission never credits funds until independent verification; callbacks and reconciliation apply once',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  await h.post('account');const body={amount:3000000,requestId:crypto.randomUUID()};await Promise.all([h.post('deposits/simulate',body),h.post('deposits/simulate',body)]);assert.equal((await h.state()).funds,0);
  const ref=[...h.charges.keys()][0];await Promise.all([h.hook(ref),h.hook(ref),h.post('deposits/check')]);await h.post('deposits/check');
  const state=await h.state();assert.equal(state.funds,2998500);assert.equal(state.deposits.length,1);assert.equal(state.history.length,1);assert.equal(h.calls.filter(c=>c.path.endsWith('/sandbox/credit')).length,1);
  assert.equal((await h.call('hiring/state',undefined,h.e)).data.credits.balance,0);
 }finally{global.fetch=old;}
});
test('premium and agreed worker payments debit once, conserve test funds and cannot grant live premium or earnings',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  await h.fund();const body=await h.work();const rs=await Promise.all([h.post('work',body),h.post('work',body)]);for(const r of rs)assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await h.state()).funds,998500);assert.equal((await h.state(h.w)).earnings,1900000);
  const p={requestId:crypto.randomUUID(),amount:100000,password:h.password};await Promise.all([h.post('premium',p),h.post('premium',p)]);
  assert.equal((await h.state()).funds,898500);assert.ok((await h.state()).premiumUntil);assert.equal((await h.call('hiring/state',undefined,h.e)).data.premium,null);
  assert.equal((await h.post('work',{...body,version:2})).status,409);assert.equal((await h.post('work',body,h.outsider)).status,403);
 }finally{global.fetch=old;}
});
test('concurrent purchases cannot overdraw; changed idempotent requests, roles and missing passwords fail closed',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  await h.fund(150000);const p={amount:100000,password:h.password,requestId:crypto.randomUUID()};
  assert.equal((await h.post('premium',{...p,password:'wrong'})).status,401);assert.equal((await h.post('premium',p,h.w)).status,403);
  const rs=await Promise.all([h.post('premium',p),h.post('premium',{...p,requestId:crypto.randomUUID()})]);assert.equal(rs.filter(r=>r.status===200).length,1);assert.equal((await h.state()).funds,48500);
  const body={amount:200000,requestId:crypto.randomUUID()};await h.post('deposits/simulate',body);assert.equal((await h.post('deposits/simulate',{...body,amount:300000})).status,409);
 }finally{global.fetch=old;}
});
test('worker withdrawals reserve only earnings, use fixed test bank details and verified success is replay-safe',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  await h.fund();await h.post('work',await h.work());const body={requestId:crypto.randomUUID(),amount:500000,password:h.password};
  const r=await h.post('withdraw',body,h.w);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.operation.status,'success');assert.equal((await h.state(h.w)).earnings,1400000);
  await h.post('withdraw',body,h.w);assert.equal(h.calls.filter(c=>c.path==='/transactions/disburse').length,1);const sent=h.calls.find(c=>c.path==='/transactions/disburse').body;assert.equal(sent.destination.bank_account.account,'0000000000');assert.equal(sent.destination.bank_account.bank,'033');
  await h.hook(r.data.operation.reference,'transfer.success');assert.equal((await h.state(h.w)).earnings,1400000);assert.equal((await h.post('withdraw',body)).status,403);
 }finally{global.fetch=old;}
});
test('provider-verified failure restores earnings once; mismatched payout queries never mark success',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  await h.fund();await h.post('work',await h.work());let r=await h.post('withdraw',{requestId:crypto.randomUUID(),amount:500000,password:h.password,scenario:'failed'},h.w);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.operation.status,'failed');assert.equal((await h.state(h.w)).earnings,1900000);
  await h.post('withdraw/check',{reference:r.data.operation.reference},h.w);assert.equal((await h.state(h.w)).earnings,1900000);
  const p=h.payouts.get(r.data.operation.reference);p.amount=1;assert.equal((await h.post('withdraw/check',{reference:r.data.operation.reference},h.w)).status,409);
 }finally{global.fetch=old;}
});
test('ambiguous payout timeout holds earnings and rechecks its original reference without resubmitting',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  await h.fund();await h.post('work',await h.work());global.fetch=async(u,o)=>{const r=await h.fetcher(u,o);if(new URL(u).pathname.endsWith('/transactions/disburse'))throw Error('timeout');return r;};
  const body={requestId:crypto.randomUUID(),amount:500000,password:h.password};assert.equal((await h.post('withdraw',body,h.w)).status,503);assert.equal((await h.state(h.w)).earnings,1400000);
  const saved=(await h.state(h.w)).operations.find(o=>o.kind==='withdraw');assert.equal(saved.status,'unknown');await h.post('withdraw',body,h.w);assert.equal(h.calls.filter(c=>c.path==='/transactions/disburse').length,1);
  const checked=await h.post('withdraw/check',{reference:saved.reference},h.w);assert.equal(checked.status,200);assert.equal((await h.state(h.w)).operations.find(o=>o.kind==='withdraw').status,'success');
 }finally{global.fetch=old;}
});

test('a deposit cannot be assigned to another owner and contradictory payout results freeze spending',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  const ref=await h.fund();const original={...h.charges.get(ref)};
  h.charges.get(ref).fee=20;assert.equal((await h.post('deposits/check')).status,409);h.charges.set(ref,original);
  await h.post('work',await h.work());const r=await h.post('withdraw',{requestId:crypto.randomUUID(),amount:500000,password:h.password,scenario:'failed'},h.w);assert.equal(r.status,200);const id=r.data.operation.reference;
  h.payouts.get(id).status='success';assert.equal((await h.post('withdraw/check',{reference:id},h.w)).status,409);
  assert.equal((await h.post('withdraw',{requestId:crypto.randomUUID(),amount:100000,password:h.password},h.w)).status,409);assert.equal((await h.state(h.w)).earnings,1900000);
 }finally{global.fetch=old;}
});

test('the read-only provider connection probe is cached and never returns keys or bank account data',async()=>{
 const h=await fixture(),old=global.fetch;global.fetch=h.fetcher;try{
  const a=await h.call('webhooks/korapay?check=connection');const b=await h.call('webhooks/korapay?check=connection');assert.equal(a.status,200);assert.equal(a.data.verified,true);assert.deepEqual(a.data,b.data);
  assert.equal(h.calls.filter(c=>c.path==='/misc/banks').length,1);assert.doesNotMatch(JSON.stringify(a.data),/sk_test|Test bank/);
 }finally{global.fetch=old;}
});

test('connection failures expose only safe credential, access or network diagnostics',async()=>{
 const old=global.fetch;try{
  for(const [http,code] of [[401,'credentials_rejected'],[403,'provider_access_denied'],[500,'provider_unavailable'],[400,'provider_request_rejected']]){
   const h=await fixture();global.fetch=async()=>Response.json({status:false,message:'private-provider-detail',secret:'must-not-return'},{status:http});
   const r=await h.call('webhooks/korapay?check=connection');assert.deepEqual(r.data,{verified:false,mode:'test',status:code});assert.doesNotMatch(JSON.stringify(r.data),/private-provider-detail|must-not-return/);
  }
  const h=await fixture();global.fetch=async()=>{throw Error('private-network-detail');};assert.equal((await h.call('webhooks/korapay?check=connection')).data.status,'provider_unreachable');
 }finally{global.fetch=old;}
});
