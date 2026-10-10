// Transactional account mail. Secrets and link tokens never reach API responses.
const enc=new TextEncoder();
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const emailReady=(env,email)=>!!env.RESEND_API_KEY&&!!env.EMAIL_FROM&&(env.EMAIL_MODE!=='test'||(!!env.EMAIL_TEST_RECIPIENT&&String(email||'').toLowerCase()===env.EMAIL_TEST_RECIPIENT.trim().toLowerCase()));
const generic='If this address has an account, a reset email has been requested. Check your inbox and spam folder.';
export async function requestAccountEmail(db,env,user,purpose){
 if(env.EMAIL_MODE==='test'&&purpose==='reset'&&!!env.RESEND_API_KEY&&!!env.EMAIL_FROM&&(!user||!emailReady(env,user.email)))return {ok:true,deliveryConfigured:true,message:generic};
 if(!emailReady(env,user?.email))return {ok:false,deliveryConfigured:false,message:'Email sending is awaiting activation. You can change your password with your current password in Account settings.'};
 if(!user)return {ok:true,deliveryConfigured:true,message:generic};
 if(purpose==='verify'&&(await db.prepare('SELECT email_verified_at FROM live_account_settings WHERE user_id=?').bind(user.id).first())?.email_verified_at)return {ok:true,alreadyVerified:true,deliveryConfigured:true,message:'Your email is already verified.'};
 const now=Date.now(),recent=await db.prepare('SELECT id FROM live_email_tokens WHERE user_id=? AND purpose=? AND expires_at>? AND used_at IS NULL LIMIT 1').bind(user.id,purpose,now+3540000).first();
 if(recent)return {ok:true,deliveryConfigured:true,...(purpose==='verify'?{retryAfter:60}:{}),message:purpose==='reset'?generic:'A verification email was recently requested. Check your inbox or wait one minute to resend.'};
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),id='TOKEN-'+crypto.randomUUID(),link=new URL('/#'+purpose+'/'+token,env.APP_ORIGIN).href;
 const title=purpose==='reset'?'Reset your LocHire password':'Verify your LocHire email',action=purpose==='reset'?'Choose a new password':'Verify email',intro=purpose==='reset'?'Use the button below to choose a new password.':'Confirm your email address to finish your profile and continue using LocHire.';
 await db.prepare('DELETE FROM live_email_tokens WHERE user_id=? AND (expires_at<? OR used_at IS NOT NULL)').bind(user.id,now).run();
 await db.prepare('INSERT INTO live_email_tokens (id,hash,user_id,purpose,expires_at) VALUES (?,?,?,?,?)').bind(id,await digest(token),user.id,purpose,now+3600000).run();
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.EMAIL_FROM,to:[user.email],subject:title,text:title+'\n\n'+intro+'\n\n'+link+'\n\nThis link expires in one hour. If you did not request this, ignore this email.',html:'<!doctype html><html><body style="margin:0;background:#f6f8f5;font-family:Arial,sans-serif;color:#172e25"><div style="max-width:480px;margin:32px auto;padding:28px;background:#ffffff;border-radius:16px"><p style="font-size:22px;font-weight:bold;color:#205b42">LocHire</p><h1 style="font-size:24px">'+title+'</h1><p style="line-height:1.6">'+intro+'</p><p style="margin:28px 0"><a href="'+esc(link)+'" style="background:#205b42;color:#ffffff;padding:14px 22px;border-radius:10px;text-decoration:none;display:inline-block">'+action+'</a></p><p style="font-size:13px;line-height:1.6">This link expires in one hour. If you did not request this, ignore this email.</p><p style="font-size:12px;line-height:1.6;overflow-wrap:anywhere">Button not working? Open this link:<br><a href="'+esc(link)+'">'+esc(link)+'</a></p></div></body></html>'}),signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>null);if(!response.ok||typeof data?.id!=='string'||!data.id)throw Error('Provider rejected email.');
 }catch{
  await db.prepare('DELETE FROM live_email_tokens WHERE id=?').bind(id).run();
  // Recovery answers stay identical for unknown and registered addresses.
  if(purpose==='reset')return {ok:true,deliveryConfigured:true,message:generic};
  return {ok:false,deliveryConfigured:true,message:'The verification email could not be sent. Try resending in a moment.'};
 }
 return {ok:true,deliveryConfigured:true,...(purpose==='verify'?{retryAfter:60}:{}),message:purpose==='reset'?generic:'Verification email requested. Check your inbox and spam folder.'};
}
