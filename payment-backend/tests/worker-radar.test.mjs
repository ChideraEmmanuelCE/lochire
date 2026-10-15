import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './paystack-fixture.mjs';
import {deliverWorkEmails} from '../lib/work-email.mjs';
import {matchWorker} from '../lib/worker-radar.mjs';

const interview=()=>({date:new Date(Date.now()+2*86400000).toISOString().slice(0,10),time:'10:00',location:'12 Interview Street, Jericho, Ibadan',contactName:'Hiring manager',phone:'08012345678',contactEmail:'hirer@example.test',notes:'Bring examples of your work.'});
async function fixture(){const h=harness(),people=await h.setup();const s=(await h.call('hiring/state',undefined,people.e)).data;assert.equal(s.workerMatches.length,1);return {...h,...people,match:s.workerMatches[0]};}
const decision=(h,action='accept',extra={})=>h.call('hiring/matches/'+h.match.id+'/'+action,{interview:interview(),shareDetails:true,...extra},h.e);

test('local suggestions require occupation, skills, availability and service area; they are private to the hirer',async()=>{
 const h=await fixture(),s=(await h.call('hiring/state',undefined,h.e)).data;
 assert.deepEqual(s.workerMatches[0].skills,['Pipe fitting']);assert.equal(s.workerMatches[0].workerId,h.w.profile);
 for(const user of [h.w,h.outsider,undefined])assert.deepEqual((await h.call('hiring/state',undefined,user)).data.workerMatches,[]);
 const p={...h.worker,published:true},o={...h.opening,status:'Open'};
 for(const patch of [{city:'Lagos'},{area:'Wrong area',coverage:[]},{occupation:'Cooking'},{acceptingBookings:false},{promoteProfile:false},{published:false},{years:0},{skills:['Unrelated skill']},{types:['Ongoing job']}])assert.equal(matchWorker({...p,...patch},o),null,JSON.stringify(patch));
 const notices=(await h.db.prepare("SELECT * FROM live_notifications WHERE kind='worker_match'").bind().all()).results;assert.equal(notices.length,1);
 await h.call('hiring/state',undefined,h.e);await h.call('hiring/state',undefined,h.e);
 assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM live_worker_matches').bind().first()).n,1);
 assert.equal((await h.db.prepare("SELECT COUNT(*) AS n FROM live_notifications WHERE kind='worker_match'").bind().first()).n,1);
});

test('active-now is based on an authenticated heartbeat, expires, and is absent from public and worker views',async()=>{
 const h=await fixture();assert.equal((await h.call('hiring/presence',{})).status,401);
 assert.equal((await h.call('hiring/presence',{},h.w)).status,200);
 let s=(await h.call('hiring/state',undefined,h.e)).data;assert.equal(s.workers[0].activity.activeNow,true);
 for(const user of [h.w,undefined])assert.equal((await h.call('hiring/state',undefined,user)).data.workers[0].activity,undefined);
 await h.db.prepare('UPDATE live_presence SET last_seen_at=? WHERE user_id=?').bind(Date.now()-100000,h.w.id).run();
 s=(await h.call('hiring/state',undefined,h.e)).data;assert.equal(s.workers[0].activity.activeNow,false);assert.ok(s.workers[0].activity.lastActiveAt);
});

test('accepting creates one saved interview invitation, sends it only to the worker, and retries without duplicates',async()=>{
 const h=await fixture(),old=global.fetch,mails=[];
 for(const u of [h.e,h.w])await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at) VALUES(?,?)').bind(u.id,new Date().toISOString()).run();
 Object.assign(h.env,{RESEND_API_KEY:'re_fixture',EMAIL_FROM:'LocHire <team@verified.example>'});
 global.fetch=async(url,o)=>{mails.push(JSON.parse(o.body));return Response.json({id:'mail-'+mails.length});};
 try{
  assert.equal((await h.call('hiring/matches/'+h.match.id+'/accept',{interview:interview(),shareDetails:true},h.outsider)).status,403);
  assert.equal((await decision(h,'accept',{shareDetails:false})).status,400);
  assert.equal((await decision(h,'accept',{interview:{...interview(),date:'2020-01-01'}})).status,400);
  const result=await decision(h);assert.equal(result.status,200,JSON.stringify(result.data));
  const g=result.data.engagements[0];assert.equal(g.status,'Pending');assert.equal(g.kind,'Interview invitation');assert.equal(g.interview.location,interview().location);assert.deepEqual(result.data.workerMatches,[]);
  assert.equal((await decision(h)).status,200);
  const emails=mails.filter(m=>m.subject.includes('interview'));assert.equal(emails.length,1);assert.deepEqual(emails[0].to,['artisan@example.test']);assert.match(emails[0].text,/12 Interview Street/);assert.match(emails[0].text,/Hiring manager/);
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM live_engagements').bind().first()).n,1);
  const worker=(await h.call('hiring/state',undefined,h.w)).data;assert.equal(worker.notifications.some(n=>n.kind==='interview'),true);assert.equal(worker.engagements[0].interview.phone,'08012345678');
  assert.deepEqual((await h.call('hiring/state',undefined,h.outsider)).data.engagements,[]);
  const accepted=await h.action(h.w,g.id,'accept');assert.equal(accepted.status,200);assert.equal(accepted.data.engagements[0].interview.response,'confirmed');assert.equal(accepted.data.engagements[0].terms,null);
 }finally{global.fetch=old;}
});

test('declines persist for that opening and paused or blocked workers cannot be accepted',async()=>{
 const h=await fixture();assert.equal((await decision(h,'decline')).status,200);assert.equal((await decision(h,'decline')).status,200);assert.equal((await decision(h)).status,409);
 assert.equal((await h.call('hiring/state',undefined,h.e)).data.workerMatches.length,0);assert.equal((await h.call('hiring/state',undefined,h.w)).data.engagements.length,0);
 const paused=await fixture();const p=(await paused.call('hiring/state',undefined,paused.w)).data.worker;await paused.call('hiring/profiles/worker',{...p,acceptingBookings:false},paused.w);assert.equal((await decision(paused)).status,409);
 const blocked=await fixture();await blocked.call('hiring/blocks',{role:'employer',target:blocked.w.profile},blocked.e);assert.equal((await decision(blocked)).status,409);assert.equal((await blocked.call('hiring/state',undefined,blocked.e)).data.workerMatches.length,0);
});

test('profile and opening saves push candidate summaries to verified local hirers with immutable retry bodies',async()=>{
 const h=await fixture(),old=global.fetch,mails=[];
 await h.db.prepare('INSERT INTO live_account_settings(user_id,email_verified_at) VALUES(?,?)').bind(h.e.id,new Date().toISOString()).run();
 Object.assign(h.env,{RESEND_API_KEY:'re_fixture',EMAIL_FROM:'LocHire <team@verified.example>'});
 global.fetch=async(url,o)=>{mails.push({body:JSON.parse(o.body),key:o.headers['Idempotency-Key']});return mails.length===1?Response.json({error:'retry'},{status:503}):Response.json({id:'provider-id'});};
 try{
  await deliverWorkEmails(h.db,h.env);assert.equal(mails.length,1);assert.deepEqual(mails[0].body.to,['hirer@example.test']);assert.match(mails[0].body.text,/Fixture artisan|Leak repair/);assert.match(mails[0].body.text,/Pipe fitting/);assert.doesNotMatch(mails[0].body.text,/08012345678|OY-PRIVATE|coordinates|artisan@example/);
  await h.db.prepare('UPDATE live_notification_emails SET next_at=0').bind().run();await deliverWorkEmails(h.db,h.env);
  assert.equal(mails.length,2);assert.deepEqual(mails[0],mails[1]);
  await h.call('hiring/state',undefined,h.e);assert.equal(mails.length,2);
 }finally{global.fetch=old;}
});

test('simultaneous accept and decline produce one decision and never leak duplicate invitations',async()=>{
 const h=await fixture(),results=await Promise.all([decision(h),decision(h,'decline')]);
 assert.ok(results.some(r=>r.status===200));
 const row=await h.db.prepare('SELECT status FROM live_worker_matches WHERE id=?').bind(h.match.id).first();
 const count=(await h.db.prepare('SELECT COUNT(*) AS n FROM live_engagements').bind().first()).n;
 assert.equal(count,row.status==='invited'?1:0);
});
