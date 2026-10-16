import test from 'node:test';
import assert from 'node:assert/strict';
import {adultRegistrationError,reviewEligibility,lagosDay} from '../lib/eligibility.mjs';
import {harness} from './paystack-fixture.mjs';
const time=Date.parse('2026-10-16T12:00:00Z');

test('adult registration uses a real calendar birth date, exact birthday and Nigerian time',()=>{
 assert.equal(adultRegistrationError('2008-10-16',true,time),null);
 for(const birth of ['2008-10-17','2010-01-01'])assert.match(adultRegistrationError(birth,true,time),/18 or older/);
 for(const birth of [null,'','2000-02-31','2001-02-29','2027-01-01','1900-01-00','01-01-2000'])assert.match(adultRegistrationError(birth,true,time),/real date/);
 assert.match(adultRegistrationError('1995-01-01',false,time),/Confirm/);assert.match(adultRegistrationError('1995-01-01','true',time),/Confirm/);
 assert.equal(lagosDay(Date.parse('2026-10-15T23:00:00Z')),'2026-10-16');assert.equal(adultRegistrationError('2008-10-16',true,Date.parse('2026-10-15T23:00:00Z')),null);
 assert.match(adultRegistrationError('2008-02-29',true,Date.parse('2026-02-28T12:00:00Z')),/18/);assert.equal(adultRegistrationError('2008-02-29',true,Date.parse('2026-03-01T12:00:00Z')),null);
});

test('API rejects underage or missing declarations before creating any account; only the outcome is stored',async()=>{
 const h=harness(),base={name:'New adult',email:'adult@example.test',phone:'08012345678',role:'both',password:'SecureFixturePassword123!',termsConsent:true};
 const minorYear=Number(lagosDay().slice(0,4))-17;
 for(const patch of [{},{dateOfBirth:minorYear+'-01-01',adultConsent:true},{dateOfBirth:'2000-02-31',adultConsent:true},{dateOfBirth:'1995-01-01',adultConsent:false}]){
  const r=await h.call('auth/register',{...base,...patch});assert.equal(r.status,400);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM users').bind().first()).n,0);
 }
 const r=await h.call('auth/register',{...base,dateOfBirth:'1995-01-01',adultConsent:true});assert.equal(r.status,201,JSON.stringify(r.data));
 const audit=await h.db.prepare('SELECT * FROM account_age_checks WHERE user_id=?').bind(r.data.user.id).first();assert.equal(audit.minimum_age,18);assert.equal(audit.method,'declared_date_of_birth');assert.ok(audit.confirmed_at);assert.doesNotMatch(JSON.stringify(audit),/1995-01-01/);assert.doesNotMatch(JSON.stringify(r.data),/dateOfBirth|birth_date|1995-01-01/);
 assert.equal((await h.call('auth/login',{email:base.email,password:base.password})).status,200);
});

test('month-long work cannot be reviewed until after its end day, even when both people mark it complete early',()=>{
 const g={workerId:'w',employerId:'e',version:2,status:'Completed',terms:{start:'2026-10-16',completionDate:'2026-11-16'},confirmations:{w:2,e:2}};
 for(const date of ['2026-10-16T12:00:00+01:00','2026-11-16T23:59:59+01:00'])assert.equal(reviewEligibility(g,Date.parse(date)).allowed,false);
 const yes=reviewEligibility(g,Date.parse('2026-11-17T00:00:00+01:00'));assert.equal(yes.allowed,true);assert.equal(yes.opensAt,'2026-11-16T23:00:00.000Z');
 assert.equal(reviewEligibility({...g,status:'Confirmed'},Date.parse('2026-11-17T12:00:00Z')).allowed,false);
 assert.equal(reviewEligibility({...g,terms:{start:'2026-10-16'}},time).allowed,false);
 assert.equal(reviewEligibility({...g,confirmations:{w:1,e:2}},Date.parse('2026-11-17T12:00:00Z')).allowed,false);
});

test('server rejects early and forged reviews; a finished dated job publishes a review for every hirer',async()=>{
 const h=harness(),{e,w,outsider,oid}=await h.setup(),gid=await h.invite(e,w,oid);await h.action(w,gid,'accept');
 const end=lagosDay(),start=new Date(Date.parse(end+'T12:00:00Z')-31*86400000).toISOString().slice(0,10);
 const terms={scope:'One month of agreed work.',pay:50000,basis:'Monthly',schedule:'Weekdays',start,completionDate:end,city:'Ibadan',area:'Jericho',paymentMethod:'bank_transfer'};
 assert.equal((await h.action(e,gid,'terms',{terms:{...terms,completionDate:''}})).status,400);assert.equal((await h.action(e,gid,'terms',{terms})).status,200);
 await h.action(w,gid,'confirm',{version:1});await h.action(e,gid,'confirm',{version:1});await h.action(w,gid,'complete');await h.action(e,gid,'complete');
 const early=await h.action(e,gid,'review',{rating:5,text:'Too early',completionDate:'2020-01-01'});assert.equal(early.status,409);assert.match(early.data.error,/after the job end date/);assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM live_reviews').bind().first()).n,0);
 const original=Date.now;try{
  Date.now=()=>Date.parse(end+'T23:59:59+01:00');assert.equal((await h.action(e,gid,'review',{rating:5,text:'Still early'})).status,409);
  Date.now=()=>Date.parse(end+'T00:00:00+01:00')+86400000;
  // Test sessions remain valid while the fixture clock crosses midnight.
  await h.db.prepare('UPDATE sessions SET expires_at=?').bind(Date.now()+86400000).run();
  const posted=await h.action(e,gid,'review',{rating:5,text:'Finished the month and did good work.'});assert.equal(posted.status,200,JSON.stringify(posted.data));
  assert.equal((await h.action(e,gid,'review',{rating:1,text:'Duplicate'})).status,409);
  for(const user of [null,outsider,w]){const state=(await h.call('hiring/state',undefined,user)).data;assert.equal(state.reviews.length,1);assert.equal(state.reviews[0].target,w.profile);assert.equal(state.reviews[0].rating,5);assert.equal(state.reviews[0].verified,true);}
 }finally{Date.now=original;}
});
