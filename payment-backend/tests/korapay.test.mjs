import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {harness} from './paystack-fixture.mjs';
import {koraRequestEnvironment} from '../lib/korapay.mjs';

test('test-key relay is opt-in, requires private service authentication, and cannot supply live credentials',async()=>{
 const h=harness(),headers={'x-lochire-kora-test-key':'sk_test_private_relay'};
 h.env.KORAPAY_WEBHOOKS_ENABLED='true';h.env.KORAPAY_MODE='test';
 assert.equal((await h.call('webhooks/korapay',undefined,null,headers)).data.webhookReady,false);
 h.env.KORAPAY_ALLOW_TEST_KEY_RELAY='true';
 assert.equal((await h.call('webhooks/korapay',undefined,null,headers)).data.webhookReady,true);
 assert.equal((await h.call('webhooks/korapay',undefined,null,{...headers,'x-lochire-service-key':'wrong'})).status,403);
 assert.equal((await h.call('webhooks/korapay',undefined,null,{'x-lochire-kora-test-key':'sk_live_bad'})).data.webhookReady,false);
 const req=new Request('https://private.test',{headers});
 const native={...h.env,KORAPAY_SECRET_KEY:'sk_test_native'};assert.equal(koraRequestEnvironment(native,req),native);
 h.env.KORAPAY_MODE='live';assert.equal((await h.call('webhooks/korapay',undefined,null,headers)).data.webhookReady,false);
});

function fixture(){
 const h=harness();
 Object.assign(h.env,{KORAPAY_MODE:'test',KORAPAY_SECRET_KEY:'sk_test_kora_fixture',KORAPAY_WEBHOOKS_ENABLED:'true'});
 const event={event:'charge.success',data:{reference:'KPY-PAY-fixture',currency:'NGN',status:'success',amount:1000}};
 const charge={reference:event.data.reference,currency:'NGN',status:'success',amount:'1000.00',amount_paid:'1000.00',virtual_bank_account:{account_reference:'LH-CUSTOMER-fixture',account_number:'0123456789'}};
 const signature=e=>createHmac('sha256',h.env.KORAPAY_SECRET_KEY).update(JSON.stringify(e.data)).digest('hex');
 const post=(e=event,signatureOverride)=>h.call('webhooks/korapay',e,null,{'x-korapay-signature':signatureOverride??signature(e)});
 let queries=0;
 const fetcher=async(url,options)=>{queries++;assert.equal(url,'https://api.korapay.com/merchant/api/v1/charges/'+event.data.reference);assert.equal(options.headers.Authorization,'Bearer '+h.env.KORAPAY_SECRET_KEY);return Response.json({status:true,data:charge});};
 return {...h,event,charge,post,signature,fetcher,get queries(){return queries;}};
}

test('Kora receiver is disabled by default and requires approval for live mode',async()=>{
 const h=fixture();delete h.env.KORAPAY_WEBHOOKS_ENABLED;
 assert.equal((await h.post()).status,503);
 let s=(await h.call('webhooks/korapay')).data;assert.equal(s.webhookReady,false);assert.equal(s.automaticCredits,false);assert.equal(JSON.stringify(s).includes(h.env.KORAPAY_SECRET_KEY),false);
 h.env.KORAPAY_WEBHOOKS_ENABLED='true';h.env.KORAPAY_MODE='live';assert.equal((await h.post()).status,503);
 h.env.KORAPAY_SECRET_KEY='sk_live_kora_fixture';assert.equal((await h.post()).status,503);
 h.env.KORAPAY_BUSINESS_APPROVED='true';s=(await h.call('webhooks/korapay')).data;assert.equal(s.webhookReady,true);assert.equal(s.mode,'live');
});

test('forged signatures, whole-body signatures and invalid notifications never query or record',async()=>{
 const h=fixture();const old=global.fetch;global.fetch=h.fetcher;
 try {
  for(const signature of ['', 'a'.repeat(64), createHmac('sha256',h.env.KORAPAY_SECRET_KEY).update(JSON.stringify(h.event)).digest('hex')])assert.equal((await h.post(h.event,signature)).status,401);
  assert.equal((await h.post({event:'charge.success',data:[]})).status,400);
  assert.equal(h.queries,0);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bank_events').bind().first()).n,0);
 }finally{global.fetch=old;}
});

test('verified Kora deposit receipts are recorded once without crediting either real or test balances',async()=>{
 const h=fixture(),old=global.fetch;global.fetch=h.fetcher;
 try {
  const user=await h.register('kora-user');
  const results=await Promise.all([h.post(),h.post(),h.post()]);for(const r of results){assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.credited,false);}
  assert.equal((await h.post()).data.duplicate,true);
  const rows=(await h.db.prepare('SELECT * FROM bank_events').bind().all()).results;assert.equal(rows.length,1);
  const receipt=JSON.parse(rows[0].state);assert.equal(receipt.amount,100000);assert.equal(receipt.mode,'test');assert.equal(receipt.status,'verified_unapplied');
  assert.equal(JSON.stringify(rows).includes('0123456789'),false);assert.equal(JSON.stringify(rows).includes('sk_test'),false);
  assert.equal((await h.call('hiring/state',undefined,user)).data.credits.balance,0);
  assert.equal((await h.db.prepare('SELECT available FROM wallets WHERE user_id=?').bind(user.id).first()).available,0);
 }finally{global.fetch=old;}
});

test('independent query must confirm reference, success, currency, account and exact monetary precision',async()=>{
 const h=fixture(),old=global.fetch;global.fetch=h.fetcher;
 try {
  const original={...h.charge};
  for(const patch of [{reference:'wrong-reference'},{status:'pending'},{currency:'USD'},{virtual_bank_account:null},{amount_paid:'0.00'},{amount_paid:'1.001'},{amount_paid:'9007199254740992'}]){
   Object.assign(h.charge,original,patch);assert.equal((await h.post()).status,409,JSON.stringify(patch));
  }
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bank_events').bind().first()).n,0);
 }finally{global.fetch=old;}
});

test('provider timeouts stay retryable and do not acknowledge a verified receipt',async()=>{
 const h=fixture(),old=global.fetch;global.fetch=async()=>{throw Error('private provider detail');};
 try {const r=await h.post();assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.data),/private provider detail|sk_test/);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bank_events').bind().first()).n,0);}
 finally{global.fetch=old;}
});

test('test and live notifications are isolated; unsupported events never move money',async()=>{
 const h=fixture(),old=global.fetch;global.fetch=h.fetcher;
 try {
  assert.equal((await h.post()).status,200);
  Object.assign(h.env,{KORAPAY_MODE:'live',KORAPAY_SECRET_KEY:'sk_live_kora_fixture',KORAPAY_BUSINESS_APPROVED:'true'});
  assert.equal((await h.post()).status,200);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM bank_events').bind().first()).n,2);
  const queries=h.queries;assert.equal((await h.post({event:'transfer.success',data:{reference:'payout-test'}})).data.handled,false);assert.equal(h.queries,queries);
 }finally{global.fetch=old;}
});
