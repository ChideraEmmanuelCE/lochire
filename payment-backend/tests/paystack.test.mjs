import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {harness} from './paystack-fixture.mjs';
import {paymentReadiness} from '../lib/paystack.mjs';
async function setup(){const h=harness(),actors=await h.setup(),gid=await h.invite(actors.e,actors.w,actors.oid);await h.confirmWork(actors.e,actors.w,gid);Object.assign(h.env,{PAYSTACK_ENABLED:'true',PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_fixture_not_a_real_key'});let calls=[],transaction=null,variant={};
 const fetcher=async(url,o={})=>{const path=new URL(url).pathname,body=o.body?JSON.parse(o.body):null;calls.push({path,body});assert.equal(new URL(url).origin,'https://api.paystack.co');assert.equal(o.headers.Authorization,'Bearer '+h.env.PAYSTACK_SECRET_KEY);
  if(path==='/bank')return Response.json({status:true,data:[{name:'Fixture Bank',code:'999',currency:'NGN',active:true,is_deleted:false}]});
  if(path==='/bank/resolve')return Response.json({status:true,data:{account_number:'0123456789',account_name:'FIXTURE ARTISAN'}});
  if(path==='/subaccount')return Response.json({status:true,data:{subaccount_code:'ACCT_fixture'}});
  if(path==='/transaction/initialize'){transaction={reference:body.reference,amount:body.amount,currency:body.currency,domain:'live',status:'success',subaccount:{subaccount_code:body.subaccount},fees:30000,paid_at:new Date().toISOString()};return Response.json({status:true,data:{reference:body.reference,authorization_url:'https://checkout.paystack.com/fixture'}});}
  if(path.startsWith('/transaction/verify/'))return Response.json({status:true,data:{...transaction,...variant}});
  throw Error('Unexpected provider call');};
 async function bank(){let r=await h.call('payments/bank/resolve',{bankCode:'999',accountNumber:'0123456789',consent:true},actors.w);assert.equal(r.status,200);r=await h.call('payments/bank/save',{token:r.data.token,password:'SecureFixturePassword123!',consent:true},actors.w);assert.equal(r.status,200,JSON.stringify(r.data));return r;}
 async function checkout(){const r=await h.call('payments/checkout',{engagementId:gid,version:1},actors.e);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
 async function webhook(event,rawOverride,signatureOverride){const raw=rawOverride||JSON.stringify(event),sig=signatureOverride||createHmac('sha512',h.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');const res=await h.call('webhooks/paystack',event,null,{'x-paystack-signature':sig});return res;}
 return {...h,...actors,gid,bank,checkout,calls,fetcher,variant,webhook};}

test('Paystack activation never exposes credentials or turns test payments into live money',()=>{assert.equal(paymentReadiness({APP_MODE:'production',PAYSTACK_ENABLED:'true',PAYSTACK_MODE:'test',PAYSTACK_SECRET_KEY:'sk_test_fixture'}).ready,false);assert.equal(paymentReadiness({APP_MODE:'production',PAYSTACK_ENABLED:'true',PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_test_fixture'}).ready,false);assert.equal(JSON.stringify(paymentReadiness({PAYSTACK_SECRET_KEY:'sk_live_secret'})).includes('secret'),false);});

test('worker confirms a private bank account, hirer checks out and only matching provider verification marks it paid',async()=>{const h=await setup(),original=global.fetch;global.fetch=h.fetcher;try{
 const cfg=(await h.call('config')).data;assert.equal(cfg.payments.provider,'Paystack');assert.equal('wema' in cfg,false);
 assert.equal((await h.call('payments/bank/resolve',{bankCode:'999',accountNumber:'0123456789'},h.w)).status,400);
 await h.bank();const own=(await h.call('hiring/state',undefined,h.w)).data;assert.equal(own.bank.last4,'6789');assert.equal(JSON.stringify(own).includes('0123456789'),false);assert.equal((await h.call('hiring/state')).data.bank,null);
 assert.equal((await h.call('payments/checkout',{engagementId:h.gid,version:1},h.w)).status,403);assert.equal((await h.call('payments/checkout',{engagementId:h.gid,version:2},h.e)).status,409);
 const c=await h.checkout();assert.equal(c.payment.amount,2000000);const init=h.calls.find(c=>c.path==='/transaction/initialize').body;assert.equal(init.subaccount,'ACCT_fixture');assert.equal(init.bearer,'subaccount');assert.equal(init.transaction_charge,0);
 await h.checkout();assert.equal(h.calls.filter(c=>c.path==='/transaction/initialize').length,1);
 assert.equal((await h.call('payments/verify',{reference:c.payment.reference},h.outsider)).status,404);
 for(const v of [{amount:1},{currency:'USD'},{domain:'test'},{subaccount:{subaccount_code:'ACCT_wrong'}},{reference:'wrong'}]){Object.assign(h.variant,v);assert.equal((await h.call('payments/verify',{reference:c.payment.reference},h.e)).status,409);for(const k of Object.keys(v))delete h.variant[k];}
 let r=await h.call('payments/verify',{reference:c.payment.reference},h.e);assert.equal(r.status,200);assert.equal(r.data.payment.status,'success');assert.equal(r.data.payment.fees,30000);
 r=await h.call('hiring/state',undefined,h.w);assert.equal(r.data.onlinePayments[0].status,'success');assert.equal(r.data.payments.length,0);assert.equal((await h.call('payments/checkout',{engagementId:h.gid,version:1},h.e)).status,409);
 }finally{global.fetch=original;}});

test('signed webhook verifies authoritative payment once, rejects forgery and handles reversal without crediting a wallet',async()=>{const h=await setup(),original=global.fetch;global.fetch=h.fetcher;try{await h.bank();const c=await h.checkout(),event={event:'charge.success',data:{reference:c.payment.reference,amount:1}};
 assert.equal((await h.webhook(event,null,'0'.repeat(128))).status,401);assert.equal((await h.webhook(event)).status,200);assert.equal((await h.webhook(event)).status,200);
 let state=(await h.call('hiring/state',undefined,h.w)).data;assert.equal(state.onlinePayments.length,1);assert.equal(state.notifications.filter(n=>n.title==='Payment confirmed by Paystack').length,1);
 const wallet=(await h.call('wallet',undefined,h.w)).data;assert.equal(wallet.wallet.available,null);assert.deepEqual(wallet.transactions,[]);
 h.variant.status='reversed';assert.equal((await h.call('payments/verify',{reference:c.payment.reference},h.e)).data.payment.status,'reversed');h.variant.status='success';assert.equal((await h.call('payments/verify',{reference:c.payment.reference},h.e)).data.payment.status,'reversed');
 }finally{global.fetch=original;}});

test('ambiguous checkout timeouts cannot create a second charge or lose the saved reference',async()=>{const h=await setup(),original=global.fetch;global.fetch=h.fetcher;try{await h.bank();let attempts=0;global.fetch=async(u,o)=>{if(new URL(u).pathname==='/transaction/initialize'){attempts++;throw Error('Timeout');}return h.fetcher(u,o);};
 assert.equal((await h.call('payments/checkout',{engagementId:h.gid,version:1},h.e)).status,503);const retry=await h.call('payments/checkout',{engagementId:h.gid,version:1},h.e);assert.equal(retry.status,200);assert.equal(retry.data.checkoutUrl,null);assert.equal(attempts,1);assert.equal(retry.data.payment.status,'initializing');
 }finally{global.fetch=original;}});
test('a configured work fee is sent to Paystack and only its verified allocation becomes owner revenue',async()=>{const h=await setup(),old=global.fetch;const at=new Date().toISOString();await h.db.prepare('INSERT INTO lh_commerce_settings(id,commission_bps,premium_amount,updated_at) VALUES(?,?,?,?)').bind('main',500,100000,at).run();global.fetch=h.fetcher;try{await h.bank();const c=await h.checkout();assert.equal(h.calls.find(c=>c.path==='/transaction/initialize').body.transaction_charge,100000);assert.equal((await h.call('payments/verify',{reference:c.payment.reference},h.e)).status,409);h.variant.fees_split={integration:100000,params:{bearer:'subaccount'}};assert.equal((await h.call('payments/verify',{reference:c.payment.reference},h.e)).status,200);await h.call('payments/verify',{reference:c.payment.reference},h.e);const row=await h.db.prepare("SELECT SUM(amount) AS n FROM lh_platform_entries WHERE kind='work_fee'").bind().first();assert.equal(row.n,100000);
 h.variant.status='reversed';await h.call('payments/verify',{reference:c.payment.reference},h.e);assert.equal((await h.db.prepare('SELECT SUM(amount) AS n FROM lh_platform_entries').bind().first()).n,0);
}finally{global.fetch=old;}});
