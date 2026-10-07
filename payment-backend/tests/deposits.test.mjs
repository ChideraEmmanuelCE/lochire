import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { handleRequest } from '../lib/service.mjs';
import { WemaDeposits,depositReadiness } from '../lib/deposits.mjs';
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

const bankEnv={WEMA_ENABLED:'true',WEMA_ENVIRONMENT:'sandbox',WEMA_BASE_URL:'https://playground.alat.ng',WEMA_API_KEY:'fictional-fixture',WEMA_CHANNEL_ID:'fixture-channel',WEMA_CALLBACK_TOKEN:'fictional-callback',WEMA_MANDATE_KEY:'a'.repeat(64),WEMA_WALLET_VERIFY_PATH:'/fixture/wallet/{trackingId}',WEMA_TRANSFER_STATUS_PATH:'/fixture/payment/{reference}',WEMA_CONTRACT_CONFIRMED:'true',WEMA_DEPOSITS_ENABLED:'true',WEMA_DEPOSIT_CONTRACT_CONFIRMED:'true',WEMA_DEPOSIT_STATUS_PATH:'/fixture/credit/{reference}',WEMA_BALANCE_PATH:'/fixture/balance/{accountNumber}',WEMA_AMOUNT_UNIT:'naira'};
async function active(h,u,account='0000000001'){await h.db.prepare("UPDATE wallets SET bank_status='active',bank_account=?,bank_name='Fictional fixture account',bank_environment='sandbox' WHERE user_id=?").bind(account,u.id).run();}
const credit=(reference,extra={})=>({data:{transactionReference:reference,destinationAccountNumber:'0000000001',status:'SUCCESSFUL',currency:'NGN',direction:'CREDIT',amount:'123.45',...extra}});

test('verified Wema deposits survive replay and concurrent callbacks without touching test balances',async()=>{
 const h=harness(),u=await h.register('deposit-owner'),other=await h.register('deposit-outsider');Object.assign(h.env,bankEnv);await active(h,u);
 const original=global.fetch,ref='BANK-credit-0001';let attempts=0;
 global.fetch=async(url)=>{attempts++;return Response.json(String(url).includes('/balance/')?{data:{accountNumber:'0000000001',currency:'NGN',availableBalance:'987.65'}}:credit(ref));};
 try{
  assert.equal((await h.call('wema/deposits/check',{reference:ref})).status,401);
  const checked=await h.call('wema/deposits/check',{reference:ref,amount:999999999,status:'successful'},u.cookie);assert.equal(checked.status,200);assert.equal(checked.data.bankDeposits[0].amount,12345);assert.equal(checked.data.wallet.available,0);assert.equal(checked.data.bankBalance,null);
  const callbacks=await Promise.all([h.call('webhooks/wema/deposits',{transactionReference:ref},null,null,{'x-wema-callback-token':'fictional-callback'}),h.call('webhooks/wema/deposits',{transactionReference:ref},null,null,{'x-wema-callback-token':'fictional-callback'})]);assert.ok(callbacks.every(x=>x.status===200));
  const replay=await h.call('wema/deposits/check',{reference:ref},u.cookie);assert.equal(replay.data.transactions.filter(t=>t.kind==='bank_deposit').length,1);assert.equal(replay.data.bankDeposits.length,1);
  const receipt=await h.call('receipts/'+replay.data.bankDeposits[0].receipt_reference,undefined,u.cookie);assert.equal(receipt.status,200);assert.equal(receipt.data.deposit.reference,ref);assert.match(receipt.data.label,/SANDBOX/);
  assert.equal((await h.call('receipts/'+replay.data.bankDeposits[0].receipt_reference,undefined,other.cookie)).status,404);
  const balance=await h.call('wema/balance/refresh',{},u.cookie);assert.equal(balance.data.bankBalance.available,98765);assert.equal(balance.data.wallet.available,0);assert.equal(balance.data.bankBalance.currency,'TEST-NGN');
  global.fetch=async()=>{throw Error('private bank failure');};const stale=await h.call('wema/balance/refresh',{},u.cookie);assert.equal(stale.status,502);assert.equal((await h.call('wallet',undefined,u.cookie)).data.bankBalance.checkedAt,balance.data.bankBalance.checkedAt);
  assert.ok(attempts>0);
 }finally{global.fetch=original;}
});

test('pending, delayed, failed and mismatched bank credits cannot issue a deposit receipt',async()=>{
 const h=harness(),u=await h.register('delayed-owner');Object.assign(h.env,bankEnv);await active(h,u);const original=global.fetch;let current;
 global.fetch=async()=>{if(current instanceof Error)throw current;return Response.json(current);};
 try{
  current=credit('BANK-delayed-01',{status:'PENDING'});let r=await h.call('wema/deposits/check',{reference:'BANK-delayed-01'},u.cookie);assert.equal(r.data.status,'pending');assert.equal(r.data.transactions.length,0);assert.equal(r.data.bankDeposits[0].amount,null);
  current=new Error('bank timeout');r=await h.call('wema/deposits/check',{reference:'BANK-delayed-01'},u.cookie);assert.equal(r.data.status,'unknown');assert.equal(r.data.transactions.length,0);
  current=credit('BANK-delayed-01');r=await h.call('wema/deposits/check',{reference:'BANK-delayed-01'},u.cookie);assert.equal(r.data.status,'successful');assert.equal(r.data.transactions.length,1);
  current=credit('BANK-failed-01',{status:'FAILED'});r=await h.call('wema/deposits/check',{reference:'BANK-failed-01'},u.cookie);assert.equal(r.data.status,'failed');assert.equal(r.data.transactions.length,1);
  current=credit('BANK-wrong-01',{destinationAccountNumber:'0000000002'});r=await h.call('wema/deposits/check',{reference:'BANK-wrong-01'},u.cookie);assert.equal(r.status,409);
  current=credit('BANK-debit-01',{direction:'DEBIT'});r=await h.call('wema/deposits/check',{reference:'BANK-debit-01'},u.cookie);assert.equal(r.data.status,'unknown');assert.equal(r.data.transactions.length,1);
  current=credit('BANK-credit-01');assert.equal((await h.call('webhooks/wema/deposits',{transactionReference:'BANK-credit-01'},null,null,{'x-wema-callback-token':'wrong'})).status,401);
  assert.equal((await h.call('wallet',undefined,u.cookie)).data.wallet.available,0);
 }finally{global.fetch=original;}
});

test('deposit configuration, environments and adapter projections fail closed',async()=>{
 assert.equal(depositReadiness({...bankEnv,WEMA_DEPOSIT_CONTRACT_CONFIRMED:'false'}).ready,false);
 assert.equal(depositReadiness({...bankEnv,WEMA_AMOUNT_UNIT:'guess'}).ready,false);
 const h=harness(),u=await h.register('environment-owner');assert.equal((await h.call('wema/deposits/check',{reference:'BANK-credit-01'},u.cookie)).status,503);Object.assign(h.env,bankEnv);await active(h,u);h.env.WEMA_ENVIRONMENT='production';assert.equal((await h.call('wema/balance/refresh',{},u.cookie)).status,409);
 for(const extra of [{amount:'1.001'},{amount:-1},{currency:'USD'},{transactionReference:'another-reference'},{amount:'9007199254740992'},{direction:'DEBIT'}]){
  const bank=new WemaDeposits(bankEnv,async()=>Response.json(credit('BANK-fixture-01',extra)));await assert.rejects(()=>bank.verifyCredit('BANK-fixture-01'));
 }
 const balance=new WemaDeposits(bankEnv,async()=>Response.json({data:{accountNumber:'0000000002',currency:'NGN',availableBalance:10}}));await assert.rejects(()=>balance.balance('0000000001'));
});

test('delayed bank account setup uses independent ownership read-back before exposing deposit details',async()=>{
 const h=harness(),u=await h.register('onboarding-owner');Object.assign(h.env,bankEnv);await h.db.prepare("UPDATE wallets SET bank_status='pending',bank_tracking='fixture-tracking' WHERE user_id=?").bind(u.id).run();const original=global.fetch;let wrong=true;
 global.fetch=async()=>Response.json({data:{nubanStatus:'Active',email:wrong?'someone-else@example.test':'onboarding-owner@example.test',nuban:'0000000001',nubanName:'Fictional account'}});
 try{
  assert.equal((await h.call('wema/onboarding/status',{},u.cookie)).status,409);assert.equal((await h.call('wallet',undefined,u.cookie)).data.wallet.accountNumber,null);
  wrong=false;assert.equal((await h.call('wema/onboarding/status',{},u.cookie)).status,200);const wallet=(await h.call('wallet',undefined,u.cookie)).data.wallet;assert.equal(wallet.bankEnvironment,'sandbox');assert.equal(wallet.accountNumber,'0000000001');
 }finally{global.fetch=original;}
});
