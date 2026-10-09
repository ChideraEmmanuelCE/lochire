import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleRequest} from '../lib/service.mjs';

function harness(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  const db={prepare(sql){return {bind(...values){return {sql,values,first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:sqlite.prepare(sql).run(...values)})};}};},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.values)}));sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const env={DB:db,SERVICE_SECRET:'private-test-service',APP_ORIGIN:'https://lochire.vercel.app',APP_MODE:'production',PAYMENT_MODE:'live',WEMA_MODE:'live',WEMA_ENVIRONMENT:'production',WEMA_ENABLED:'false',ADMIN_EMAILS:'owner@example.test'};let count=0;
  async function call(path,body,user,headers={}){const req=new Request('https://private.test/api/'+path,{method:body===undefined?'GET':'POST',headers:{'x-lochire-service-key':env.SERVICE_SECRET,origin:env.APP_ORIGIN,'x-lochire-client-ip':'fixture-'+(++count),...(user?.cookie?{cookie:user.cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const response=await handleRequest(req,env);return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  async function register(name){const r=await call('auth/register',{name,email:name+'@example.test',phone:'08012345678',role:'both',password:'SecureFixturePassword123!',termsConsent:true});assert.equal(r.status,201,JSON.stringify(r.data));return {id:r.data.user.id,cookie:r.cookie,name};}
  const future=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const worker={name:'Fixture artisan',city:'Ibadan',area:'Jericho',occupation:'Plumbing',speciality:'Leak repairs',skills:['Pipe fitting'],years:4,experience:'Repairs and installation',types:['One-off task','Ongoing job'],days:['Mon','Tue','Wed','Thu','Fri'],hoursStart:'08:00',hoursEnd:'17:00',start:future,coverage:['Jericho'],travel:true,flexible:false,pay:20000,basis:'Per task',accommodation:'Not applicable',published:true,acceptingBookings:true,coordinates:{lat:7.406231,lon:3.861951,accuracy:15}};
  const employer={name:'Fixture hirer',city:'Ibadan',area:'Jericho',type:'Household',intro:'Home repair work',business:''};
  const opening={requestId:crypto.randomUUID(),title:'Repair kitchen pipe',description:'Inspect and repair the leaking pipe.',category:'Plumbing',type:'One-off task',city:'Ibadan',area:'Jericho',quote:false,min:15000,max:25000,basis:'Per task',skills:['Pipe fitting'],years:1,days:[],start:future,date:future,duration:'Two hours',materials:'Discuss together',accommodation:'Not applicable',postcode:'OY-PRIVATE-01'};
  async function setup(){const e=await register('hirer'),w=await register('artisan'),outsider=await register('outsider');let r=await call('hiring/profiles/employer',employer,e);assert.equal(r.status,200,JSON.stringify(r.data));e.profile=r.data.employer.id;r=await call('hiring/profiles/worker',worker,w);assert.equal(r.status,200,JSON.stringify(r.data));w.profile=r.data.worker.id;r=await call('hiring/openings',opening,e);assert.equal(r.status,200,JSON.stringify(r.data));const oid=r.data.openings[0].id;return {e,w,outsider,oid};}
  async function current(user,gid){return (await call('hiring/state',undefined,user)).data.engagements.find(g=>g.id===gid);}
  async function action(user,gid,op,body={}){const g=await current(user,gid);return call('hiring/engagements/'+gid+'/'+op,{revision:g.revision,...body},user);}
  async function invite(e,w,oid){const r=await call('hiring/engagements',{role:'employer',workerId:w.profile,openingId:oid,message:'Please discuss the repair.'},e);assert.equal(r.status,200,JSON.stringify(r.data));return r.data.engagements[0].id;}
  async function confirmWork(e,w,gid){await action(w,gid,'accept');const t={scope:'Repair the pipe and check for leaks.',pay:20000,basis:'Per task',schedule:'Tomorrow 10am WAT',start:future,completionDate:future,city:'Ibadan',area:'Jericho',paymentMethod:'cash'};let r=await action(e,gid,'terms',{terms:t});assert.equal(r.status,200,JSON.stringify(r.data));await action(w,gid,'confirm',{version:1});r=await action(e,gid,'confirm',{version:1});assert.equal(r.status,200);assert.equal(r.data.engagements[0].status,'Confirmed');}
  return {db,env,call,register,setup,current,action,invite,confirmWork,worker,employer,opening};
}

test('production starts empty; real consent, CSRF and banking gates cannot be bypassed',async()=>{
  const h=harness();const state=await h.call('hiring/state');assert.equal(state.status,200);assert.equal(state.data.storage,'persistent');assert.deepEqual(state.data.workers,[]);assert.deepEqual(state.data.openings,[]);
  const config=(await h.call('config')).data;assert.equal(config.mode,'live');assert.equal(config.features.realHiring,true);assert.equal(config.features.reservedPayments,false);
  assert.equal((await h.call('auth/register',{name:'a',email:'a@example.test',phone:'08012345678',password:'SecureFixturePassword123!',role:'both',demoConsent:true})).status,400);
  const u=await h.register('real');assert.equal((await h.call('hiring/profiles/worker',h.worker)).status,401);
  assert.equal((await h.call('hiring/profiles/worker',h.worker,u,{origin:'https://other.test'})).status,403);
  for(const path of ['sandbox/fund','sandbox/withdraw','wema/demo/deposits/create','wema/demo/withdrawals/create','wema/onboarding/request'])assert.equal((await h.call(path,{amount:10000},u,{'idempotency-key':'a-valid-idempotency-key'})).status,503,path);
  h.env.WEMA_MODE='demo';h.env.PAYMENT_MODE='sandbox';assert.equal((await h.call('sandbox/fund',{amount:10000},u,{'idempotency-key':'another-idempotency-key'})).status,503);
  const wallet=(await h.call('wallet',undefined,u)).data;assert.equal(wallet.wallet.available,null);assert.equal(wallet.wallet.accountNumber,null);assert.deepEqual(wallet.transactions,[]);
});

test('profiles and openings are shared; private contacts and exact locations never appear publicly',async()=>{
  const h=harness(),{e,w,outsider,oid}=await h.setup();const publicState=(await h.call('hiring/state?lat=7.406&lon=3.862')).data;
  assert.equal(publicState.workers.length,1);assert.equal(publicState.openings.length,1);const raw=JSON.stringify(publicState);assert.equal(raw.includes('artisan@example.test'),false);assert.equal(raw.includes('08012345678'),false);assert.equal(raw.includes('7.406231'),false);assert.equal(raw.includes('OY-PRIVATE-01'),false);assert.ok(publicState.workers[0].distance);
  assert.ok((await h.call('hiring/state',undefined,w)).data.worker.coordinates);
  const replay=await h.call('hiring/openings',h.opening,e);assert.equal(replay.status,200);assert.equal(replay.data.openings.length,1);
  assert.equal((await h.call('hiring/openings/'+oid,{...h.opening,revision:1},outsider)).status,409);
  const profile=(await h.call('hiring/state',undefined,w)).data.worker;await h.call('hiring/profiles/worker',{...profile,published:false},w);assert.equal((await h.call('hiring/state')).data.workers.length,0);
  assert.equal((await h.call('hiring/profiles/worker',{...profile,published:true},w)).status,409);
});

test('real participants accept, negotiate, message, complete and review across sessions',async()=>{
  const h=harness(),{e,w,outsider,oid}=await h.setup(),gid=await h.invite(e,w,oid);
  const invited=await h.current(w,gid);assert.equal(invited.status,'Pending');assert.equal('postcode' in invited,false);
  assert.equal((await h.call('hiring/state',undefined,outsider)).data.engagements.length,0);
  assert.equal((await h.call('hiring/engagements/'+gid+'/accept',{revision:invited.revision,actor:w.profile},outsider)).status,404);
  assert.equal((await h.action(e,gid,'accept')).status,409);
  await h.invite(e,w,oid);assert.equal((await h.call('hiring/state',undefined,e)).data.engagements.length,1);
  await h.confirmWork(e,w,gid);assert.equal((await h.current(w,gid)).postcode,'OY-PRIVATE-01');
  const message=await h.action(w,gid,'message',{text:'I can arrive at 10am.'});assert.equal(message.status,200);assert.equal((await h.current(e,gid)).messages.at(-1).text,'I can arrive at 10am.');
  assert.equal((await h.action(e,gid,'review',{rating:5,text:'Too early'})).status,409);
  await h.action(w,gid,'complete');assert.equal((await h.current(e,gid)).status,'Confirmed');await h.action(e,gid,'complete');assert.equal((await h.current(w,gid)).status,'Completed');
  assert.equal((await h.action(e,gid,'review',{rating:5,text:'Repair completed successfully.'})).status,200);
  assert.equal((await h.action(e,gid,'review',{rating:1,text:'Duplicate review'})).status,409);
  const publicState=(await h.call('hiring/state')).data;assert.equal(publicState.reviews[0].rating,5);assert.equal(publicState.reviews[0].verified,true);assert.equal(publicState.engagements.length,0);
  assert.ok((await h.call('hiring/state',undefined,w)).data.notifications.some(n=>n.kind==='review'));
});

test('payment records require confirmation and recipient acknowledgement; retries do not inflate earnings',async()=>{
  const h=harness(),{e,w,outsider,oid}=await h.setup(),gid=await h.invite(e,w,oid),requestId=crypto.randomUUID();
  const payment={engagementId:gid,requestId,amount:2000000,method:'cash',note:'Paid after the repair'};
  assert.equal((await h.call('hiring/payments',payment,e)).status,409);await h.confirmWork(e,w,gid);
  assert.equal((await h.call('hiring/payments',payment,w)).status,403);assert.equal((await h.call('hiring/payments',payment,outsider)).status,404);
  let r=await h.call('hiring/payments',payment,e);assert.equal(r.status,200);assert.equal(r.data.payments.length,1);const id=r.data.payments[0].id;assert.equal(r.data.payments[0].status,'reported');
  r=await h.call('hiring/payments',payment,e);assert.equal(r.data.payments.length,1);
  assert.equal((await h.call('hiring/payments',{...payment,amount:3000000},e)).status,409);
  assert.equal((await h.call('hiring/payments/'+id,{engagementId:gid,status:'acknowledged'},e)).status,403);
  r=await h.call('hiring/payments/'+id,{engagementId:gid,status:'acknowledged'},w);assert.equal(r.status,200);assert.equal(r.data.payments[0].status,'acknowledged');
  assert.equal((await h.call('hiring/state',undefined,outsider)).data.payments.length,0);
});

test('stale and concurrent conversation updates reject conflicts without overwriting messages',async()=>{
  const h=harness(),{e,w,oid}=await h.setup(),gid=await h.invite(e,w,oid);await h.action(w,gid,'accept');const g=await h.current(e,gid);
  const responses=await Promise.all([h.call('hiring/engagements/'+gid+'/message',{revision:g.revision,text:'First message'},e),h.call('hiring/engagements/'+gid+'/message',{revision:g.revision,text:'Second message'},w)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await h.current(e,gid)).messages.length,2);
  assert.equal((await h.call('hiring/engagements/'+gid+'/message',{revision:g.revision,text:'Stale edit'},w)).status,409);
});

test('reports are private; verified administrators can resolve and suspend without a republish bypass',async()=>{
  const h=harness(),{e,w,outsider}=await h.setup(),owner=await h.register('owner');
  assert.equal((await h.call('admin/reports',undefined,owner)).status,403,'email alone does not prove admin identity');
  await h.db.prepare('INSERT INTO live_account_settings (user_id,email_verified_at) VALUES (?,?)').bind(owner.id,new Date().toISOString()).run();
  const report=await h.call('hiring/reports',{target:w.profile,kind:'profile',reason:'Misleading information',details:'Please review this work history.'},e);assert.equal(report.status,200);
  assert.equal((await h.call('hiring/state',undefined,outsider)).data.reports.length,0);assert.equal((await h.call('admin/reports',undefined,outsider)).status,403);
  const queue=await h.call('admin/reports',undefined,owner);assert.equal(queue.status,200);assert.equal(queue.data.reports.length,1);
  const r=await h.call('admin/reports',{id:report.data.reference,action:'hide_profile',resolution:'Profile suspended for review.'},owner);assert.equal(r.status,200);
  const own=(await h.call('hiring/state',undefined,w)).data.worker;assert.equal(own.suspended,true);assert.equal(own.published,false);
  assert.equal((await h.call('hiring/profiles/worker',{...own,published:true},w)).status,403);
  assert.equal((await h.call('hiring/state')).data.workers.length,0);assert.equal((await h.call('hiring/state',undefined,e)).data.reports[0].resolution,'Profile suspended for review.');
});

test('password changes revoke sessions; missing email delivery does not claim success',async()=>{
  const h=harness(),u=await h.register('password');assert.equal((await h.call('auth/forgot',{email:'password@example.test'})).data.deliveryConfigured,false);
  assert.equal((await h.call('auth/password',{currentPassword:'IncorrectPassword123!',password:'NewSecurePassword123!'},u)).status,401);
  assert.equal((await h.call('auth/password',{currentPassword:'SecureFixturePassword123!',password:'NewSecurePassword123!'},u)).status,200);
  assert.equal((await h.call('wallet',undefined,u)).status,401);assert.equal((await h.call('auth/login',{email:'password@example.test',password:'NewSecurePassword123!'})).status,200);
});
