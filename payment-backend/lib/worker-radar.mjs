// Published profiles are suggested to hirers with matching, open local roles.
// Presence is short-lived; accepting a suggestion invites an interview, not a job.
const rows=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
export const available=p=>p.published!==false&&!p.suspended&&p.acceptingBookings!==false&&p.promoteProfile!==false;
export function matchWorker(worker,opening) {
  if(opening.type==='One-off task'&&opening.date<new Date(Date.now()+3600000).toISOString().slice(0,10))return null;
  if(!available(worker)||opening.status!=='Open'||worker.occupation!==opening.category||!worker.types.includes(opening.type))return null;
  if(norm(worker.city)!==norm(opening.city)||![worker.area,...(worker.coverage||[])].some(a=>norm(a)===norm(opening.area)))return null;
  if(worker.start>opening.start||worker.years<opening.years)return null;
  const skills=(opening.skills||[]).filter(s=>worker.skills.some(w=>norm(w)===norm(s)));
  if(skills.length!==(opening.skills||[]).length)return null;
  if(opening.type==='Ongoing job'&&opening.days.length&&!opening.days.some(d=>worker.days.includes(d)))return null;
  if(!opening.quote&&!worker.flexible&&worker.basis===opening.basis&&worker.pay>opening.max)return null;
  if(['Live-in','Live-out'].includes(opening.accommodation)&&!['Either',opening.accommodation].includes(worker.accommodation))return null;
  return {reasons:[worker.occupation+' role',opening.area+', '+opening.city,...(skills.length?[skills.length+' matching '+(skills.length===1?'skill':'skills')]:[]),'Available by the start date'],skills};
}
const decode=r=>({...JSON.parse(r.data),id:r.id,published:r.published===1,suspended:r.suspended===1});
export async function syncWorkerMatches(db,{workerId,openingId,employerId}={}) {
  const workers=(await rows(db,"SELECT * FROM live_profiles WHERE role='worker' AND published=1 AND suspended=0"+(workerId?' AND id=?':'')+' ORDER BY updated_at DESC LIMIT 1000',...(workerId?[workerId]:[]))).map(decode);
  const openings=await rows(db,"SELECT o.*,p.user_id,p.data AS employer_data FROM live_openings o JOIN live_profiles p ON p.id=o.employer_id WHERE o.status='Open' AND p.published=1 AND p.suspended=0"+(openingId?' AND o.id=?':'')+(employerId?' AND o.employer_id=?':'')+' ORDER BY o.created_at DESC LIMIT 100',...(openingId?[openingId]:[]),...(employerId?[employerId]:[]));
  const existing=new Set((await rows(db,'SELECT opening_id,worker_id FROM live_worker_matches')).map(r=>r.opening_id+'|'+r.worker_id));
  const conversations=new Set((await rows(db,'SELECT opening_id,worker_id FROM live_engagements')).map(r=>r.opening_id+'|'+r.worker_id));
  const blocks=new Set((await rows(db,'SELECT actor,target FROM live_blocks')).flatMap(r=>[r.actor+'|'+r.target,r.target+'|'+r.actor]));
  const stamp=new Date().toISOString(),day=new Date(Date.now()+3600000).toISOString().slice(0,10),statements=[],hirers=new Map();
  for(const r of openings){const opening={...JSON.parse(r.data),id:r.id,status:r.status},employer=JSON.parse(r.employer_data);
    for(const worker of workers){const key=r.id+'|'+worker.id;
      if(worker.id==='worker-'+r.user_id||existing.has(key)||conversations.has(key)||blocks.has(r.employer_id+'|'+worker.id))continue;
      const fit=matchWorker(worker,opening);if(!fit)continue;
      const mid='MATCH-'+r.id+'-'+worker.id;
      statements.push(db.prepare("INSERT OR IGNORE INTO live_worker_matches(id,opening_id,worker_id,employer_id,status,data,created_at) VALUES(?,?,?,?,'pending',?,?)").bind(mid,r.id,worker.id,r.employer_id,JSON.stringify(fit),stamp));
      existing.add(key);if(employer.candidateAlerts!==false)hirers.set(r.employer_id,r.user_id);
      if(statements.length>=50)break;
    }if(statements.length>=50)break;
  }
  if(statements.length)await db.batch(statements);
  for(const [profile,user]of hirers)await db.prepare("INSERT OR IGNORE INTO live_notifications(id,user_id,kind,title,created_at) SELECT ?,?,'worker_match','New workers match your local openings',? WHERE EXISTS(SELECT 1 FROM live_worker_matches WHERE employer_id=? AND created_at=? AND status='pending')").bind('NOT-radar-'+profile+'-'+day,user,stamp,profile,stamp).run();
}
export async function workerMatchFeed(db,employerId) {
  if(!employerId)return [];
  const data=await rows(db,`SELECT m.*,w.data AS worker_data,w.published,w.suspended,o.data AS opening_data,o.status AS opening_status
    FROM live_worker_matches m JOIN live_profiles w ON w.id=m.worker_id JOIN live_openings o ON o.id=m.opening_id
    WHERE m.employer_id=? AND m.status='pending' AND w.published=1 AND w.suspended=0 AND o.status='Open'
    AND NOT EXISTS(SELECT 1 FROM live_blocks b WHERE (b.actor=m.employer_id AND b.target=m.worker_id) OR (b.actor=m.worker_id AND b.target=m.employer_id))
    AND NOT EXISTS(SELECT 1 FROM live_engagements g WHERE g.opening_id=m.opening_id AND g.worker_id=m.worker_id)
    ORDER BY m.created_at DESC,m.id LIMIT 200`,employerId);
  return data.flatMap(r=>{const fit=matchWorker({...JSON.parse(r.worker_data),published:true,suspended:false},{...JSON.parse(r.opening_data),status:r.opening_status});return fit?[{id:r.id,workerId:r.worker_id,openingId:r.opening_id,createdAt:r.created_at,...fit}]:[];});
}
export async function recordPresence(db,userId) {
  await db.prepare("INSERT INTO live_presence(user_id,last_seen_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM live_profiles WHERE user_id=? AND role='worker' AND published=1 AND suspended=0) ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at").bind(userId,Date.now(),userId).run();
}
