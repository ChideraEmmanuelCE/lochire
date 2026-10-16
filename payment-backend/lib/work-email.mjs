import {jobAlertContent} from './premium.mjs';
import {emailReady} from './account-email.mjs';
import {workerMatchFeed} from './worker-radar.mjs';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RETRY_WINDOW=23*60*60*1000;

async function emailContent(db,env,row) {
  let link=new URL('/#'+(row.kind==='worker_match'?'available':row.engagement_id?'record/'+encodeURIComponent(row.engagement_id):'notifications'),env.APP_ORIGIN).href;
  let title='You have a new LocHire work update',lines=['Open your inbox to view your invitation, message or work update.'],matchIds;
  if(row.kind==='job_alert'){const match=await jobAlertContent(db,env,row);if(!match)return null;link=match.link;if(row.payload)return JSON.parse(row.payload);const o=match.opening;title='New nearby job: '+o.title;lines=['A new job matches your saved location and service preferences.',o.title+' · '+o.category,o.area+', '+o.city,o.quote?'Pay: discuss a quote':'Pay: ₦'+o.min+' – ₦'+o.max+' / '+o.basis,o.description,'Open LocHire to review the job and express interest. Premium Plus alerts do not guarantee a job or priority over other applicants.'];}
  else if(row.kind==='worker_match') {
    const hirer=await db.prepare("SELECT id,data FROM live_profiles WHERE user_id=? AND role='employer' AND published=1 AND suspended=0").bind(row.user_id).first();
    if(!hirer||JSON.parse(hirer.data).candidateAlerts===false)return null;
    const matches=await workerMatchFeed(db,hirer.id);if(!matches.length)return null;
    if(row.payload){const saved=JSON.parse(row.payload);if(saved.matchIds?.some(id=>!matches.some(m=>m.id===id)))return null;return saved;}
    title='Local workers are ready for your openings';lines=['These published profiles match your occupation, skills and area preferences. Review each profile before deciding.'];matchIds=[];
    const seen=new Set();
    for(const m of matches){if(seen.has(m.workerId))continue;seen.add(m.workerId);matchIds.push(m.id);
      const r=await db.prepare('SELECT data FROM live_profiles WHERE id=?').bind(m.workerId).first(),p=JSON.parse(r.data);
      const o=await db.prepare('SELECT data FROM live_openings WHERE id=?').bind(m.openingId).first();
      lines.push(p.name+' · '+p.occupation+' · '+p.area+', '+p.city,p.years+' years experience · Skills: '+p.skills.slice(0,8).join(', '),'Available from '+p.start+' · '+(p.flexible?'Discuss a quote':'Expected pay: ₦'+p.pay+' / '+p.basis),'Matches: '+JSON.parse(o.data).title);
      if(matchIds.length>=5)break;
    }
    lines.push('Open LocHire to view profiles, accept for an interview or decline.');
  }else if(row.kind==='interview') {
    const r=await db.prepare('SELECT * FROM live_engagements WHERE id=?').bind(row.engagement_id).first();
    if(!r||['Cancelled','Declined'].includes(r.status))return null;
    const g=JSON.parse(r.data),t=g.interview;if(!t)return null;
    if(row.payload)return JSON.parse(row.payload);
    title='You have been accepted for an interview';
    const p=await db.prepare('SELECT data FROM live_profiles WHERE id=?').bind(g.employerId).first();
    lines=['A hirer has invited you to interview for '+g.title+'.','Hirer: '+JSON.parse(p.data).name,'When: '+t.date+' at '+t.time+' WAT','Location: '+t.location,'Contact: '+t.contactName+' · '+t.phone,...(t.contactEmail?['Email: '+t.contactEmail]:[]),...(t.notes?['Notes: '+t.notes]:[]),'Your interview details are saved in My work. Open the invitation to confirm attendance or decline.'];
  }else if(row.payload)return JSON.parse(row.payload);
  const footer='Manage work email alerts in LocHire Settings. Account security emails remain enabled.';
  return {subject:title,text:title+'\n\n'+lines.join('\n\n')+'\n\n'+link+'\n\n'+footer,html:'<div style="font-family:Arial,sans-serif;max-width:480px;margin:24px auto;color:#172e25"><h2>LocHire</h2><h1 style="font-size:24px">'+esc(title)+'</h1>'+lines.map(s=>'<p>'+esc(s)+'</p>').join('')+'<p><a href="'+esc(link)+'" style="display:inline-block;padding:14px 20px;background:#205b42;color:#fff;text-decoration:none;border-radius:10px">'+(row.kind==='job_alert'?'View nearby job':row.kind==='worker_match'?'View available workers':row.kind==='interview'?'View interview invitation':'View work update')+'</a></p><p style="font-size:13px">'+footer+'</p></div>',...(matchIds?{matchIds}:{})};
}

// The notification trigger is part of the work transaction. Resend receives the
// same idempotency key on retries, even when a response or database update fails.
// Delivery is bounded and retried on later authenticated activity; no mail
// failure can roll back an accepted invitation or a saved message.
export async function deliverWorkEmails(db,env,{now=Date.now(),limit=3}={}) {
  if(!env.RESEND_API_KEY||!env.EMAIL_FROM)return {sent:0};
  const rows=(await db.prepare(`SELECT q.*,n.user_id,n.kind,n.engagement_id,n.created_at,
    u.email,s.email_verified_at,s.hiring_email_enabled
    FROM live_notification_emails q JOIN live_notifications n ON n.id=q.notification_id
    JOIN users u ON u.id=n.user_id
    LEFT JOIN live_account_settings s ON s.user_id=u.id
    WHERE q.status IN ('pending','sending') AND q.next_at<=? AND q.lease_until<=?
    ORDER BY n.created_at,q.notification_id LIMIT ?`).bind(now,now,limit).all()).results;
  let sent=0;
  for(const row of rows) {
    const claim=crypto.randomUUID();
    const acquired=await db.prepare(`UPDATE live_notification_emails
      SET status='sending',claim=?,lease_until=?,attempts=attempts+1,
          first_attempt_at=COALESCE(first_attempt_at,?)
      WHERE notification_id=? AND status IN ('pending','sending') AND next_at<=? AND lease_until<=?`)
      .bind(claim,now+60000,now,row.notification_id,now,now).run();
    if(acquired.meta?.changes!==1)continue;
    const finish=(status,error=null,next=0)=>db.prepare(`UPDATE live_notification_emails
      SET status=?,last_error=?,next_at=?,lease_until=0,claim=NULL,sent_at=?
      WHERE notification_id=? AND claim=?`).bind(status,error,next,status==='sent'?new Date(now).toISOString():null,row.notification_id,claim).run();
    if(!row.email_verified_at||row.hiring_email_enabled===0||!emailReady(env,row.email)) {
      await finish('skipped','delivery_not_enabled');continue;
    }
    // Do not retry an uncertain chargeable send beyond the provider's
    // idempotency retention window. Keep it visible for owner review instead.
    if(row.first_attempt_at&&now-row.first_attempt_at>=RETRY_WINDOW) {
      await finish('review','retry_window_expired');continue;
    }
    try {
      // Freeze provider payloads so retries retain the same idempotency body.
      // Candidate alerts share only published profile summaries. Interview
      // details go only to the invited worker after explicit hirer consent.
      const content=await emailContent(db,env,row);
      if(!content){await finish('skipped','update_no_longer_available');continue;}
      if(!row.payload)await db.prepare('UPDATE live_notification_emails SET payload=? WHERE notification_id=? AND claim=?').bind(JSON.stringify(content),row.notification_id,claim).run();
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'lochire-work-'+row.notification_id},
        body:JSON.stringify({from:env.EMAIL_FROM,to:[row.email],subject:content.subject,text:content.text,html:content.html}),
        signal:AbortSignal.timeout(4000)
      });
      const result=await response.json().catch(()=>null);
      if(response.ok&&typeof result?.id==='string'&&result.id) {await finish('sent');sent++;}
      else if(response.status>=400&&response.status<500&&![408,409,429].includes(response.status))await finish('failed','provider_rejected');
      else await finish(row.attempts>=4?'review':'pending','provider_unavailable',now+Math.min(3600000,60000*2**row.attempts));
    } catch {
      await finish(row.attempts>=4?'review':'pending','delivery_uncertain',now+Math.min(3600000,60000*2**row.attempts));
    }
  }
  return {sent};
}
