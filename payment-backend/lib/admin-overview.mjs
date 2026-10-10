// Called only after the shared administrator authorization check.
const first=(db,sql,...values)=>db.prepare(sql).bind(...values).first();
const all=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results;

export async function adminOverview(db,request){
  const generatedAt=new Date().toISOString();
  const today=new Date(Date.now()+3600000).toISOString().slice(0,10);
  const dayBack=n=>new Date(Date.parse(today+'T00:00:00Z')-n*86400000).toISOString().slice(0,10);
  const start=dayBack(29),week=dayBack(6);
  const params=new URL(request.url).searchParams;
  const q=(params.get('q')||'').trim().slice(0,100);
  const verified=['yes','no'].includes(params.get('verified'))?params.get('verified'):'';
  const page=Math.max(1,Math.min(100000,Math.trunc(Number(params.get('page'))||1)));
  const pageSize=25;
  const dateSql="date(u.created_at,'+1 hour')";
  const [counts,profileCounts,workCounts,reportCounts,signups]=await Promise.all([
    first(db,`SELECT COUNT(*) AS accounts, COALESCE(SUM(CASE WHEN s.email_verified_at IS NOT NULL THEN 1 ELSE 0 END),0) AS verified, COALESCE(SUM(CASE WHEN ${dateSql}=? THEN 1 ELSE 0 END),0) AS today, COALESCE(SUM(CASE WHEN ${dateSql} BETWEEN ? AND ? THEN 1 ELSE 0 END),0) AS week, COALESCE(SUM(CASE WHEN ${dateSql} BETWEEN ? AND ? THEN 1 ELSE 0 END),0) AS month FROM users u LEFT JOIN live_account_settings s ON s.user_id=u.id`,today,week,today,start,today),
    first(db,"SELECT COUNT(*) AS profiles, COUNT(DISTINCT CASE WHEN role='worker' THEN user_id END) AS workers, COUNT(DISTINCT CASE WHEN role='employer' THEN user_id END) AS employers FROM live_profiles"),
    first(db,"SELECT COUNT(*) AS engagements, COALESCE(SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END),0) AS completed FROM live_engagements"),
    first(db,"SELECT COUNT(*) AS pending FROM live_reports WHERE status='open'"),
    all(db,`SELECT ${dateSql} AS day, COUNT(*) AS count FROM users u WHERE ${dateSql} BETWEEN ? AND ? GROUP BY ${dateSql} ORDER BY day`,start,today)
  ]);
  const clauses=[],values=[];
  if(q){clauses.push("(instr(lower(u.name),lower(?))>0 OR instr(lower(u.email),lower(?))>0)");values.push(q,q);}
  if(verified)clauses.push('s.email_verified_at IS '+(verified==='yes'?'NOT ':'')+'NULL');
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
  const join=' FROM users u LEFT JOIN live_account_settings s ON s.user_id=u.id';
  const total=(await first(db,'SELECT COUNT(*) AS total'+join+where,...values)).total;
  const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.min(page,pages);
  const users=await all(db,'SELECT u.id,u.name,u.email,u.role,u.created_at,s.email_verified_at, (SELECT COUNT(*) FROM live_profiles p WHERE p.user_id=u.id) AS profile_count'+join+where+' ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?',...values,pageSize,(current-1)*pageSize);
  const byDay=new Map(signups.map(d=>[d.day,d.count]));
  return {generatedAt,timeZone:'Africa/Lagos',counts:{...counts,unverified:counts.accounts-counts.verified,...profileCounts,...workCounts,pendingReports:reportCounts.pending,openings:(await first(db,'SELECT COUNT(*) AS n FROM live_openings')).n},signups:Array.from({length:30},(_,i)=>{const day=dayBack(29-i);return {day,count:byDay.get(day)||0};}),users,pagination:{page:current,pageSize,total,pages},filters:{q,verified}};
}
