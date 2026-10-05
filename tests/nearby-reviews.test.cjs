const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../domain');
const now=Date.now();
const point=(lat,lon,accuracy=5,at=now)=>({lat,lon,accuracy,at});

test('nearby distance uses real coordinates, GPS uncertainty and recent snapshots',()=>{
 const a=point(6.5,3.3),b=point(6.501,3.3);
 const info=D.distanceInfo(a,b,now);
 assert.ok(info.metres>110&&info.metres<113);
 assert.equal(info.uncertainty,10);
 assert.equal(D.withinRadius(info,100),false);
 assert.equal(D.withinRadius(info,120),true);
 const uncertain=D.distanceInfo(a,{...b,accuracy:30},now);
 assert.equal(D.withinRadius(uncertain,100),true);
 assert.ok(uncertain.max>100);
 assert.equal(D.distanceInfo({...a,at:now-1800001},b,now),null);
 assert.equal(D.distanceInfo(a,{...b,at:now-86400001},now),null);
 assert.equal(D.distanceInfo(a,{...b,at:now+60001},now),null);
 assert.equal(D.distanceMeters(a,{...b,lat:NaN}),null);
 assert.equal(D.distanceMeters(a,{...b,lon:181}),null);
 assert.equal(D.distanceMeters(a,{...b,lat:null}),null);
 assert.equal(D.withinRadius(info,-5),false);
});

test('public profiles never expose GPS coordinates or private contact fields',()=>{
 const publicView=D.publicProfile({name:'Ada',area:'Yaba',coordinates:point(6.5,3.3),email:'private@example.test',phone:'000',contactEmailShared:false});
 assert.equal(publicView.coordinates,undefined);
 assert.equal(publicView.email,undefined);
 assert.equal(publicView.phone,undefined);
 assert.equal(publicView.area,'Yaba');
});

test('rating summaries reflect completed jobs and valid participants, with no seeded scores',()=>{
 const state=D.seed(),worker=state.workers[0],employer=state.employers[0];
 assert.deepEqual(D.ratingSummary(state,worker.id),{count:0,average:null});
 const first={id:'done-1',workerId:worker.id,employerId:employer.id,status:'Completed'};
 const second={...first,id:'done-2'};
 const pending={...first,id:'pending',status:'Pending'};
 state.engagements.push(first,second,pending);
 D.review(state,first,employer.id,5,'Good completed work');
 D.review(state,second,employer.id,3,'Could improve communication');
 assert.deepEqual(D.ratingSummary(state,worker.id),{count:2,average:4});
 assert.throws(()=>D.review(state,first,employer.id,1,'Duplicate'));
 assert.throws(()=>D.review(state,pending,employer.id,5,'Not completed'));
 state.reviews.push({engagementId:first.id,author:'outsider',target:worker.id,rating:5});
 state.reviews.push({engagementId:'missing',author:employer.id,target:worker.id,rating:5});
 state.reviews.push({engagementId:pending.id,author:employer.id,target:worker.id,rating:5});
 assert.deepEqual(D.ratingSummary(state,worker.id),{count:2,average:4});
 first.status='Cancelled';
 assert.deepEqual(D.ratingSummary(state,worker.id),{count:1,average:3});
});
