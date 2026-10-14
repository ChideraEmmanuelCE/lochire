import {emailReady} from './account-email.mjs';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RETRY_WINDOW=23*60*60*1000;

// The notification trigger is part of the work transaction. Resend receives the
// same idempotency key on retries, even when a response or database update fails.
// Delivery is bounded and retried on later authenticated activity; no mail
// failure can roll back an accepted invitation or a saved message.
export async function deliverWorkEmails(db,env,{now=Date.now(),limit=3}={}) {
  if(!env.RESEND_API_KEY||!env.EMAIL_FROM)return {sent:0};
  const rows=(await db.prepare(`SELECT q.*,n.user_id,n.engagement_id,n.created_at,
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
    const link=new URL('/#'+(row.engagement_id?'record/'+encodeURIComponent(row.engagement_id):'notifications'),env.APP_ORIGIN).href;
    // Email carries no message body, job title, pay, exact location or contacts.
    // The participant signs in to see private work details.
    const title='You have a new LocHire work update';
    const text=title+'\n\nOpen your inbox to view your invitation, message or work update.\n\n'+link+'\n\nManage work email alerts in LocHire Settings. Account security emails remain enabled.';
    try {
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'lochire-work-'+row.notification_id},
        body:JSON.stringify({from:env.EMAIL_FROM,to:[row.email],subject:title,text,
          html:'<div style="font-family:Arial,sans-serif;max-width:480px;margin:24px auto;color:#172e25"><h2>LocHire</h2><h1 style="font-size:24px">'+title+'</h1><p>Open your inbox to view your invitation, message or work update.</p><p><a href="'+esc(link)+'" style="display:inline-block;padding:14px 20px;background:#205b42;color:#fff;text-decoration:none;border-radius:10px">View work update</a></p><p style="font-size:13px">Manage work email alerts in LocHire Settings. Account security emails remain enabled.</p></div>'}),
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
