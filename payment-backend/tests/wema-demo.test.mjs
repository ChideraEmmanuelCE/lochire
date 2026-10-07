import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { handleRequest } from '../lib/service.mjs';
import { bankReadiness,WemaProvider } from '../lib/wema.mjs';
function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  function prepare(sql) {return {bind(...values){return {first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:sqlite.prepare(sql).run(...values)}),sql,values};}};}
  return {sqlite,prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try {const result=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.values)}));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
function harness() {
  const db=database(),env={DB:db,SERVICE_SECRET:'test-private-service-key',APP_ORIGIN:'https://lochire.vercel.app',PAYMENT_MODE:'sandbox'};
  let ip=0;
  async function call(path,body,cookie,key,overrides={}) {
    const request=new Request('https://payments.test/api/'+path,{method:body===undefined?'GET':'POST',headers:{'x-lochire-service-key':env.SERVICE_SECRET,origin:env.APP_ORIGIN,'x-lochire-client-ip':'test-'+(++ip),...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{}),...overrides},body:body===undefined?undefined:JSON.stringify(body)});
    const response=await handleRequest(request,env);return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function register(label,role='both') {
    const result=await call('auth/register',{name:label,email:label+'@example.test',phone:'08012345678',role,password:'ExampleTestPassword123!',demoConsent:true});
    assert.equal(result.status,201,JSON.stringify(result.data));assert.match(result.cookie,/^lh_session=/);return {cookie:result.cookie,id:result.data.user.id};
  }
  async function createJob(employer,worker,value=2000000) {
    const r=await call('jobs',{workerId:worker.id,title:'Repair leaking sink',scope:'Repair the sink and test the pipe connection.',category:'Plumbing',amount:value},employer.cookie,crypto.randomUUID());
    assert.equal(r.status,200,JSON.stringify(r.data));return r.data.jobs[0].id;
  }
  return {db,env,call,register,createJob};
}

async function setup(h,u){assert.equal((await h.call('wema/onboarding/request',{consent:true,nin:'00000000000'},u.cookie)).status,400);assert.equal((await h.call('wema/onboarding/request',{consent:true},u.cookie)).status,200);assert.equal((await h.call('wema/onboarding/verify',{otp:'000000'},u.cookie)).status,400);assert.equal((await h.call('wema/onboarding/verify',{otp:'123456'},u.cookie)).status,200);}
test('full simulated banking journey persists, conserves funds and never contacts a bank',async()=>{
 const h=harness();h.env.WEMA_MODE='demo';const e=await h.register('demo-payer'),w=await h.register('demo-worker'),outsider=await h.register('demo-other');const old=global.fetch;global.fetch=async()=>{throw Error('External bank calls forbidden');};
 try{
  const config=(await h.call('config')).data;assert.equal(config.wema.simulated,true);assert.equal(config.wema.deposits.ready,true);
  await setup(h,e);await setup(h,w);
  const key='demo-credit-once',deposit=await h.call('wema/demo/deposits/create',{amount:5000000,scenario:'successful'},e.cookie,key);assert.equal(deposit.status,200,JSON.stringify(deposit.data));assert.equal(deposit.data.bankBalance.available,5000000);assert.match(deposit.data.wallet.accountNumber,/^DEMO-/);assert.equal(deposit.data.wallet.available,0);
  const retry=await h.call('wema/demo/deposits/create',{amount:5000000,scenario:'successful'},e.cookie,key);assert.equal(retry.data.bankBalance.available,5000000);assert.equal(retry.data.transactions.length,1);
  const failed=await h.call('wema/demo/deposits/create',{amount:10000,scenario:'failed'},e.cookie,'demo-failed-credit');assert.equal(failed.data.bankBalance.available,5000000);assert.equal(failed.data.transactions.length,1);
  const pending=await h.call('wema/demo/deposits/create',{amount:20000,scenario:'pending'},e.cookie,'demo-pending-credit');assert.equal(pending.data.bankBalance.available,5000000);assert.equal((await h.call('wema/deposits/check',{reference:pending.data.reference},outsider.cookie,'demo-intruder')).status,409);
  const done=await h.call('wema/deposits/check',{reference:pending.data.reference},e.cookie,'demo-check-credit');assert.equal(done.data.bankBalance.available,5020000);
  const jobResponse=await h.call('jobs',{workerId:w.id,title:'Demo bank job',scope:'Fictional work for a simulated payment.',category:'Test',amount:2000000,rail:'wema'},e.cookie,'demo-create-job');assert.equal(jobResponse.data.jobs[0].bank_environment,'demo');const job=jobResponse.data.jobs[0].id;await h.call('jobs/'+job+'/accept',{},w.cookie,'demo-accept-job');
  assert.equal((await h.call('wema/payments/create',{jobId:job,password:'Wrong'},e.cookie,'demo-wrong-password')).status,401);
  const pay=await h.call('wema/payments/create',{jobId:job,password:'ExampleTestPassword123!'},e.cookie,'demo-pay-once');assert.equal(pay.status,200,JSON.stringify(pay.data));assert.equal(pay.data.bankBalance.available,3020000);assert.equal(pay.data.bankBalance.held,2000000);
  const paid=await h.call('wema/payments/reconcile',{reference:pay.data.reference},e.cookie,'demo-reconcile');assert.equal(paid.status,200,JSON.stringify(paid.data));assert.equal(paid.data.bankBalance.held,0);await h.call('wema/payments/reconcile',{reference:pay.data.reference},e.cookie,'demo-reconcile-again');
  await h.call('jobs/'+job+'/complete',{},w.cookie,'demo-work-finished');await h.call('jobs/'+job+'/complete',{},e.cookie,'demo-work-confirmed');
  const worker=(await h.call('wallet',undefined,w.cookie)).data;assert.equal(worker.bankBalance.available,2000000);assert.equal(worker.wallet.available,0);assert.equal(worker.transactions.length,1);assert.equal(worker.jobs[0].status,'completed');assert.equal(worker.transactions[0].mode,'wema_demo');
  const receipt=await h.call('receipts/'+worker.transactions[0].reference,undefined,w.cookie);assert.match(receipt.data.label,/SIMULATED/);assert.equal(receipt.data.currency,'TEST-NGN');assert.equal((await h.call('receipts/'+worker.transactions[0].reference,undefined,outsider.cookie)).status,404);
  assert.equal((await h.call('wema/statements/sync',{},w.cookie)).status,409);assert.equal((await h.call('wema/statements/request',{consent:true},w.cookie)).status,200);assert.equal((await h.call('wema/statements/sync',{},w.cookie)).data.records.length,1);
  assert.equal((await h.call('webhooks/wema/deposits',{reference:deposit.data.reference})).status,503);
 }finally{global.fetch=old;}
});
test('simulation fails closed on live settings and a replay cannot settle another deposit',async()=>{
 assert.equal(bankReadiness({WEMA_MODE:'demo',PAYMENT_MODE:'sandbox',WEMA_ENVIRONMENT:'production'}).ready,false);assert.equal(bankReadiness({WEMA_MODE:'demo',PAYMENT_MODE:'sandbox',WEMA_ENABLED:'true'}).ready,false);
 await assert.rejects(()=>new WemaProvider({WEMA_MODE:'demo'}).request('/anything'));
 const h=harness();h.env.WEMA_MODE='demo';const u=await h.register('demo-replay-owner');await setup(h,u);
 const first=await h.call('wema/demo/deposits/create',{amount:10000,scenario:'pending'},u.cookie,'first-pending-key');const second=await h.call('wema/demo/deposits/create',{amount:20000,scenario:'pending'},u.cookie,'second-pending-key');
 const replay=await h.call('wema/demo/deposits/create',{amount:10000,scenario:'pending'},u.cookie,'first-pending-key');assert.equal(replay.data.reference,first.data.reference);assert.notEqual(replay.data.reference,second.data.reference);
 assert.equal((await h.call('wema/demo/deposits/create',{amount:30000,scenario:'successful'},u.cookie,'first-pending-key')).status,409);
 const [a,b]=await Promise.all([h.call('wema/deposits/check',{reference:first.data.reference},u.cookie,'check-duplicate-a'),h.call('wema/deposits/check',{reference:first.data.reference},u.cookie,'check-duplicate-b')]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal((await h.call('wallet',undefined,u.cookie)).data.bankBalance.available,10000);
});

test('workers receive and withdraw while only hiring mode can deposit',async()=>{
 const h=harness();h.env.WEMA_MODE='demo';const e=await h.register('role-payer','employer'),w=await h.register('role-worker','worker');await setup(h,e);await setup(h,w);
 assert.equal((await h.call('wallet',undefined,w.cookie)).data.wallet.activeRole,'worker');
 for(const path of ['sandbox/fund','wema/demo/deposits/create'])assert.equal((await h.call(path,{amount:10000,scenario:'successful'},w.cookie,'worker-deposit-denied')).status,403);
 const funded=await h.call('wema/demo/deposits/create',{amount:5000000},e.cookie,'hirer-demo-funding');assert.equal(funded.data.bankBalance.available,5000000);
 const job=(await h.call('jobs',{workerId:w.id,title:'Paid worker',scope:'A fictional job for earnings withdrawal.',category:'Test',amount:2000000,rail:'wema'},e.cookie,'hirer-demo-job')).data.jobs[0].id;
 await h.call('jobs/'+job+'/accept',{},w.cookie,'worker-accept');const pay=await h.call('wema/payments/create',{jobId:job,password:'ExampleTestPassword123!'},e.cookie,'hirer-demo-pay');await h.call('wema/payments/reconcile',{reference:pay.data.reference},e.cookie,'hirer-demo-settle');
 const payload={amount:500000,destination:'My demo bank',password:'ExampleTestPassword123!'};
 assert.equal((await h.call('wema/demo/withdrawals/create',{...payload,password:'Incorrect'},w.cookie,'wrong-withdraw-password')).status,401);
 const withdrawn=await h.call('wema/demo/withdrawals/create',payload,w.cookie,'worker-withdraw-once');assert.equal(withdrawn.status,200,JSON.stringify(withdrawn.data));assert.equal(withdrawn.data.bankBalance.available,1500000);assert.equal(withdrawn.data.wallet.available,0);
 const replay=await h.call('wema/demo/withdrawals/create',payload,w.cookie,'worker-withdraw-once');assert.equal(replay.data.bankBalance.available,1500000);assert.equal(replay.data.transactions.filter(t=>t.kind==='bank_withdrawal').length,1);
 assert.equal((await h.call('wema/demo/withdrawals/create',{...payload,amount:500001},w.cookie,'worker-withdraw-once')).status,409);
 assert.equal((await h.call('wema/demo/withdrawals/create',{...payload,amount:2000000},w.cookie,'withdraw-overdraft')).status,409);
 assert.equal((await h.call('wema/demo/withdrawals/create',{...payload,destination:'0123456789'},w.cookie,'real-details-denied')).status,400);
 const receipt=withdrawn.data.transactions.find(t=>t.kind==='bank_withdrawal');assert.match((await h.call('receipts/'+receipt.reference,undefined,w.cookie)).data.label,/SIMULATED/);assert.equal((await h.call('receipts/'+receipt.reference,undefined,e.cookie)).status,404);
 const hire=await h.call('wallet/role',{role:'employer'},w.cookie);assert.equal(hire.data.wallet.activeRole,'employer');assert.equal(hire.data.bankBalance.available,1500000);assert.equal(hire.data.user.role,'both');
 assert.equal((await h.call('wema/demo/withdrawals/create',payload,w.cookie,'hirer-withdraw-denied')).status,403);
 assert.equal((await h.call('sandbox/fund',{amount:100000},w.cookie,'hirer-test-credit')).status,200);
 await h.call('wallet/role',{role:'worker'},w.cookie);
 const testWithdrawal=await h.call('sandbox/withdraw',{...payload,amount:50000},w.cookie,'test-withdraw-once');assert.equal(testWithdrawal.data.wallet.available,50000);assert.equal(testWithdrawal.data.bankBalance.available,1500000);assert.equal((await h.call('sandbox/withdraw',{...payload,amount:50000},w.cookie,'test-withdraw-once')).data.wallet.available,50000);
 assert.equal((await h.call('wallet/role',{role:'admin'},w.cookie)).status,400);
 h.env.WEMA_MODE='bank';assert.equal((await h.call('wema/demo/withdrawals/create',payload,w.cookie,'real-withdraw-disabled')).status,503);
});
