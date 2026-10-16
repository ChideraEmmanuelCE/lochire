import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyJobEmail} from '../lib/job-alert-email.mjs';
const env={APP_ORIGIN:'https://lochire.ng'};
const opening={title:'Repair kitchen pipe',area:'Jericho',city:'Ibadan',category:'Plumbing',type:'One-off task',min:15000,max:25000,basis:'Per task',date:'2026-10-20',duration:'Two hours',description:'Inspect and repair a leaking pipe.'};

test('job email formats quotes, fixed pay, dates and long descriptions without implying guaranteed priority',()=>{
 const link='https://lochire.ng/#opening/OPN-123',mail=nearbyJobEmail({...opening,quote:true,description:'Long description '.repeat(40)},link,env);
 assert.match(mail.text,/Pay \/ budget: Discuss pay with the hirer/);assert.match(mail.text,/20 October 2026/);assert.match(mail.text,/…/);assert.doesNotMatch(mail.text,/Long description (Long description ){20}/);assert.match(mail.text,/do not guarantee a job or priority/);
 const fixed=nearbyJobEmail({...opening,min:20000,max:20000,type:'Ongoing job',basis:'Monthly',start:'2026-11-01'},link,env);assert.match(fixed.text,/₦20,000 per month/);assert.match(fixed.text,/Starts: 1 November 2026/);assert.doesNotMatch(fixed.text,/Job date:/);
});

test('job email escapes user content and keeps subject on one line',()=>{
 const mail=nearbyJobEmail({...opening,title:'Repair\r\n<script>alert("x")</script>',description:'<img src=x onerror=alert(1)> & "quote"',area:'<svg onload=alert(1)>'},'https://lochire.ng/#opening/OPN-1',env);
 assert.doesNotMatch(mail.subject,/[\r\n]/);assert.doesNotMatch(mail.html,/<script>|<svg|<img/);assert.match(mail.html,/&lt;script&gt;/);assert.match(mail.html,/&lt;img/);assert.match(mail.html,/&amp; &quot;quote&quot;/);assert.match(mail.text,/#opening\/OPN-1/);assert.match(mail.html,/https:\/\/lochire.ng\/\?manage_job_alerts=1#premium/);
});
