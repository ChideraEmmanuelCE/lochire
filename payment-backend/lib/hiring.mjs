import { onlineState } from './paystack.mjs';
// Shared, authenticated hiring. The browser can request an action; only this
// service decides ownership, participants, publication and transitions.
export class HiringError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new HiringError(status,message);};
const first=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const all=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
const run=(db,sql,...v)=>db.prepare(sql).bind(...v).run();
const now=()=>new Date().toISOString();
const id=prefix=>prefix+'-'+crypto.randomUUID();
const text=(v,label,max=1500,min=1)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail(400,'Enter a valid '+label+'.');return v.trim();};
const optional=(v,label,max=1500)=>v==null||v===''?'':text(v,label,max);
const number=(v,label,max=100000000)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)fail(400,'Enter a valid '+label+'.');return n;};
const choose=(v,options,label)=>{if(!options.includes(v))fail(400,'Choose a valid '+label+'.');return v;};
const array=(v,label,max=25)=>{if(!Array.isArray(v)||v.length>max)fail(400,'Enter a valid '+label+'.');return [...new Set(v.map(x=>text(x,label,100)))];};
const date=(v,label)=>{v=text(v,label,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z')))fail(400,'Enter a valid '+label+'.');return v;};
const time=v=>{if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail(400,'Enter valid working hours.');return v;};
const today=()=>new Date(Date.now()+3600000).toISOString().slice(0,10);
const categories=['Domestic help','Cooking','Driving','Cleaning','Plumbing','Electrical work','Painting','Carpentry','Appliance repairs','Gate attendant','Shop assistant'];
const bases=['Hourly','Daily','Monthly','Per task'];
const types=['Ongoing job','One-off task'];
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export const live=env=>env.APP_MODE==='production';
export const emailReady=env=>!!env.RESEND_API_KEY&&!!env.EMAIL_FROM;
async function admin(db,user,env){if(!user)return false;if(String(env.ADMIN_USER_IDS||'').split(',').includes(user.id))return true;if(!String(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes(user.email))return false;return !!(await first(db,'SELECT email_verified_at FROM live_account_settings WHERE user_id=?',user.id))?.email_verified_at;}
const profileId=(user,role)=>role+'-'+user.id;
const decoded=row=>row?{...JSON.parse(row.data),id:row.id,revision:row.revision,...(row.role?{published:row.published===1,suspended:row.suspended===1}:{})}:null;
async function ownProfile(db,user,role){if(!user)fail(401,'Sign in to LocHire first.');const row=await first(db,'SELECT * FROM live_profiles WHERE user_id=? AND role=?',user.id,role);if(row?.suspended)fail(403,'Your profile is suspended pending review.');if(!row)fail(409,'Create your '+role+' profile first.');return row;}
const publicProfile=p=>{const {email,phone,coordinates,contactEmailShared,postcode,...safe}=p;return safe;};
async function isBlocked(db,a,b){return !!await first(db,'SELECT actor FROM live_blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)',a,b,b,a);}
const notices=(db,userId,kind,title,gid,at=now(),key=id('NOT'))=>db.prepare('INSERT OR IGNORE INTO live_notifications (id,user_id,kind,title,engagement_id,created_at) VALUES (?,?,?,?,?,?)').bind(key,userId,kind,title,gid,at);
async function notify(db,profile,kind,title,gid){const row=await first(db,'SELECT user_id FROM live_profiles WHERE id=?',profile);if(row)await notices(db,row.user_id,kind,title,gid).run();}

function profileData(body,user,role){
  const p={id:profileId(user,role),name:text(body.name,'name',70),city:text(body.city,'city',70),area:text(body.area,'general area',90),email:user.email,phone:user.phone,demo:false};
  if(role==='worker'){
    Object.assign(p,{occupation:choose(body.occupation,categories,'occupation'),speciality:text(body.speciality,'speciality',100),skills:array(body.skills,'skills'),years:number(body.years,'experience',60),experience:optional(body.experience,'experience'),types:array(body.types,'work types'),days:array(body.days,'days'),hoursStart:time(body.hoursStart),hoursEnd:time(body.hoursEnd),start:date(body.start,'start date'),coverage:array(body.coverage||[],'areas covered'),travel:body.travel===true,flexible:body.flexible===true,pay:number(body.pay||0,'expected pay'),basis:choose(body.basis,bases,'payment basis'),accommodation:choose(body.accommodation||'Not applicable',['Live-in','Live-out','Either','Not applicable'],'accommodation'),workExample:optional(body.workExample,'work example'),licence:optional(body.licence,'licence',200),published:body.published!==false,acceptingBookings:body.acceptingBookings!==false});
    if(!p.types.length||p.types.some(t=>!types.includes(t))||!p.days.length||p.days.some(d=>!days.includes(d))||p.hoursEnd<=p.hoursStart||(!p.flexible&&p.pay<=0))fail(400,'Complete work types, working days, valid hours and expected pay.');
    if(body.coordinates){const c=body.coordinates;if(typeof c.lat!=='number'||typeof c.lon!=='number'||!Number.isFinite(c.lat)||!Number.isFinite(c.lon)||Math.abs(c.lat)>90||Math.abs(c.lon)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>100000)fail(400,'Invalid shared location.');p.coordinates={lat:c.lat,lon:c.lon,accuracy:c.accuracy,at:Date.now()};}
  }else Object.assign(p,{type:choose(body.type,['Individual','Household','Business'],'employer type'),intro:text(body.intro,'introduction'),business:optional(body.business,'business details'),published:true});
  if(role==='employer'&&p.type==='Business'&&!p.business)fail(400,'Add your business details.');
  return p;
}
function openingData(body,employer){
  const o={title:text(body.title,'title',100),description:text(body.description,'work description'),category:choose(body.category,categories,'category'),type:choose(body.type,types,'work type'),city:text(body.city,'city',70),area:text(body.area,'area',90),quote:body.quote===true,min:number(body.min||0,'minimum budget'),max:number(body.max||0,'maximum budget'),basis:choose(body.basis,bases,'payment basis'),skills:array(body.skills||[],'skills'),years:number(body.years||0,'experience',60),days:array(body.days||[],'working days'),hoursStart:optional(body.hoursStart,'start time',5),hoursEnd:optional(body.hoursEnd,'end time',5),start:date(body.start||body.date,'start date'),date:body.date?date(body.date,'preferred date'):'',duration:optional(body.duration,'duration',100),materials:optional(body.materials,'materials',300),accommodation:choose(body.accommodation||'Not applicable',['Live-in','Live-out','Either','Not applicable'],'accommodation'),employerId:employer.id,status:'Open',photos:[],demo:false};
  if(o.start<today()||(!o.quote&&(o.max<=0||o.min>o.max)))fail(400,'Use a future start date and a valid budget.');
  if(o.type==='One-off task'&&(!o.date||o.date<today()||!o.duration))fail(400,'Add a preferred date and duration.');
  if(o.type==='Ongoing job'&&(!o.days.length||o.days.some(d=>!days.includes(d))||!o.skills.length||time(o.hoursEnd)<=time(o.hoursStart)))fail(400,'Add required skills, working days and valid hours.');
  if(body.postcode){const code=text(body.postcode,'postcode',30).toUpperCase();if(!/^[A-Z0-9 -]+$/.test(code))fail(400,'Invalid postcode.');o.postcode=code;}
  return o;
}
const publicOpening=o=>{const {postcode,...safe}=o;return safe;};
function distance(a,b){const rad=v=>v*Math.PI/180,h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}

export async function hiringState(db,user,env,request){
  const u=new URL(request.url),lat=Number(u.searchParams.get('lat')),lon=Number(u.searchParams.get('lon'));
  const searchPoint=u.searchParams.has('lat')&&u.searchParams.has('lon')&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
  const rows=await all(db,'SELECT * FROM live_profiles WHERE published=1 AND suspended=0 ORDER BY updated_at DESC LIMIT 1000');
  const ownRows=user?await all(db,'SELECT * FROM live_profiles WHERE user_id=?',user.id):[];
  const blocks=user?await all(db,'SELECT actor,target FROM live_blocks WHERE actor IN (SELECT id FROM live_profiles WHERE user_id=?) OR target IN (SELECT id FROM live_profiles WHERE user_id=?)',user.id,user.id):[];
  const blockedProfiles=new Set(blocks.flatMap(b=>[b.actor,b.target]).filter(pid=>!ownRows.some(p=>p.id===pid)));
  const published=rows.filter(r=>!blockedProfiles.has(r.id)).map(r=>{
    const p=decoded(r),safe=publicProfile(p);
    if(searchPoint&&p.coordinates&&Date.now()-p.coordinates.at<86400000)safe.distance={metres:Math.round(distance(searchPoint,p.coordinates)/100)*100,accuracy:Math.ceil(p.coordinates.accuracy/100)*100};
    return safe;
  });
  const openings=(await all(db,"SELECT o.* FROM live_openings o JOIN live_profiles p ON p.id=o.employer_id WHERE o.status='Open' AND p.published=1 AND p.suspended=0 ORDER BY o.created_at DESC LIMIT 1000")).filter(r=>!blockedProfiles.has(r.employer_id)).map(r=>publicOpening({...decoded(r),status:r.status}));
  if(user){for(const row of await all(db,'SELECT o.* FROM live_openings o JOIN live_profiles p ON p.id=o.employer_id WHERE p.user_id=?',user.id)){const o={...decoded(row),status:row.status},i=openings.findIndex(x=>x.id===o.id);if(i>=0)openings[i]=o;else openings.push(o);}}
  let engagements=user?(await all(db,'SELECT g.* FROM live_engagements g WHERE worker_id IN (SELECT id FROM live_profiles WHERE user_id=?) OR employer_id IN (SELECT id FROM live_profiles WHERE user_id=?) ORDER BY created_at DESC LIMIT 250',user.id,user.id)).map(decoded):[];
  engagements=engagements.map(g=>{if(['Pending','Declined'].includes(g.status)&&!ownRows.some(p=>p.id===g.employerId)){const {postcode,...safe}=g;return safe;}return g;});
  // Profiles belonging to an active conversation remain visible to its participants.
  const participantIds=[...new Set(engagements.flatMap(g=>[g.workerId,g.employerId]))];
  for(const pid of participantIds)if(!published.some(p=>p.id===pid)){const r=await first(db,'SELECT * FROM live_profiles WHERE id=?',pid);if(r)published.push(publicProfile(decoded(r)));}
  const reviews=await all(db,'SELECT id,engagement_id AS engagementId,author,target,rating,text,created_at AS at FROM live_reviews ORDER BY created_at DESC LIMIT 1000');
  const settings=user?await first(db,'SELECT email_verified_at FROM live_account_settings WHERE user_id=?',user.id):null;
  const payments=user?await all(db,'SELECT p.* FROM live_payments p JOIN live_profiles a ON a.id=p.payer JOIN live_profiles b ON b.id=p.recipient WHERE a.user_id=? OR b.user_id=? ORDER BY created_at DESC LIMIT 250',user.id,user.id):[];
  return {...await onlineState(db,user,env),version:4,user:user?{id:user.id,name:user.name,email:user.email,phone:user.phone,role:user.role,emailVerified:!!settings?.email_verified_at}:null,admin:await admin(db,user,env),worker:decoded(ownRows.find(r=>r.role==='worker')),employer:decoded(ownRows.find(r=>r.role==='employer')),workers:published.filter(p=>p.occupation),employers:published.filter(p=>!p.occupation),openings,engagements,reviews:reviews.map(r=>({...r,verified:true})),blocks,notifications:user?await all(db,'SELECT * FROM live_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id):[],payments,counts:{workers:published.filter(p=>p.occupation).length,openings:openings.filter(o=>o.status==='Open').length},reports:user?await all(db,'SELECT id,reason,status,resolution,created_at FROM live_reports WHERE user_id=? ORDER BY created_at DESC LIMIT 50',user.id):[],storage:'persistent',emailReady:emailReady(env)};
}
async function engagementFor(db,user,gid){const row=await first(db,'SELECT g.* FROM live_engagements g WHERE id=? AND (worker_id IN (SELECT id FROM live_profiles WHERE user_id=?) OR employer_id IN (SELECT id FROM live_profiles WHERE user_id=?))',gid,user.id,user.id);if(!row)fail(404,'This engagement is not available to your account.');return row;}
async function mutate(db,row,g,target,kind,title,extra=[]){
  const raw=JSON.stringify(g),revision=row.revision+1,at=now();
  const recipient=await first(db,'SELECT user_id FROM live_profiles WHERE id=?',target);
  const batch=[db.prepare('UPDATE live_engagements SET data=?,status=?,revision=revision+1 WHERE id=? AND revision=?').bind(raw,g.status,row.id,row.revision),...extra];
  if(recipient)batch.push(db.prepare('INSERT OR IGNORE INTO live_notifications (id,user_id,kind,title,engagement_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM live_engagements WHERE id=? AND revision=? AND data=?)').bind('NOT-'+row.id+'-'+revision,recipient.user_id,kind,title,row.id,at,row.id,revision,raw));
  const result=await db.batch(batch);if(result[0].meta?.changes===0)fail(409,'The conversation changed. Refresh and try again.');
}

export async function hiringAction({db,user,env,request,body,path}){
  if(!user)fail(401,'Sign in to LocHire first.');
  const parts=path.split('/'),kind=parts[1];
  if(kind==='profiles'){
    const role=choose(parts[2],['worker','employer'],'profile type'),p=profileData(body,user,role),existing=await first(db,'SELECT revision,suspended FROM live_profiles WHERE id=?',p.id);
    if(existing){if(existing.suspended)fail(403,'Your profile is suspended pending review.');if(body.revision!==existing.revision)fail(409,'Your profile changed. Refresh before saving.');const r=await run(db,'UPDATE live_profiles SET data=?,published=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?',JSON.stringify(p),p.published===false?0:1,now(),p.id,existing.revision);if(r.meta?.changes===0)fail(409,'Your profile changed. Refresh before saving.');}
    else await run(db,'INSERT INTO live_profiles (id,user_id,role,published,data,revision,updated_at) VALUES (?,?,?,?,?,1,?)',p.id,user.id,role,p.published===false?0:1,JSON.stringify(p),now());
  }else if(kind==='openings'){
    const employer=await ownProfile(db,user,'employer');
    if(parts[2]){
      const row=await first(db,'SELECT * FROM live_openings WHERE id=? AND employer_id=?',parts[2],employer.id);if(!row)fail(404,'Opening not found.');
      if(body.revision!==row.revision)fail(409,'This opening changed. Refresh before saving.');
      const o=body.action==='status'?{...decoded(row),status:choose(body.status,['Open','Closed'],'status')}:{...openingData(body,employer),id:row.id,status:row.status};
      const r=await run(db,'UPDATE live_openings SET data=?,status=?,revision=revision+1 WHERE id=? AND revision=?',JSON.stringify(o),o.status,row.id,row.revision);if(r.meta?.changes===0)fail(409,'This opening changed. Refresh and try again.');
    }else {const o=openingData(body,employer),oid=body.requestId?'OPN-'+text(body.requestId,'request reference',100):id('OPN');o.id=oid;const prior=await first(db,'SELECT * FROM live_openings WHERE id=?',oid);if(prior){if(prior.employer_id!==employer.id||prior.data!==JSON.stringify(o))fail(409,'Request reference already used.');return hiringState(db,user,env,request);}await run(db,'INSERT INTO live_openings (id,employer_id,status,data,revision,created_at) VALUES (?,?,\'Open\',?,1,?)',oid,employer.id,JSON.stringify(o),now());}
  }else if(kind==='engagements'&&!parts[2]){
    const role=choose(body.role,['worker','employer'],'role'),mine=await ownProfile(db,user,role);
    let openingRow;
    if(body.booking){
      if(role!=='employer')fail(403,'Switch to Hiring to request a booking.');
      const target=await first(db,"SELECT * FROM live_profiles WHERE id=? AND role='worker' AND published=1 AND suspended=0",body.workerId);if(!target||target.user_id===user.id)fail(404,'Choose another available worker.');
      const wp=decoded(target);if(wp.acceptingBookings===false||await isBlocked(db,mine.id,target.id))fail(403,'This worker is unavailable for contact.');
      if(!wp.types.includes('One-off task'))fail(400,'Invite this worker to an ongoing opening.');
      const oid=body.requestId?'OPN-'+text(body.requestId,'request reference',100):id('OPN'),o=openingData({...body.booking,type:'One-off task',category:wp.occupation,title:'Booking: '+wp.occupation,quote:true,min:0,max:0,basis:'Per task',skills:[],days:[]},mine);o.id=oid;
      const existing=await first(db,"SELECT id FROM live_engagements WHERE worker_id=? AND employer_id=? AND status NOT IN ('Completed','Cancelled','Declined')",target.id,mine.id);if(existing){const previous=await first(db,'SELECT opening_id FROM live_engagements WHERE id=?',existing.id);if(previous.opening_id!==oid)fail(409,'You already have an active conversation with this worker.');}
      openingRow={id:oid,employer_id:mine.id,status:'Open',data:JSON.stringify(o)};
      await run(db,"INSERT OR IGNORE INTO live_openings (id,employer_id,status,data,revision,created_at) VALUES (?,?,'Open',?,1,?)",oid,mine.id,openingRow.data,now());const saved=await first(db,'SELECT employer_id,data FROM live_openings WHERE id=?',oid);if(saved.employer_id!==mine.id||saved.data!==openingRow.data)fail(409,'Request reference already used.');
    }else openingRow=await first(db,'SELECT * FROM live_openings WHERE id=?',text(body.openingId,'opening ID',100));
    if(!openingRow||openingRow.status!=='Open')fail(409,'This opening is unavailable.');
    const w=role==='worker'?mine:await first(db,"SELECT * FROM live_profiles WHERE id=? AND role='worker' AND published=1 AND suspended=0",body.workerId);
    const e=await first(db,"SELECT * FROM live_profiles WHERE id=? AND role='employer' AND published=1 AND suspended=0",openingRow.employer_id);
    if(!w||!e||w.user_id===e.user_id||role==='employer'&&mine.id!==e.id)fail(403,'Choose an available worker and your own opening.');
    if(decoded(w).acceptingBookings===false||await isBlocked(db,w.id,e.id))fail(403,'Contact is unavailable.');
    const exists=await first(db,'SELECT id FROM live_engagements WHERE opening_id=? AND worker_id=?',openingRow.id,w.id);
    if(!exists){const gid='ENG-'+openingRow.id+'-'+w.id,at=now(),o=decoded(openingRow),g={id:gid,openingId:o.id,workerId:w.id,employerId:e.id,type:o.type,title:o.title,kind:role==='worker'?'Expression of interest':'Invitation',status:'Pending',initiator:mine.id,created:at,messages:[{id:id('MSG'),actor:mine.id,text:text(body.message,'message'),at}],terms:null,version:0,confirmations:{},completion:{},history:[{text:'Conversation started',at}],postcode:o.postcode||null};
      await run(db,"INSERT OR IGNORE INTO live_engagements (id,opening_id,worker_id,employer_id,status,data,revision,created_at) VALUES (?,?,?,?,'Pending',?,1,?)",gid,o.id,w.id,e.id,JSON.stringify(g),at);await notify(db,role==='worker'?e.id:w.id,'invitation','New invitation: '+o.title,gid);}
  }else if(kind==='engagements'&&parts[2]){
    const row=await engagementFor(db,user,parts[2]),g=decoded(row),myProfiles=await all(db,'SELECT id FROM live_profiles WHERE user_id=?',user.id),actor=myProfiles.find(p=>p.id===g.workerId||p.id===g.employerId)?.id,target=actor===g.workerId?g.employerId:g.workerId,action=parts[3];
    if(body.revision!==row.revision)fail(409,'The conversation changed. Refresh and try again.');
    if(action!=='review'&&await isBlocked(db,actor,target))fail(403,'Contact is blocked.');
    const at=now();let title='Conversation updated: '+g.title;
    if(action==='accept'||action==='decline'){if(g.status!=='Pending'||actor===g.initiator)fail(409,'Only the invited participant can respond.');g.status=action==='accept'?'Accepted':'Declined';title=(action==='accept'?'Invitation accepted: ':'Invitation declined: ')+g.title;}
    else if(action==='message'){if(['Completed','Declined','Cancelled'].includes(g.status))fail(409,'This conversation is closed.');if(g.messages.length>=500)fail(409,'This conversation has reached its message limit.');g.messages.push({id:id('MSG'),actor,text:text(body.text,'message'),at});title='New message: '+g.title;}
    else if(action==='terms'){
      if(!['Accepted','Confirmed'].includes(g.status))fail(409,'Accept the invitation before agreeing work.');
      const t=body.terms;if(!t||typeof t!=='object')fail(400,'Add work details.');
      g.terms={scope:text(t.scope,'scope'),pay:number(t.pay,'pay'),basis:choose(t.basis,bases,'payment basis'),schedule:text(t.schedule,'schedule',300),start:date(t.start,'start date'),city:text(t.city,'city',70),area:text(t.area,'area',90),completionDate:t.completionDate?date(t.completionDate,'completion date'):'',materials:optional(t.materials,'materials',300),accommodation:optional(t.accommodation,'accommodation',100),paymentMethod:choose(t.paymentMethod||'bank_transfer',['cash','bank_transfer'],'payment method')};
      if(g.terms.pay<=0||g.terms.pay*100!==Math.round(g.terms.pay*100)||g.terms.completionDate&&g.terms.completionDate<g.terms.start)fail(400,'Enter valid pay and dates.');
      g.version++;g.confirmations={};g.completion={};g.status='Accepted';title='Work details proposed: '+g.title;
    }else if(action==='confirm'){if(g.status!=='Accepted'||!g.terms||body.version!==g.version)fail(409,'Review the current work details before confirming.');g.confirmations[actor]=g.version;if(g.confirmations[g.workerId]===g.version&&g.confirmations[g.employerId]===g.version)g.status='Confirmed';title='Work details confirmed: '+g.title;}
    else if(action==='complete'){if(g.status!=='Confirmed')fail(409,'Both participants must confirm the work details first.');g.completion[actor]=true;if(g.completion[g.workerId]&&g.completion[g.employerId])g.status='Completed';title=(g.status==='Completed'?'Work completed: ':'Completion requested: ')+g.title;}
    else if(action==='cancel'){if(['Completed','Declined','Cancelled'].includes(g.status))fail(409,'This conversation is closed.');g.status='Cancelled';title='Engagement cancelled: '+g.title;}
    else if(action==='review'){
      if(g.status!=='Completed')fail(409,'Reviews require completed work.');const rating=Number(body.rating);if(!Number.isInteger(rating)||rating<1||rating>5)fail(400,'Choose 1 to 5 stars.');
      if(await first(db,'SELECT id FROM live_reviews WHERE engagement_id=? AND author=?',g.id,actor))fail(409,'You have already reviewed this work.');
      await run(db,'INSERT INTO live_reviews (id,engagement_id,author,target,rating,text,created_at) VALUES (?,?,?,?,?,?,?)',id('REV'),g.id,actor,target,rating,text(body.text,'review',1000),at);await notify(db,target,'review','New review: '+g.title,g.id);
      return hiringState(db,user,env,request);
    }else fail(404,'Action not found.');
    delete g.revision;g.history.push({text:action+' by '+actor,at});if(g.history.length>600)g.history=g.history.slice(-600);
    await mutate(db,row,g,target,action,title);
  }else if(kind==='blocks'){
    const mine=await ownProfile(db,user,choose(body.role,['worker','employer'],'role')),target=text(body.target,'profile ID',100);
    if(target===mine.id||!await first(db,'SELECT id FROM live_profiles WHERE id=?',target))fail(400,'Choose another profile.');
    if(body.blocked===false)await run(db,'DELETE FROM live_blocks WHERE actor=? AND target=?',mine.id,target);
    else await run(db,'INSERT OR IGNORE INTO live_blocks (actor,target) VALUES (?,?)',mine.id,target);
  }else if(kind==='reports'){
    await run(db,'DELETE FROM rate_limits WHERE expires_at<?',Date.now());
    const recent=await first(db,'SELECT COUNT(*) AS n FROM live_reports WHERE user_id=? AND created_at>?',user.id,new Date(Date.now()-3600000).toISOString());if(recent.n>=10)fail(429,'Please wait before submitting another report.');
    const target=text(body.target,'target',100),reason=text(body.reason,'reason',100),details=text(body.details,'details',1500),rid=id('RPT');
    await run(db,"INSERT INTO live_reports (id,user_id,target,kind,reason,details,status,created_at) VALUES (?,?,?,?,?,?,'open',?)",rid,user.id,target,choose(body.kind,['profile','opening','engagement','support'],'report type'),reason,details,now());
    return {ok:true,reference:rid,message:'Your report has been saved for review.'};
  }else if(kind==='notifications')await run(db,'UPDATE live_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',now(),user.id);
  else if(kind==='payments'){
    const row=await engagementFor(db,user,text(body.engagementId,'engagement ID',100)),g=decoded(row);
    if(!['Confirmed','Completed'].includes(g.status))fail(409,'Confirm work details before recording payment.');
    const myProfiles=await all(db,'SELECT id FROM live_profiles WHERE user_id=?',user.id),payer=myProfiles.some(p=>p.id===g.employerId);
    if(parts[2]){
      const p=await first(db,'SELECT * FROM live_payments WHERE id=? AND engagement_id=?',parts[2],g.id);if(!p)fail(404,'Payment record not found.');if(payer)fail(403,'Only the worker can acknowledge receipt.');
      const status=choose(body.status,['acknowledged','disputed'],'payment status');await run(db,"UPDATE live_payments SET status=?,confirmed_at=? WHERE id=? AND status='reported'",status,now(),p.id);await notify(db,g.employerId,'payment','Payment '+status+': '+g.title,g.id);
    }else {
      if(!payer)fail(403,'Only the hirer can record sending payment.');const amount=Number(body.amount);if(!Number.isSafeInteger(amount)||amount<100||amount>100000000)fail(400,'Enter a valid amount in kobo.');
      const key=text(body.requestId,'request reference',100),pid='PAY-'+key;
      const existing=await first(db,'SELECT * FROM live_payments WHERE id=?',pid);if(existing&&(existing.payer!==g.employerId||existing.engagement_id!==g.id||existing.amount!==amount))fail(409,'Payment reference already used.');
      await run(db,"INSERT OR IGNORE INTO live_payments (id,engagement_id,payer,recipient,amount,method,note,status,created_at) VALUES (?,?,?,?,?,?,?,'reported',?)",pid,g.id,g.employerId,g.workerId,amount,choose(body.method,['cash','bank_transfer'],'payment method'),optional(body.note,'payment note',300),now());
      if(!existing)await notify(db,g.workerId,'payment','Please acknowledge payment: '+g.title,g.id);
    }
  }else fail(404,'Endpoint not found.');
  return hiringState(db,user,env,request);
}

export async function adminRoute({db,user,env,request,body,path}){
  if(!await admin(db,user,env))fail(403,'Administrator access is required.');
  if(request.method==='GET')return {reports:await all(db,'SELECT id,target,kind,reason,details,status,resolution,created_at FROM live_reports ORDER BY created_at DESC LIMIT 250'),counts:{accounts:(await first(db,'SELECT COUNT(*) AS n FROM users')).n,profiles:(await first(db,'SELECT COUNT(*) AS n FROM live_profiles')).n,openings:(await first(db,'SELECT COUNT(*) AS n FROM live_openings')).n}};
  const rid=text(body.id,'report ID',100),r=await first(db,'SELECT * FROM live_reports WHERE id=?',rid);if(!r)fail(404,'Report not found.');
  const resolution=text(body.resolution,'resolution',1500);
  choose(body.action,['resolve','hide_profile','close_opening'],'moderation action');
  if(body.action==='hide_profile'&&r.kind!=='profile')fail(400,'This report is not about a profile.');
  if(body.action==='close_opening'&&r.kind!=='opening')fail(400,'This report is not about an opening.');
  if(body.action==='hide_profile')await run(db,'UPDATE live_profiles SET published=0,suspended=1,revision=revision+1 WHERE id=?',r.target);
  if(body.action==='close_opening')await run(db,"UPDATE live_openings SET status='Closed',revision=revision+1 WHERE id=?",r.target);
  await run(db,"UPDATE live_reports SET status='resolved',resolution=? WHERE id=?",resolution,rid);await notices(db,r.user_id,'support','Your report was reviewed. Reference '+rid,null).run();
  return {ok:true};
}

const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
export async function accountRoute({db,user,env,request,body,path,passwordHash}){
  if(path==='auth/forgot'||path==='auth/verification/request'){
    if(path.includes('verification')&&!user)fail(401,'Sign in first.');
    if(!emailReady(env))return {ok:false,deliveryConfigured:false,message:'Email delivery is not connected yet. Signed-in users can change their password in Account settings.'};
    const email=path==='auth/forgot'?text(body.email,'email',254).toLowerCase():user.email;
    const found=await first(db,'SELECT id,email FROM users WHERE email=?',email),purpose=path==='auth/forgot'?'reset':'verify';
    if(found){
      const token=hex(crypto.getRandomValues(new Uint8Array(32))),tid=id('TOKEN');
      await run(db,'INSERT INTO live_email_tokens (id,hash,user_id,purpose,expires_at) VALUES (?,?,?,?,?)',tid,await digest(token),found.id,purpose,Date.now()+3600000);
      const link=env.APP_ORIGIN+'/#'+(purpose==='reset'?'reset':'verify')+'/'+token;
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':tid},body:JSON.stringify({from:env.EMAIL_FROM,to:found.email,subject:purpose==='reset'?'Reset your LocHire password':'Verify your LocHire email',text:'Open this link within one hour: '+link+'\nIf you did not request this, you can ignore it.'}),signal:AbortSignal.timeout(10000)});
      if(!response.ok){await run(db,'DELETE FROM live_email_tokens WHERE id=?',tid);fail(503,'Email delivery is temporarily unavailable. Please try again.');}
    }
    return {ok:true,message:'If this address has an account, an email has been requested. Check your inbox.'};
  }
  if(path==='auth/reset'||path==='auth/verify'){
    if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))fail(400,'Invalid or expired link.');
    const purpose=path==='auth/reset'?'reset':'verify',hash=await digest(body.token),token=await first(db,'SELECT * FROM live_email_tokens WHERE hash=? AND purpose=? AND expires_at>? AND used_at IS NULL',hash,purpose,Date.now());if(!token)fail(400,'Invalid or expired link.');
    const at=now()+'-'+crypto.randomUUID(),statements=[db.prepare('UPDATE live_email_tokens SET used_at=? WHERE id=? AND used_at IS NULL').bind(at,token.id)];
    if(purpose==='reset'){
      const password=text(body.password,'password',200,10),salt=hex(crypto.getRandomValues(new Uint8Array(16))),hashed=await passwordHash(password,salt);
      statements.push(db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=? AND EXISTS(SELECT 1 FROM live_email_tokens WHERE id=? AND used_at=?)').bind(hashed,salt,token.user_id,token.id,at),db.prepare('DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM live_email_tokens WHERE id=? AND used_at=?)').bind(token.user_id,token.id,at));
    }else statements.push(db.prepare('INSERT INTO live_account_settings (user_id,email_verified_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM live_email_tokens WHERE id=? AND used_at=?) ON CONFLICT(user_id) DO UPDATE SET email_verified_at=excluded.email_verified_at').bind(token.user_id,at,token.id,at));
    const result=await db.batch(statements);if(result[0].meta?.changes===0)fail(400,'This link has already been used.');return {ok:true,message:purpose==='reset'?'Password updated. Sign in with your new password.':'Email verified.'};
  }
  if(path==='auth/password'){
    if(!user)fail(401,'Sign in first.');
    const old=text(body.currentPassword,'current password',200,10),password=text(body.password,'new password',200,10),hash=await passwordHash(old,user.password_salt);
    if(hash!==user.password_hash)fail(401,'Current password is incorrect.');
    const salt=hex(crypto.getRandomValues(new Uint8Array(16))),hashed=await passwordHash(password,salt);
    await db.batch([db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').bind(hashed,salt,user.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
    return {ok:true,message:'Password changed. Sign in again.'};
  }
  fail(404,'Account action not found.');
}
