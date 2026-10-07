import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleRequest } from '../lib/service.mjs';
import { WemaProvider, createMandate, authorizeMandate } from '../lib/wema.mjs';

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

test('two authenticated accounts reserve, complete once, receive receipts and eligible reviews',async()=>{
  const h=harness(),employer=await h.register('employer','employer'),worker=await h.register('worker','worker');
  const job=await h.createJob(employer,worker);
  assert.equal((await h.call('jobs/'+job+'/reserve',{},employer.cookie,'reserve-early')).status,409);
  assert.equal((await h.call('jobs/'+job+'/accept',{},employer.cookie,'wrong-accept')).status,403);
  assert.equal((await h.call('jobs/'+job+'/review',{rating:5,text:'Good work'},employer.cookie,'early-review')).status,409);
  assert.equal((await h.call('jobs/'+job+'/accept',{},worker.cookie,'worker-accept')).status,200);
  assert.equal((await h.call('jobs/'+job+'/reserve',{},employer.cookie,'no-funds-key')).status,409);
  const [a,b]=await Promise.all([h.call('sandbox/fund',{amount:5000000},employer.cookie,'same-credit-key'),h.call('sandbox/fund',{amount:5000000},employer.cookie,'same-credit-key')]);
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.equal((await h.call('wallet',undefined,employer.cookie)).data.wallet.available,5000000);
  assert.equal((await h.call('sandbox/fund',{amount:10000},employer.cookie,'same-credit-key')).status,409);
  await h.call('jobs/'+job+'/reserve',{},employer.cookie,'reserve-paid');
  const reserved=(await h.call('wallet',undefined,employer.cookie)).data;
  assert.equal(reserved.wallet.available,3000000);assert.equal(reserved.wallet.held,2000000);
  await h.call('jobs/'+job+'/complete',{},worker.cookie,'worker-finished');
  assert.equal((await h.call('wallet',undefined,worker.cookie)).data.wallet.available,0);
  const [done,retry]=await Promise.all([h.call('jobs/'+job+'/complete',{},employer.cookie,'employer-finished'),h.call('jobs/'+job+'/complete',{},employer.cookie,'employer-finished')]);
  assert.equal(done.status,200);assert.equal(retry.status,200);
  const paid=(await h.call('wallet',undefined,worker.cookie)).data;
  assert.equal(paid.wallet.available,2000000);assert.equal(paid.jobs[0].status,'completed');
  assert.equal(paid.transactions.filter(t=>t.kind==='received').length,1);
  assert.equal((await h.call('jobs/'+job+'/complete',{},employer.cookie,'different-key')).status,409);
  const receipt=await h.call('receipts/'+paid.transactions[0].reference,undefined,worker.cookie);
  assert.equal(receipt.status,200);assert.match(receipt.data.label,/TEST RECEIPT/);
  assert.equal((await h.call('receipts/'+paid.transactions[0].reference,undefined,employer.cookie)).status,404);
  assert.equal((await h.call('jobs/'+job+'/review',{rating:5,text:'Excellent repair on the test job.'},employer.cookie,'review-one')).status,200);
  assert.equal((await h.call('jobs/'+job+'/review',{rating:3,text:'A second review should fail.'},employer.cookie,'review-two')).status,409);
  const trust=(await h.call('members/'+worker.id,undefined,employer.cookie)).data.trust;
  assert.equal(trust.completedJobs,1);assert.equal(trust.reviews,1);assert.equal(trust.rating,5);
  const e=(await h.call('wallet',undefined,employer.cookie)).data.wallet;
  assert.equal(e.available+e.held+paid.wallet.available,5000000);
});

test('refund restores funds once; disputes freeze funds; nonparticipants cannot act',async()=>{
  const h=harness(),e=await h.register('payer'),w=await h.register('payee'),outsider=await h.register('outsider');
  await h.call('sandbox/fund',{amount:5000000},e.cookie,'add-money');
  const j=await h.createJob(e,w,1000000);
  assert.equal((await h.call('jobs/'+j+'/accept',{},outsider.cookie,'intruder-accept')).status,404);
  await h.call('jobs/'+j+'/accept',{},w.cookie,'accept-a');await h.call('jobs/'+j+'/reserve',{},e.cookie,'reserve-a');
  const [cancel,retry]=await Promise.all([h.call('jobs/'+j+'/cancel',{},e.cookie,'cancel-one'),h.call('jobs/'+j+'/cancel',{},e.cookie,'cancel-one')]);
  assert.equal(cancel.status,200);assert.equal(retry.status,200);
  const wallet=(await h.call('wallet',undefined,e.cookie)).data.wallet;assert.equal(wallet.available,5000000);assert.equal(wallet.held,0);
  const frozen=await h.createJob(e,w,1000000);await h.call('jobs/'+frozen+'/accept',{},w.cookie,'accept-b');await h.call('jobs/'+frozen+'/reserve',{},e.cookie,'reserve-b');
  await h.call('jobs/'+frozen+'/dispute',{reason:'Work scope needs discussion.'},w.cookie,'dispute-one');
  assert.equal((await h.call('jobs/'+frozen+'/complete',{},e.cookie,'complete-disputed')).status,409);
  assert.equal((await h.call('jobs/'+frozen+'/cancel',{},e.cookie,'cancel-disputed')).status,409);
  assert.equal((await h.call('wallet',undefined,e.cookie)).data.wallet.held,1000000);
});

test('concurrent job reservations cannot overdraw the employer',async()=>{
  const h=harness(),e=await h.register('funding'),w=await h.register('artisan');
  await h.call('sandbox/fund',{amount:3000000},e.cookie,'single-funding');
  const a=await h.createJob(e,w,2000000),b=await h.createJob(e,w,2000000);
  await h.call('jobs/'+a+'/accept',{},w.cookie,'accept-job-a');await h.call('jobs/'+b+'/accept',{},w.cookie,'accept-job-b');
  const responses=await Promise.all([h.call('jobs/'+a+'/reserve',{},e.cookie,'reserve-job-a'),h.call('jobs/'+b+'/reserve',{},e.cookie,'reserve-job-b')]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const data=(await h.call('wallet',undefined,e.cookie)).data;assert.equal(data.wallet.available,1000000);assert.equal(data.wallet.held,2000000);
});

test('authentication, CSRF, rate limits and real-bank gates fail closed',async()=>{
  const h=harness(),e=await h.register('security');
  assert.equal((await h.call('wallet')).status,401);
  assert.equal((await h.call('sandbox/fund',{amount:100},e.cookie,'bad-origin',{origin:'https://attacker.test'})).status,403);
  assert.equal((await h.call('sandbox/fund',{amount:100},e.cookie,'bad-service',{'x-lochire-service-key':'wrong'})).status,403);
  assert.equal((await h.call('sandbox/fund',{amount:100.5},e.cookie,'fractional-amount')).status,400);
  assert.equal((await h.call('sandbox/fund',{amount:100},e.cookie)).status,400);
  assert.equal((await h.call('wema/onboarding/request',{nin:'12345678901',consent:true},e.cookie)).status,503);
  assert.equal((await h.call('webhooks/wema/transactions',{data:{transactionReference:'LH-fake',status:'SUCCESSFUL'}})).status,503);
  await h.call('auth/logout',{},e.cookie);
  assert.equal((await h.call('wallet',undefined,e.cookie)).status,401);
  for(let n=0;n<10;n++)await h.call('auth/login',{email:'security@example.test',password:'IncorrectPassword10'});
  assert.equal((await h.call('auth/login',{email:'security@example.test',password:'IncorrectPassword10'})).status,429);
});

test('bank verification rejects mismatched amounts and accounts; mandate cannot authorize another transfer',async()=>{
  const h=harness(),e=await h.register('bankuser'),env={...h.env,WEMA_ENABLED:'true',WEMA_ENVIRONMENT:'sandbox',WEMA_BASE_URL:'https://api.alat.ng',WEMA_API_KEY:'test-key',WEMA_CHANNEL_ID:'test-channel',WEMA_CALLBACK_TOKEN:'test-token',WEMA_MANDATE_KEY:'a'.repeat(64),WEMA_WALLET_VERIFY_PATH:'/verify/{trackingId}',WEMA_TRANSFER_STATUS_PATH:'/status/{reference}',WEMA_CONTRACT_CONFIRMED:'true'};
  const payment={reference:'LH-BANK-EXAMPLE',amount:100000,source:'0000000001',destination:'0000000002'};
  const fetcher=async()=>Response.json({data:{status:'SUCCESSFUL',transactionReference:payment.reference,amount:1000,currency:'NGN',sourceAccountNumber:payment.source,destinationAccountNumber:payment.destination}});
  const bank=new WemaProvider(env,fetcher);
  assert.equal((await bank.verifyPayment(payment)).status,'successful');
  await assert.rejects(()=>bank.verifyPayment({...payment,amount:100001}));
  await assert.rejects(()=>bank.verifyPayment({...payment,destination:'0000000003'}));
  await h.db.prepare("INSERT INTO bank_requests (id,user_id,kind,reference,amount,source,destination,status,created_at) VALUES (?,?, 'payment',?,?,?,?,'pending',?)").bind('BR-test',e.id,payment.reference,payment.amount,payment.source,payment.destination,new Date().toISOString()).run();
  const securityInfo=await createMandate(payment,env);
  assert.equal((await authorizeMandate(h.db,{securityInfo,transactionReference:payment.reference},env)).authorized,true);
  assert.equal((await authorizeMandate(h.db,{securityInfo,transactionReference:'LH-other'},env)).authorized,false);
  assert.equal((await authorizeMandate(h.db,{securityInfo:securityInfo.slice(0,-5)+'wrong',transactionReference:payment.reference},env)).authorized,false);
});

test('Wema adapter flow persists before submission, verifies callbacks once, and keeps bank sandbox separate',async()=>{
  const h=harness(),e=await h.register('bankpayer'),w=await h.register('bankworker');
  Object.assign(h.env,{WEMA_ENABLED:'true',WEMA_ENVIRONMENT:'sandbox',WEMA_BASE_URL:'https://api.alat.ng',WEMA_API_KEY:'fixture-key',WEMA_CHANNEL_ID:'fixture-channel',WEMA_CALLBACK_TOKEN:'fixture-callback',WEMA_MANDATE_KEY:'b'.repeat(64),WEMA_WALLET_VERIFY_PATH:'/verify/{trackingId}',WEMA_TRANSFER_STATUS_PATH:'/status/{reference}',WEMA_CONTRACT_CONFIRMED:'true'});
  await h.db.prepare("UPDATE wallets SET bank_status='active',bank_account=?,bank_name=? WHERE user_id=?").bind('0000000001','Bank Payer',e.id).run();
  await h.db.prepare("UPDATE wallets SET bank_status='active',bank_account=?,bank_name=? WHERE user_id=?").bind('0000000002','Bank Worker',w.id).run();
  await h.call('sandbox/fund',{amount:5000000},e.cookie,'initial-test-credit');
  const created=await h.call('jobs',{workerId:w.id,title:'Bank adapter plumbing job',scope:'A confirmed job for the bank adapter fixture.',category:'Plumbing',amount:2000000,rail:'wema'},e.cookie,'create-bank-job');
  const job=created.data.jobs[0].id;await h.call('jobs/'+job+'/accept',{},w.cookie,'accept-bank-job');
  assert.equal((await h.call('jobs/'+job+'/reserve',{},e.cookie,'reserve-real-as-test')).status,409);
  let transfer,submissions=0,mismatch=false;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path.includes('AccountNameEnquiry'))return Response.json({data:{accountName:path.includes('0000000001')?'Bank Payer':'Bank Worker'}});
    if(path.endsWith('ProcessClientTransfer')) {
      submissions++;transfer=JSON.parse(options.body);
      const auth=await h.call('webhooks/wema/authorize',{transactionReference:transfer.transactionReference,securityInfo:transfer.securityInfo});
      assert.equal(auth.data.authorized,true,'bank request must exist before an authorization callback');
      return Response.json({data:{status:'PENDING'}});
    }
    if(path.startsWith('/status/'))return Response.json({data:{status:'SUCCESSFUL',transactionReference:transfer.transactionReference,amount:mismatch?20001:20000,currency:'NGN',sourceAccountNumber:transfer.sourceAccountNumber,destinationAccountNumber:transfer.destinationAccountNumber}});
    throw Error('Unexpected fixture bank request');
  };
  try {
    const body={jobId:job,password:'ExampleTestPassword123!'};
    assert.equal((await h.call('wema/payments/create',{...body,password:'Incorrect'},e.cookie,'wrong-bank-password')).status,401);
    const request=await h.call('wema/payments/create',body,e.cookie,'bank-transfer-once');
    assert.equal(request.status,200);assert.ok(transfer);
    await h.call('wema/payments/create',body,e.cookie,'bank-transfer-once');assert.equal(submissions,1);
    mismatch=true;
    const signal={data:{transactionReference:request.data.reference,status:'SUCCESSFUL'}};
    assert.equal((await h.call('webhooks/wema/transactions',signal,undefined,undefined,{'x-wema-callback-token':'wrong'})).status,401);
    assert.notEqual((await h.call('webhooks/wema/transactions',signal,undefined,undefined,{'x-wema-callback-token':'fixture-callback'})).status,200);
    assert.equal((await h.call('wallet',undefined,w.cookie)).data.transactions.length,0);
    mismatch=false;
    await h.call('webhooks/wema/transactions',signal,undefined,undefined,{'x-wema-callback-token':'fixture-callback'});
    await h.call('webhooks/wema/transactions',signal,undefined,undefined,{'x-wema-callback-token':'fixture-callback'});
    const paid=(await h.call('wallet',undefined,w.cookie)).data;
    assert.equal(paid.transactions.length,1);assert.equal(paid.transactions[0].mode,'wema_sandbox');assert.equal(paid.wallet.available,0);
    const receipt=(await h.call('receipts/'+paid.transactions[0].reference,undefined,w.cookie)).data;assert.match(receipt.label,/WEMA SANDBOX/);
    await h.call('jobs/'+job+'/complete',{},w.cookie,'bank-worker-done');await h.call('jobs/'+job+'/complete',{},e.cookie,'bank-employer-done');
    const payer=(await h.call('wallet',undefined,e.cookie)).data;
    assert.equal(payer.jobs[0].status,'completed');assert.equal(payer.wallet.available,5000000);assert.equal(payer.wallet.held,0);
  } finally {globalThis.fetch=oldFetch;}
});
