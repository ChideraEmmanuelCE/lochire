import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './paystack-fixture.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {deliverWorkEmails} from '../lib/work-email.mjs';

async function fixture(){
 const h=harness(),people=await h.setup();
 // This suite isolates ordinary work mail; radar emails have their own suite.
 await h.db.prepare("DELETE FROM live_notifications WHERE kind='worker_match'").bind().run();
 const profile=await h.db.prepare("SELECT data FROM live_profiles WHERE id=?").bind(people.e.profile).first();
 await h.db.prepare('UPDATE live_profiles SET data=? WHERE id=?').bind(JSON.stringify({...JSON.parse(profile.data),candidateAlerts:false}),people.e.profile).run();
 for(const u of [people.e,people.w])await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at) VALUES(?,?)').bind(u.id,new Date().toISOString()).run();
 Object.assign(h.env,{RESEND_API_KEY:'re_fixture',EMAIL_FROM:'LocHire <accounts@verified.example>',EMAIL_MODE:'production'});
 return {...h,...people};
}
const queued=async h=>(await h.db.prepare('SELECT * FROM live_notification_emails').bind().all()).results;

test('a saved invitation emails only its verified recipient once, without private work details',async()=>{
 const h=await fixture(),old=global.fetch,mails=[];
 global.fetch=async(url,o)=>{assert.equal(url,'https://api.resend.com/emails');mails.push({body:JSON.parse(o.body),key:o.headers['Idempotency-Key']});return Response.json({id:'mail-fixture'});};
 try{
  const gid=await h.invite(h.e,h.w,h.oid);await h.invite(h.e,h.w,h.oid);
  await h.current(h.w,gid);assert.equal(mails.length,1);assert.deepEqual(mails[0].body.to,['artisan@example.test']);
  assert.match(mails[0].body.text,/#record\/ENG-/);assert.doesNotMatch(mails[0].body.text,/Please discuss|Repair kitchen pipe|08012345678|OY-PRIVATE/);
  assert.equal((await queued(h)).length,1);assert.equal((await queued(h))[0].status,'sent');
  await h.action(h.w,gid,'accept');await h.action(h.e,gid,'message',{text:'PRIVATE NEW MESSAGE'});
  assert.equal(mails.length,3);assert.doesNotMatch(JSON.stringify(mails),/PRIVATE NEW MESSAGE/);
 }finally{global.fetch=old;}
});

test('failed delivery keeps work saved and retries the same email with the same idempotency key',async()=>{
 const h=await fixture(),old=global.fetch,keys=[];let fail=true;
 global.fetch=async(url,o)=>{keys.push(o.headers['Idempotency-Key']);if(fail)throw Error('Lost response');return Response.json({id:'mail-fixture'});};
 try{
  const gid=await h.invite(h.e,h.w,h.oid);assert.equal((await h.current(h.w,gid)).status,'Pending');
  const row=(await queued(h))[0];assert.equal(row.status,'pending');assert.equal(keys.length,1);
  fail=false;await deliverWorkEmails(h.db,h.env,{now:row.next_at});
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal((await queued(h))[0].status,'sent');
 }finally{global.fetch=old;}
});

test('unverified recipients and opted-out users receive no work emails; preferences persist',async()=>{
 const h=await fixture(),old=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return Response.json({id:'mail-fixture'});};
 try{
  assert.equal((await h.call('auth/email-preferences',{enabled:'false'},h.w)).status,400);
  assert.equal((await h.call('auth/email-preferences',{enabled:false},h.w)).status,200);
  await h.invite(h.e,h.w,h.oid);assert.equal(calls,0);assert.equal((await queued(h))[0].status,'skipped');
  assert.equal((await h.call('hiring/state',undefined,h.w)).data.user.emailAlertsEnabled,false);
  await h.call('auth/email-preferences',{enabled:true},h.w);
  await h.db.prepare('UPDATE live_account_settings SET email_verified_at=NULL WHERE user_id=?').bind(h.w.id).run();
  await h.db.prepare('INSERT INTO live_notifications(id,user_id,kind,title,created_at) VALUES(?,?,?,?,?)').bind('NOT-unverified',h.w.id,'message','private',new Date().toISOString()).run();
  await deliverWorkEmails(h.db,h.env);assert.equal(calls,0);assert.equal((await queued(h)).find(x=>x.notification_id==='NOT-unverified').status,'skipped');
 }finally{global.fetch=old;}
});

test('concurrent delivery claims send once and uncertain old sends are held for review',async()=>{
 const h=await fixture(),old=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return Response.json({id:'mail-fixture'});};
 try{
  await h.db.prepare('INSERT INTO live_notifications(id,user_id,kind,title,created_at) VALUES(?,?,?,?,?)').bind('NOT-concurrent',h.w.id,'message','private',new Date().toISOString()).run();
  await Promise.all([deliverWorkEmails(h.db,h.env),deliverWorkEmails(h.db,h.env)]);assert.equal(calls,1);
  await h.db.prepare('INSERT INTO live_notifications(id,user_id,kind,title,created_at) VALUES(?,?,?,?,?)').bind('NOT-old',h.w.id,'message','private',new Date().toISOString()).run();
  await h.db.prepare('UPDATE live_notification_emails SET first_attempt_at=?,attempts=1 WHERE notification_id=?').bind(Date.now()-24*60*60*1000,'NOT-old').run();
  await deliverWorkEmails(h.db,h.env);assert.equal(calls,1);assert.equal((await queued(h)).find(x=>x.notification_id==='NOT-old').status,'review');
 }finally{global.fetch=old;}
});

test('worker mode cannot start a premium top-up or purchase even when payments are ready',async()=>{
 const h=harness(),u=await h.register('worker'),old=global.fetch;let calls=0;
 Object.assign(h.env,{PAYSTACK_ENABLED:'true',PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_fixture'});
 await h.call('wallet/role',{role:'worker'},u);global.fetch=async()=>{calls++;throw Error('Must not contact provider');};
 try{
  for(const path of ['payments/topup','payments/premium/checkout','payments/premium/credits']){
   const r=await h.call(path,{requestId:crypto.randomUUID(),amount:100000,consent:true},u);assert.equal(r.status,403);assert.match(r.data.error,/Switch to Hiring/);
  }
  assert.equal(calls,0);
 }finally{global.fetch=old;}
});

test('the additive email migration preserves existing invitations without emailing history',()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f<'0012_').sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO users(id,email,name,phone,role,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?,?,?)').run('historical','history@example.test','Historical worker','08012345678','worker','fixture','fixture',new Date().toISOString());
 sqlite.prepare('INSERT INTO live_notifications(id,user_id,kind,title,created_at) VALUES(?,?,?,?,?)').run('NOT-old-history','historical','invitation','An existing invitation',new Date().toISOString());
 sqlite.exec(readFileSync(new URL('../drizzle/0012_work_email_alerts.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../drizzle/0013_worker_radar.sql',import.meta.url),'utf8'));
 assert.equal(sqlite.prepare('SELECT title FROM live_notifications WHERE id=?').get('NOT-old-history').title,'An existing invitation');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM live_notification_emails').get().n,0);sqlite.close();
});
