import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const migration=readFileSync(new URL('../drizzle/0017_remove_confirmed_demo_accounts.sql',import.meta.url),'utf8');
const targets=[...migration.matchAll(/WHERE id='(LH-[a-f0-9-]+)' AND email='([^']+@example\.test)'/g)].map(m=>({id:m[1],email:m[2]}));
const stamp='2026-10-16T14:00:00.000Z';
function fixture(changeEmail=false){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<'0017_').sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const insert=(t,row)=>db.prepare(`INSERT INTO ${t}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
 const users=[...targets.map((u,i)=>({...u,email:changeEmail&&i===0?'real-person@example.com':u.email})),{id:'owner',email:'owner@example.com'},{id:'realworker',email:'real-worker@example.com'},{id:'unlisted-test-email',email:'genuine@example.test'}];
 for(const u of users){insert('users',{...u,name:u.id==='realworker'?'Demo Tester':'Fixture user',phone:'08012345678',role:'both',password_hash:'fixture-only',password_salt:'fixture-only',created_at:stamp});insert('wallets',{user_id:u.id,available:10000,active_role:'worker'});insert('sessions',{hash:'session-'+u.id,user_id:u.id,expires_at:9999999999999});insert('live_account_settings',{user_id:u.id,email_verified_at:stamp});insert('demo_bank_balances',{user_id:u.id,available:1000});insert('live_presence',{user_id:u.id,last_seen_at:123});insert('operations',{id:'op-'+u.id,user_id:u.id,key:'fixture',fingerprint:'fixture',kind:'test_credit',created_at:stamp});}
 const qa=targets[1].id,qb=targets[2].id;
 for(const [id,user_id,role]of [['qa-hirer',qa,'employer'],['qa-worker',qb,'worker'],['owner-hirer','owner','employer'],['owner-worker','owner','worker'],['real-worker','realworker','worker']])insert('live_profiles',{id,user_id,role,published:1,data:JSON.stringify({name:'Saved '+id}),updated_at:stamp});
 for(const [id,employer_id]of [['qa-opening','qa-hirer'],['real-opening','owner-hirer']])insert('live_openings',{id,employer_id,status:'Open',data:JSON.stringify({title:id}),created_at:stamp});
 for(const [id,opening_id,worker_id,employer_id]of [['qa-work','qa-opening','qa-worker','qa-hirer'],['mixed-work','real-opening','qa-worker','owner-hirer'],['real-work','real-opening','real-worker','owner-hirer']]){
  insert('live_engagements',{id,opening_id,worker_id,employer_id,status:'Completed',data:'{}',created_at:stamp});insert('live_reviews',{id:'review-'+id,engagement_id:id,author:employer_id,target:worker_id,rating:5,text:'Fixture review',created_at:stamp});insert('live_payments',{id:'payment-'+id,engagement_id:id,payer:employer_id,recipient:worker_id,amount:10000,method:'cash',note:'fixture',status:'acknowledged',created_at:stamp});insert('live_notifications',{id:'notice-'+id,user_id:'owner',kind:'message',title:id,engagement_id:id,created_at:stamp});
 }
 insert('live_blocks',{actor:'owner-worker',target:'qa-hirer'});insert('live_reports',{id:'qa-report',user_id:'owner',target:'qa-worker',kind:'profile',reason:'fixture',details:'fixture',status:'open',created_at:stamp});
 for(const [id,opening_id,worker_id,employer_id]of [['qa-match','qa-opening','qa-worker','qa-hirer'],['real-match','real-opening','real-worker','owner-hirer']])insert('live_worker_matches',{id,opening_id,worker_id,employer_id,data:'{}',created_at:stamp});
 for(const [id,employer_id,worker_id]of [['qa-job',qa,qb],['real-job','owner','realworker']]){
  insert('payment_jobs',{id,employer_id,worker_id,title:id,scope:'fixture',category:'Plumbing',amount:10000,status:'completed',created_at:stamp});insert('job_locations',{job_id:id,postcode:'fixture',status:'verified',environment:'demo'});insert('transactions',{id:'tx-'+id,reference:'receipt-'+id,user_id:worker_id,job_id:id,kind:'test_credit',amount:10000,status:'success',description:'fixture',created_at:stamp});insert('payment_reviews',{id:'old-review-'+id,job_id:id,author_id:employer_id,target_id:worker_id,rating:5,text:'fixture',created_at:stamp});insert('bank_requests',{id:'bank-'+id,user_id:employer_id,reference:'bankref-'+id,job_id:id,kind:'payment',environment:'demo',created_at:stamp});insert('bank_events',{id:'event-'+id,reference:'bankref-'+id,state:'fixture',created_at:stamp});
 }
 for(const [user_id,ref]of [[qa,'qa-premium'],['owner','owner-premium']]){
  insert('lh_kora_premium_orders',{reference:ref,user_id,mode:user_id===qa?'test':'live',tier:'alerts',amount:120000,status:'success',claim:ref,created_at:stamp,applied:1});insert('lh_premium_grants',{reference:ref,user_id,mode:user_id===qa?'test':'live',tier:'alerts',starts_at:stamp,expires_at:'2026-11-16T14:00:00.000Z'});insert('lh_job_alert_preferences',{user_id,enabled:1,city:'Ibadan'});
  insert('lh_orders',{reference:'old-'+ref,user_id,mode:'test',kind:'premium',amount:90000,status:'success',claim:ref,created_at:stamp});insert('lh_platform_entries',{id:'platform-'+ref,mode:'test',amount:90000,kind:'premium',reference:'old-'+ref,created_at:stamp});insert('lh_refund_adjustments',{id:'refund-'+ref,reference:'old-'+ref,mode:'test',amount:1000});insert('lh_dispute_holds',{id:'dispute-'+ref,reference:'old-'+ref,mode:'test',user_id,amount:1000,status:'held'});
 }
 insert('lh_job_alerts',{notification_id:'job-notice',user_id:'owner',opening_id:'qa-opening',created_at:stamp});insert('live_notifications',{id:'job-notice',user_id:'owner',kind:'job_alert',title:'Test job',created_at:stamp});insert('live_notification_emails',{notification_id:'job-notice'});
 for(const u of [qa,'owner'])insert('rate_limits',{key:'account:'+u,attempts:1,expires_at:9999999999999});
 return db;
}
const tables=db=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
const snapshot=db=>Object.fromEntries(tables(db).map(t=>[t,db.prepare('SELECT * FROM "'+t+'"').all()]));

test('one-time cleanup removes only the 14 confirmed demo accounts and their linked data without disabling foreign keys',()=>{
 assert.equal(targets.length,14);const db=fixture();
 const ownerProfiles=db.prepare("SELECT * FROM live_profiles WHERE user_id='owner' ORDER BY id").all(),ownerSession=db.prepare("SELECT * FROM sessions WHERE user_id='owner'").all(),ownerPass=db.prepare("SELECT * FROM lh_premium_grants WHERE user_id='owner'").all();
 db.exec(migration);
 assert.deepEqual(db.prepare('SELECT id FROM users ORDER BY id').all().map(r=>r.id),['owner','realworker','unlisted-test-email']);assert.deepEqual(db.prepare("SELECT * FROM live_profiles WHERE user_id='owner' ORDER BY id").all(),ownerProfiles);assert.deepEqual(db.prepare("SELECT * FROM sessions WHERE user_id='owner'").all(),ownerSession);assert.deepEqual(db.prepare("SELECT * FROM lh_premium_grants WHERE user_id='owner'").all(),ownerPass);
 assert.deepEqual(db.prepare('SELECT id FROM payment_jobs').all().map(r=>r.id),['real-job']);assert.deepEqual(db.prepare('SELECT id FROM live_engagements').all().map(r=>r.id),['real-work']);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bank_events WHERE id='event-real-job'").get().n,1);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bank_events WHERE id='event-qa-job'").get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_notifications WHERE id='job-notice'").get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM lh_platform_entries").get().n,1);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_notification_emails WHERE notification_id='job-notice'").get().n,0);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM rate_limits").get().n,1);assert.equal(tables(db).some(t=>t.startsWith('_lochire_demo_cleanup')),false);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 const after=snapshot(db);db.exec(migration);assert.deepEqual(snapshot(db),after,'reapplying never deletes additional users');db.close();
});

test('a listed ID with a different genuine email is preserved; names and generic test email suffixes never identify deletion targets',()=>{
 const db=fixture(true);db.exec(migration);assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get(targets[0].id).email,'real-person@example.com');assert.equal(db.prepare("SELECT name FROM users WHERE id='realworker'").get().name,'Demo Tester');assert.ok(db.prepare("SELECT id FROM users WHERE id='unlisted-test-email'").get());assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
