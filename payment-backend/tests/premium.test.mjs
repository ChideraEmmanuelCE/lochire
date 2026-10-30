import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {harness} from './paystack-fixture.mjs';
import {premiumAccess,queueNearbyJobAlerts} from '../lib/premium.mjs';
import {deliverWorkEmails} from '../lib/work-email.mjs';

async function fixture(){
 const h=harness();delete h.env.PAYMENTS_PRODUCT;h.opening.max=200000; // Premium scenarios exceed the ₦150,000 boundary.
 const people=await h.setup();
 Object.assign(h.env,{PAYSTACK_MODE:'test',PAYSTACK_PREMIUM_ENABLED:'true',PAYSTACK_SECRET_KEY:'sk_test_premium_fixture',PAYSTACK_PREMIUM_TEST_USERS:people.w.id});
 return {...h,...people};
}
async function checkout(h,tier='access',user=h.w,requestId=crypto.randomUUID()){
 return h.call('payments/premium/checkout',{tier,amount:tier==='access'?90000:120000,consent:true,alertsConsent:tier==='alerts',requestId},user);
}
function provider(h,{status='success',patch={},failInit=false}={}){
 const calls=[],charges=new Map(),original=global.fetch;
 global.fetch=async(url,opts)=>{
  calls.push({url,opts});
  if(url.endsWith('/transaction/initialize')){if(failInit)throw Error('private network detail');const b=JSON.parse(opts.body);charges.set(b.reference,{id:101,domain:h.env.PAYSTACK_MODE,reference:b.reference,currency:'NGN',amount:b.amount,status,customer:{email:b.email},metadata:b.metadata,fees:1350,...patch});return Response.json({status:true,data:{reference:b.reference,authorization_url:'https://checkout.paystack.com/'+b.reference+'/pay'}});}
  const reference=url.split('/').at(-1);return Response.json({status:true,data:charges.get(reference)});
 };
 return {calls,charges,restore(){global.fetch=original;}};
}

test('the default product exposes locked previews without private job fields and lists workers for free',async()=>{
 const h=await fixture();
 for(const user of [null,h.w,h.outsider]){const r=await h.call('hiring/state',undefined,user);assert.equal(r.status,200);const o=r.data.openings.find(o=>o.id===h.oid);assert.equal(o.locked,true);for(const k of ['description','employerId','postcode','skills','duration'])assert.equal(k in o,false);assert.equal(r.data.workers.length,1);assert.equal(r.data.workers[0].id,h.w.profile);}
 const own=await h.call('hiring/state',undefined,h.e);assert.equal(own.data.openings[0].locked,false);assert.match(own.data.openings[0].description,/leaking/);
 const denied=await h.call('hiring/engagements',{role:'worker',openingId:h.oid,message:'Please consider me.'},h.w);assert.equal(denied.status,403);
 const gid=await h.invite(h.e,h.w,h.oid);assert.equal((await h.action(h.w,gid,'accept')).status,200);assert.equal((await h.call('hiring/state',undefined,h.w)).data.openings[0].locked,false);
});

test('budget boundary: ₦150,000 jobs are free to view and contact; ₦150,001 jobs require Premium',async()=>{
  const h=await fixture();
  for(const max of [150000,150001]){
    const post={...h.opening,requestId:crypto.randomUUID(),title:'Boundary '+max,min:10000,max};
    const saved=await h.call('hiring/openings',post,h.e);assert.equal(saved.status,200,JSON.stringify(saved.data));
    const anonymous=await h.call('hiring/state');const job=anonymous.data.openings.find(o=>o.title===post.title);
    assert.equal(job.premium,max>150000);assert.equal(job.locked,max>150000);
    assert.equal('description' in job,max<=150000);
    const worker=await h.call('hiring/engagements',{role:'worker',openingId:job.id,message:'Available to help with this job.'},h.w);
    assert.equal(worker.status,max<=150000?200:403,JSON.stringify(worker.data));
  }
});

test('salary, balance, payout and old provider routes are retired on the default product',async()=>{
 const h=await fixture();for(const path of ['payments/topup','payments/checkout','payments/banks','payments/bank/save','payments/kora/account','payments/kora/withdraw','payments/premium/credits'])assert.equal((await h.call(path,{},h.w)).status,410,path);
 assert.equal((await h.call('webhooks/paystack',{})).status,401);assert.equal((await h.call('webhooks/wema/transactions',{})).status,410);
 const c=(await h.call('config')).data;assert.equal(c.features.salaryPayments,false);assert.equal(c.features.walletFunding,false);assert.equal(c.payments.name,'Paystack');assert.equal(c.payments.ready,false);
});

test('checkout takes server prices and signed-in identity, charges kobo, and rejects hidden edits',async()=>{
 const h=await fixture(),p=provider(h);try{
  const id=crypto.randomUUID(),r=await checkout(h,'access',h.w,id);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.order.amount,90000);
  const b=JSON.parse(p.calls[0].opts.body);assert.equal(b.amount,90000);assert.equal(b.email,'artisan@example.test');assert.equal(b.metadata['lochire-user'],h.w.id);assert.equal(b.subaccount,undefined);assert.equal(b.plan,undefined);assert.match(b.callback_url,/premium_reference=LHPR-/);
  assert.equal((await checkout(h,'access',h.w,id)).data.checkoutUrl,r.data.checkoutUrl);assert.equal(p.calls.length,1);
  for(const patch of [{amount:1},{tier:'fake'},{consent:false}])assert.ok((await h.call('payments/premium/checkout',{tier:'access',amount:90000,consent:true,requestId:crypto.randomUUID(),...patch},h.w)).status>=400);
  assert.equal((await checkout(h,'access',h.outsider)).status,503);
 }finally{p.restore();}
});

test('verification unlocks exactly the order owner once and persists through logout and fresh sign-in',async()=>{
 const h=await fixture(),p=provider(h);try{
  const r=await checkout(h),reference=r.data.order.reference;
  assert.equal((await h.call('payments/premium/verify',{reference},h.outsider)).status,404);
  const verify=()=>h.call('payments/premium/verify',{reference},h.w);
  const results=await Promise.all([verify(),verify(),verify()]);for(const r of results){assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.premium.active,true);assert.equal(r.data.premium.alerts,false);}
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM lh_premium_grants').bind().first()).n,1);
  assert.equal((await h.call('hiring/state',undefined,h.w)).data.openings[0].locked,false);
  assert.equal((await h.call('hiring/state',undefined,h.outsider)).data.openings[0].locked,true);
  await h.call('auth/logout',{},h.w);const signed=await h.call('auth/login',{email:'artisan@example.test',password:'SecureFixturePassword123!'});assert.equal(signed.data.premium.active,true);assert.equal(signed.data.worker.id,h.w.profile);assert.equal(signed.data.premiumOrders.length,1);
 }finally{p.restore();}
});

test('forged callbacks, wrong amounts, incomplete payments and wrong emails never grant access',async()=>{
 for(const patch of [{currency:'USD'},{reference:'LHPR-'+ 'a'.repeat(32)},{amount:89900},{amount:'90000'},{customer:{email:'outsider@example.test'}},{domain:'live'},{metadata:{'lochire-user':'wrong','lochire-tier':'access'}}]){
  const h=await fixture(),p=provider(h,{patch});try{const r=await checkout(h),reference=r.data.order.reference;assert.equal((await h.call('payments/premium/verify',{reference},h.w)).status,409,JSON.stringify(patch));assert.equal((await premiumAccess(h.db,h.w,h.env)).active,false);}finally{p.restore();}
 }
 const h=await fixture(),p=provider(h,{status:'processing'});try{const r=await checkout(h),reference=r.data.order.reference;const r2=await h.call('payments/premium/verify',{reference},h.w);assert.equal(r2.status,200);assert.equal(r2.data.premium.active,false);const event={event:'charge.success',data:{reference,currency:'NGN',amount:900,status:'success'}};assert.equal((await h.call('webhooks/paystack',event,null,{'x-paystack-signature':'a'.repeat(64)})).status,401);}finally{p.restore();}
});

test('a signed checkout webhook works without virtual bank account fields and cannot duplicate a pass',async()=>{
 const h=await fixture(),p=provider(h);try{const r=await checkout(h,'alerts'),reference=r.data.order.reference,event={event:'charge.success',data:{reference,amount:120000,currency:'NGN',status:'success'}};
 const signature=createHmac('sha512',h.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(event)).digest('hex');
 for(let i=0;i<3;i++){const r=await h.call('webhooks/paystack',event,null,{'x-paystack-signature':signature});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.unlocked,true);}
 const a=await premiumAccess(h.db,h.w,h.env);assert.equal(a.alerts,true);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM lh_premium_grants').bind().first()).n,1);
 }finally{p.restore();}
});

test('pending initialization is saved on timeouts; duplicate requests never create another charge',async()=>{
 const h=await fixture(),p=provider(h,{failInit:true}),id=crypto.randomUUID();try{
 const r=await checkout(h,'access',h.w,id);assert.equal(r.status,503);assert.doesNotMatch(JSON.stringify(r.data),/private network detail|sk_test/);
 const r2=await checkout(h,'access',h.w,id);assert.equal(r2.status,200);assert.equal(r2.data.order.status,'initializing');assert.equal(r2.data.checkoutUrl,null);assert.equal(p.calls.length,1);
 }finally{p.restore();}
});

test('test passes never grant live access, live checkout needs a live key, and expiry locks new jobs',async()=>{
 const h=await fixture(),p=provider(h);try{const r=await checkout(h);await h.call('payments/premium/verify',{reference:r.data.order.reference},h.w);assert.equal((await premiumAccess(h.db,h.w,h.env)).active,true);assert.equal((await premiumAccess(h.db,h.w,{PAYSTACK_MODE:'live'})).active,false);
 h.env.PAYSTACK_MODE='live';assert.equal((await checkout(h)).status,503);h.env.PAYSTACK_SECRET_KEY='sk_live_fixture';h.env.PAYSTACK_PREMIUM_ENABLED='false';assert.equal((await checkout(h)).status,503);h.env.PAYSTACK_PREMIUM_ENABLED='true';h.env.PAYSTACK_MODE='test';h.env.PAYSTACK_SECRET_KEY='sk_test_premium_fixture';await h.db.prepare("UPDATE lh_premium_grants SET expires_at='2020-01-01T00:00:00.000Z'").bind().run();assert.equal((await h.call('hiring/state',undefined,h.w)).data.openings[0].locked,true);
 }finally{p.restore();}
});

async function grant(h,user,tier,mode='live'){
 const ref='LHPR-'+crypto.randomUUID().replaceAll('-',''),stamp=new Date(Date.now()-60000).toISOString();
 await h.db.prepare("INSERT INTO lh_kora_premium_orders(reference,user_id,mode,tier,amount,status,claim,created_at,applied) VALUES(?,?,?,?,?,'success',?,?,1)").bind(ref,user.id,mode,tier,tier==='alerts'?120000:90000,crypto.randomUUID(),stamp).run();
 await h.db.prepare('INSERT INTO lh_premium_grants(reference,user_id,mode,tier,starts_at,expires_at) VALUES(?,?,?,?,?,?)').bind(ref,user.id,mode,tier,stamp,new Date(Date.now()+30*86400000).toISOString()).run();
 return ref;
}

test('live Starter checkout uses one-time LocHire fees and preserves historical Kora access',async()=>{
 const h=await fixture();Object.assign(h.env,{PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_premium_fixture'});
 const legacy=await grant(h,h.w,'access');assert.equal((await premiumAccess(h.db,h.w,h.env)).active,true);
 const p=provider(h);try{
  const r=await checkout(h,'alerts');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.order.provider,'paystack');
  const result=await h.call('payments/premium/verify',{reference:r.data.order.reference},h.w);assert.equal(result.status,200);assert.equal(result.data.premium.alerts,true);
  const old=await h.db.prepare('SELECT provider,applied FROM lh_kora_premium_orders WHERE reference=?').bind(legacy).first();assert.equal(old.provider,'korapay');assert.equal(old.applied,1);
  const event={event:'charge.success',data:{reference:legacy}},signature=createHmac('sha512',h.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(event)).digest('hex');
  const calls=p.calls.length;assert.equal((await h.call('webhooks/paystack',event,null,{'x-paystack-signature':signature})).data.handled,false);assert.equal(p.calls.length,calls,'Paystack must not reconcile a Kora order');
 }finally{p.restore();}
});

test('verified refunds revoke only their pass and late charge events cannot restore refunded access',async()=>{
 for(const paidBeforeRefund of [true,false]){
  const h=await fixture(),p=provider(h);
  try{
   const purchase=await checkout(h,'alerts'),reference=purchase.data.order.reference;
   if(paidBeforeRefund)await h.call('payments/premium/verify',{reference},h.w);
   const transaction=p.charges.get(reference),providerFetch=global.fetch;
   let refund={id:77,transaction:transaction.id,domain:'test',currency:'NGN',amount:120000,status:'processing'};
   global.fetch=async(url,options)=>url.endsWith('/refund/77')?Response.json({status:true,data:refund}):url.endsWith('/transaction/'+transaction.id)?Response.json({status:true,data:transaction}):providerFetch(url,options);
   async function event(kind,data){const body={event:kind,data},signature=createHmac('sha512',h.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(body)).digest('hex');return h.call('webhooks/paystack',body,null,{'x-paystack-signature':signature});}
   assert.equal((await event('refund.processed',{id:77})).status,409,'pending refunds cannot revoke access');
   refund.status='processed';for(let i=0;i<2;i++)assert.equal((await event('refund.processed',{id:77})).status,200);
   assert.equal((await premiumAccess(h.db,h.w,h.env)).active,false);
   transaction.status='failed';await h.call('payments/premium/verify',{reference},h.w);
   transaction.status='success';assert.equal((await event('charge.success',{reference})).data.unlocked,false);assert.equal((await premiumAccess(h.db,h.w,h.env)).active,false);
   assert.equal((await h.db.prepare('SELECT status FROM lh_kora_premium_orders WHERE reference=?').bind(reference).first()).status,'refunded');
   await grant(h,h.w,'access','test');assert.equal((await premiumAccess(h.db,h.w,h.env)).active,true);assert.equal((await premiumAccess(h.db,h.w,h.env)).alerts,false);
  }finally{p.restore();}
 }
});
test('only verified Plus members receive matching new-job email, with duplicate and preference protection',async()=>{
 const h=await fixture(),mails=[],old=global.fetch;
 await grant(h,h.w,'alerts');await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at,hiring_email_enabled) VALUES(?,?,1)').bind(h.w.id,new Date().toISOString()).run();
 await h.db.prepare('INSERT INTO lh_job_alert_preferences(user_id,enabled,city,area,category) VALUES(?,1,?,?,?)').bind(h.w.id,'Ibadan','Jericho','Plumbing').run();
 await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at) VALUES(?,?)').bind(h.e.id,new Date().toISOString()).run();
 Object.assign(h.env,{RESEND_API_KEY:'re_fixture',EMAIL_FROM:'LocHire <alerts@example.test>'});
 global.fetch=async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');const mail=JSON.parse(opts.body);if(mail.subject.startsWith('New nearby job:'))mails.push(mail);return Response.json({id:'email-fixture'});};
 try{
  await queueNearbyJobAlerts(h.db,h.oid);await queueNearbyJobAlerts(h.db,h.oid);await deliverWorkEmails(h.db,h.env);assert.equal(mails.length,1);assert.deepEqual(mails[0].to,['artisan@example.test']);assert.match(mails[0].text,/Repair kitchen pipe/);assert.match(mails[0].text,/#opening\/OPN-/);assert.doesNotMatch(mails[0].text,/OY-PRIVATE/);
  await queueNearbyJobAlerts(h.db,h.oid);await deliverWorkEmails(h.db,h.env);assert.equal(mails.length,1);
  const r=await h.call('hiring/openings',{...h.opening,requestId:crypto.randomUUID(),city:'Lagos'},h.e);assert.equal(r.status,200);assert.equal(mails.length,1);
  await h.db.prepare('UPDATE lh_job_alert_preferences SET enabled=0 WHERE user_id=?').bind(h.w.id).run();
  assert.equal((await h.call('hiring/openings',{...h.opening,requestId:crypto.randomUUID()},h.e)).status,200);assert.equal(mails.length,1);
 }finally{global.fetch=old;}
});

test('the 900 pass and sandbox Plus passes do not send new-job alerts; expiry suppresses queued content',async()=>{
 for(const [tier,mode]of [['access','live'],['alerts','test']]){const h=await fixture();await grant(h,h.w,tier,mode);await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at) VALUES(?,?)').bind(h.w.id,new Date().toISOString()).run();await h.db.prepare("INSERT INTO lh_job_alert_preferences(user_id,enabled,city,area,category) VALUES(?,1,'Ibadan','Jericho','Plumbing')").bind(h.w.id).run();await queueNearbyJobAlerts(h.db,h.oid);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM lh_job_alerts').bind().first()).n,0);}
});

test('Kora requests use workerd-compatible manual redirects and never follow a provider redirect',async()=>{
 const {koraProviderFetch}=await import('../lib/korapay.mjs');const old=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}});};
 try{await assert.rejects(koraProviderFetch({},'/charges/LHPR-fixture',{redirect:'error',headers:{Authorization:'Bearer private-fixture'}}),/unexpected redirect/);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.korapay.com/merchant/api/v1/charges/LHPR-fixture');}finally{global.fetch=old;}
});

async function alertFixture(){
 const h=await fixture();await grant(h,h.w,'alerts');
 await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at,hiring_email_enabled) VALUES(?,?,0)').bind(h.w.id,new Date().toISOString()).run();
 await h.db.prepare("INSERT INTO lh_job_alert_preferences(user_id,enabled,city,area,category) VALUES(?,1,'Ibadan','Jericho','Plumbing')").bind(h.w.id).run();
 Object.assign(h.env,{RESEND_API_KEY:'re_fixture',EMAIL_FROM:'LocHire <alerts@example.test>'});
 return h;
}

test('Plus emails have a readable job summary, preference link and independent opt-in; retries keep the exact payload',async()=>{
 const h=await alertFixture(),old=global.fetch,mails=[];let fail=true;
 global.fetch=async(url,opts)=>{mails.push({body:JSON.parse(opts.body),key:opts.headers['Idempotency-Key']});return fail?Response.json({error:'temporary'},{status:503}):Response.json({id:'mail-fixture'});};
 try{
  await queueNearbyJobAlerts(h.db,h.oid);await deliverWorkEmails(h.db,h.env);assert.equal(mails.length,1,'Plus opt-in is independent of invitation opt-out');
  const mail=mails[0].body;assert.deepEqual(mail.to,['artisan@example.test']);assert.match(mail.subject,/New nearby job: Repair kitchen pipe/);assert.match(mail.text,/₦15,000 – ₦200,000 per task/);assert.match(mail.text,/Location: Jericho, Ibadan/);assert.match(mail.text,/Job date: /);assert.match(mail.text,/manage_job_alerts=1#premium/);assert.match(mail.html,/role="presentation"/);assert.match(mail.html,/max-width:560px/);assert.match(mail.html,/View job &amp; express interest/);assert.match(mail.html,/Manage or turn off nearby job emails/);assert.doesNotMatch(JSON.stringify(mail),/OY-PRIVATE|08012345678|sk_test|re_fixture/);
  const row=await h.db.prepare('SELECT * FROM live_notification_emails WHERE notification_id LIKE ?').bind('JOB-%').first();assert.equal(row.status,'pending');
  const opening=await h.db.prepare('SELECT data FROM live_openings WHERE id=?').bind(h.oid).first();await h.db.prepare('UPDATE live_openings SET data=? WHERE id=?').bind(JSON.stringify({...JSON.parse(opening.data),title:'Changed after first attempt'}),h.oid).run();
  fail=false;await deliverWorkEmails(h.db,h.env,{now:row.next_at});assert.equal(mails.length,2);assert.deepEqual(mails[1],mails[0],'retry body and provider idempotency key remain unchanged');
 }finally{global.fetch=old;}
});

test('queued job emails are suppressed after opt-out, expiry, a closed job or a new block',async()=>{
 for(const reason of ['optout','expired','closed','blocked']){
  const h=await alertFixture(),old=global.fetch;let sent=0;global.fetch=async()=>{sent++;return Response.json({id:'unexpected'});};
  try{
   await queueNearbyJobAlerts(h.db,h.oid);const row=await h.db.prepare('SELECT notification_id FROM lh_job_alerts').bind().first();assert.ok(row);
   if(reason==='optout')await h.db.prepare('UPDATE lh_job_alert_preferences SET enabled=0 WHERE user_id=?').bind(h.w.id).run();
   if(reason==='expired')await h.db.prepare("UPDATE lh_premium_grants SET expires_at='2020-01-01T00:00:00.000Z'").bind().run();
   if(reason==='closed')await h.db.prepare("UPDATE live_openings SET status='Closed' WHERE id=?").bind(h.oid).run();
   if(reason==='blocked')await h.db.prepare('INSERT INTO live_blocks(actor,target) VALUES(?,?)').bind(h.w.profile,h.e.profile).run();
   await deliverWorkEmails(h.db,h.env);assert.equal(sent,0,reason);assert.equal((await h.db.prepare('SELECT status FROM live_notification_emails WHERE notification_id=?').bind(row.notification_id).first()).status,'skipped',reason);
  }finally{global.fetch=old;}
 }
});
