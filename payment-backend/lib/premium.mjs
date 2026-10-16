import {KoraError, koraWebhookStatus, queryCharge, toKobo, koraProviderFetch} from './korapay.mjs';

const first=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const all=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
const run=(db,sql,...v)=>db.prepare(sql).bind(...v).run();
const fail=(status,message)=>{throw new KoraError(status,message);};
const now=()=>new Date().toISOString();
export const PREMIUM_PLANS=Object.freeze({
  access:{id:'access',name:'Premium',amount:90000,days:30,alerts:false},
  alerts:{id:'alerts',name:'Premium Plus',amount:120000,days:30,alerts:true}
});
const allowTest=(user,env)=>!!user&&String(env.KORAPAY_PREMIUM_TEST_USERS||'').split(',').map(s=>s.trim().toLowerCase()).some(s=>s&&(s===user.id.toLowerCase()||s===user.email?.toLowerCase()));
export const premiumMode=(user,env)=>env.KORAPAY_MODE!=='live'&&allowTest(user,env)?'test':'live';
export function premiumReadiness(env,user){
  const mode=premiumMode(user,env),configured=koraWebhookStatus(env).webhookReady;
  const ready=env.KORAPAY_PREMIUM_ENABLED==='true'&&configured&&(mode==='test'?allowTest(user,env)&&env.KORAPAY_MODE!=='live':env.KORAPAY_MODE==='live'&&env.KORAPAY_BUSINESS_APPROVED==='true');
  return {name:'Kora',mode,ready,status:ready?'ready':mode==='test'?'test_configuration_pending':'awaiting_kora_approval',salaryPayments:false,walletFunding:false};
}
export async function premiumAccess(db,user,env){
  if(!user)return {active:false,alerts:false,tier:null,expiresAt:null,mode:'live'};
  const mode=premiumMode(user,env),stamp=now();
  const grants=await all(db,"SELECT tier,starts_at,expires_at FROM lh_premium_grants WHERE user_id=? AND mode=? AND revoked_at IS NULL AND expires_at>? ORDER BY starts_at,expires_at",user.id,mode,stamp);
  const coverage=items=>{let end=stamp,active=false;for(const g of items){if(g.starts_at>end)break;active=true;if(g.expires_at>end)end=g.expires_at;}return {active,end:active?end:null};};
  const access=coverage(grants),plus=coverage(grants.filter(g=>g.tier==='alerts'));
  return {active:access.active,alerts:plus.active,tier:plus.active?'alerts':access.active?'access':null,expiresAt:access.end,alertsExpiresAt:plus.end,mode};
}
const pubOrder=o=>({reference:o.reference,tier:o.tier,amount:o.amount,mode:o.mode,status:o.status,createdAt:o.created_at,paidAt:o.paid_at});
export async function premiumState(db,user,env){
  const access=await premiumAccess(db,user,env);
  const preferences=user?await first(db,'SELECT enabled,city,area,category FROM lh_job_alert_preferences WHERE user_id=?',user.id):null;
  const orders=user?(await all(db,'SELECT * FROM lh_kora_premium_orders WHERE user_id=? AND mode=? ORDER BY created_at DESC LIMIT 30',user.id,access.mode)).map(pubOrder):[];
  return {provider:premiumReadiness(env,user),plans:Object.values(PREMIUM_PLANS),premium:access,alertPreferences:preferences?{enabled:preferences.enabled===1,city:preferences.city,area:preferences.area,category:preferences.category}:null,premiumOrders:orders,commerce:{commissionBps:0,premiumAmount:90000},credits:null,bank:null,onlinePayments:[],koraSandboxAvailable:false};
}
async function chargeApi(env,path,body){
  if(!koraWebhookStatus(env).webhookReady)fail(503,'Kora payments are awaiting private configuration.');
  let response;
  try{response=await koraProviderFetch(env,path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.KORAPAY_SECRET_KEY,Accept:'application/json','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{fail(503,'Kora could not be reached. Check your saved purchase before trying again.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!==true||!result.data)fail(503,response.status===401?'Kora rejected the configured key. Payments are temporarily unavailable.':'Kora could not confirm this request. Check your saved purchase before trying again.');
  return result.data;
}
function checkoutUrl(value){let url;try{url=new URL(value);}catch{fail(503,'The Kora checkout could not be validated.');}if(url.protocol!=='https:'||url.hostname!=='checkout.korapay.com'||url.username||url.password||url.port)fail(503,'The Kora checkout could not be validated.');return url.href;}
export async function reconcilePremiumOrder(db,env,row){
  if(row.mode!==(env.KORAPAY_MODE==='live'?'live':'test'))fail(409,'This purchase belongs to a different payment environment.');
  const charge=await queryCharge(env,row.reference);
  if(charge.reference!==row.reference||charge.currency!=='NGN'||toKobo(charge.amount)!==row.amount)fail(409,'Kora verification does not match this saved purchase.');
  const customer=await first(db,'SELECT email FROM users WHERE id=?',row.user_id);
  if(charge.customer?.email?.toLowerCase()!==customer?.email?.toLowerCase())fail(409,'Kora could not confirm the account linked to this purchase.');
  if(charge.status==='success'){
    if(charge.transaction_status&&charge.transaction_status!=='success')fail(409,'Kora has not confirmed a fully paid purchase.');
    if(charge.amount_expected!=null&&toKobo(charge.amount_expected)!==row.amount)fail(409,'Kora returned an unexpected checkout total.');
    if(charge.amount_paid!=null&&toKobo(charge.amount_paid)!==row.amount)fail(409,'The amount paid does not match this premium pass.');
    const stamp=now(),fee=charge.fee==null?0:toKobo(charge.fee,true);
    const gate="EXISTS(SELECT 1 FROM lh_kora_premium_orders WHERE reference=? AND applied=0 AND status NOT IN ('refunded','reversed'))";
    // The unique grant and the applied flag are committed atomically. Duplicate
    // redirects, provider retries and parallel verifications add exactly one pass.
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO lh_premium_grants(reference,user_id,mode,tier,starts_at,expires_at) SELECT ?,?,?,?,MAX(?,COALESCE((SELECT MAX(expires_at) FROM lh_premium_grants WHERE user_id=? AND mode=? AND tier=? AND revoked_at IS NULL),?)),strftime('%Y-%m-%dT%H:%M:%fZ',MAX(?,COALESCE((SELECT MAX(expires_at) FROM lh_premium_grants WHERE user_id=? AND mode=? AND tier=? AND revoked_at IS NULL),?)),'+30 days') WHERE ${gate}`).bind(row.reference,row.user_id,row.mode,row.tier,stamp,row.user_id,row.mode,row.tier,stamp,stamp,row.user_id,row.mode,row.tier,stamp,row.reference),
      db.prepare("UPDATE lh_kora_premium_orders SET status='success',paid_at=COALESCE(paid_at,?),fees=?,applied=1 WHERE reference=? AND status NOT IN ('refunded','reversed') AND EXISTS(SELECT 1 FROM lh_premium_grants WHERE reference=?)").bind(stamp,fee,row.reference,row.reference)
    ]);
  }else if(['refunded','reversed'].includes(charge.status)){
    await db.batch([db.prepare('UPDATE lh_premium_grants SET revoked_at=COALESCE(revoked_at,?) WHERE reference=?').bind(now(),row.reference),db.prepare('UPDATE lh_kora_premium_orders SET status=? WHERE reference=?').bind(charge.status,row.reference)]);
  }else if(['failed','cancelled','expired'].includes(charge.status))await run(db,'UPDATE lh_kora_premium_orders SET status=? WHERE reference=? AND applied=0',charge.status,row.reference);
  return first(db,'SELECT * FROM lh_kora_premium_orders WHERE reference=?',row.reference);
}
export async function premiumWebhook(db,env,event){
  if(!['charge.success','charge.failed','refund.success'].includes(event.event))return {received:true,handled:false};
  const reference=event.event==='refund.success'?event.data.payment_reference:event.data.reference;
  if(typeof reference!=='string'||!/^LHPR-[a-f0-9]{32}$/.test(reference))return {received:true,handled:false};
  const row=await first(db,'SELECT * FROM lh_kora_premium_orders WHERE reference=? AND mode=?',reference,env.KORAPAY_MODE==='live'?'live':'test');
  if(!row)return {received:true,handled:false};
  if(event.event==='refund.success'){
    const refund=await chargeApi(env,'/refunds/'+encodeURIComponent(event.data.reference));
    if(refund.payment_reference!==reference||refund.status!=='success'||refund.currency!=='NGN'||toKobo(refund.amount)>row.amount)fail(409,'Kora has not confirmed this refund.');
    // A refund pauses only the refunded pass; unrelated purchases stay intact.
    await db.batch([db.prepare('UPDATE lh_premium_grants SET revoked_at=COALESCE(revoked_at,?) WHERE reference=?').bind(now(),reference),db.prepare("UPDATE lh_kora_premium_orders SET status='refunded' WHERE reference=?").bind(reference)]);
    return {received:true,handled:true};
  }
  const order=await reconcilePremiumOrder(db,env,row);
  return {received:true,handled:true,unlocked:order.status==='success',mode:row.mode};
}
export async function premiumAction({db,user,env,request,body,path}){
  if(path==='payments/premium/state'&&request.method==='GET')return premiumState(db,user,env);
  if(request.method!=='POST')fail(405,'Method not allowed.');
  if(path==='payments/premium/alerts'){
    if(typeof body.enabled!=='boolean')fail(400,'Choose whether to receive nearby job alerts.');
    const clean=(value,max)=>{if(typeof value!=='string'||value.trim().length>max)fail(400,'Enter valid job alert preferences.');return value.trim();};
    const worker=await first(db,"SELECT data FROM available_live_profiles WHERE user_id=? AND role='worker' AND suspended=0",user.id);if(!worker)fail(409,'Create a worker profile before choosing job alerts.');
    const p=JSON.parse(worker.data),city=clean(body.city??p.city,70),area=clean(body.area??p.area,90),category=clean(body.category??p.occupation,100);
    if(!city)fail(400,'Add a city for nearby job alerts.');
    if(category&&category!==p.occupation&&!['Domestic help','Cooking','Driving','Cleaning','Plumbing','Electrical work','Painting','Carpentry','Appliance repairs','Gate attendant','Shop assistant'].includes(category))fail(400,'Choose a valid service for alerts.');
    await run(db,'INSERT INTO lh_job_alert_preferences(user_id,enabled,city,area,category) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,city=excluded.city,area=excluded.area,category=excluded.category',user.id,body.enabled?1:0,city,area,category);
    return premiumState(db,user,env);
  }
  if(!premiumReadiness(env,user).ready)fail(503,'Premium checkout is awaiting Kora approval and connection testing.');
  if(path==='payments/premium/verify'){
    if(typeof body.reference!=='string'||!/^LHPR-[a-f0-9]{32}$/.test(body.reference))fail(400,'Invalid premium purchase reference.');
    const row=await first(db,'SELECT * FROM lh_kora_premium_orders WHERE reference=? AND user_id=? AND mode=?',body.reference,user.id,premiumMode(user,env));if(!row)fail(404,'This premium purchase does not belong to your account.');
    return {order:pubOrder(await reconcilePremiumOrder(db,env,row)),...await premiumState(db,user,env)};
  }
  if(path!=='payments/premium/checkout')fail(410,'Wallet and salary payments are no longer available on LocHire.');
  const plan=Object.hasOwn(PREMIUM_PLANS,body.tier)?PREMIUM_PLANS[body.tier]:null;if(!plan||body.amount!==plan.amount)fail(409,'Refresh and choose a current premium plan.');
  if(body.consent!==true)fail(400,'Approve this one-time premium purchase first.');
  if(plan.alerts&&body.alertsConsent!==true)fail(400,'Approve nearby job emails, or choose the ₦900 Premium pass.');
  if(typeof body.requestId!=='string'||!/^[-a-zA-Z0-9]{16,70}$/.test(body.requestId))fail(400,'Refresh this form before continuing.');
  const worker=await first(db,"SELECT data FROM available_live_profiles WHERE user_id=? AND role='worker' AND published=1 AND suspended=0",user.id);if(!worker)fail(409,'Publish your worker profile before buying premium access.');
  const mode=premiumMode(user,env),old=await first(db,'SELECT * FROM lh_kora_premium_orders WHERE user_id=? AND mode=? AND claim=?',user.id,mode,body.requestId);
  if(old){if(old.tier!==plan.id||old.amount!==plan.amount)fail(409,'This request belongs to another plan.');return {order:pubOrder(old),checkoutUrl:old.status==='pending'&&old.checkout_url?checkoutUrl(old.checkout_url):null,message:'Your purchase is saved. Check its status before paying again.'};}
  const reference='LHPR-'+crypto.randomUUID().replaceAll('-','');
  await run(db,"INSERT INTO lh_kora_premium_orders(reference,user_id,mode,tier,amount,status,claim,created_at) VALUES(?,?,?,?,?,'initializing',?,?)",reference,user.id,mode,plan.id,plan.amount,body.requestId,now());
  if(plan.alerts){const p=JSON.parse(worker.data);await run(db,'INSERT INTO lh_job_alert_preferences(user_id,enabled,city,area,category) VALUES(?,1,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=1',user.id,p.city,p.area,p.occupation);}
  const result=await chargeApi(env,'/charges/initialize',{reference,amount:plan.amount/100,currency:'NGN',merchant_bears_cost:true,customer:{name:user.name,email:user.email},narration:'LocHire '+plan.name+' - 30 days',redirect_url:new URL('/?premium_reference='+reference+'#premium',env.APP_ORIGIN).href,notification_url:new URL('/api/webhooks/korapay',env.APP_ORIGIN).href,metadata:{'lochire-user':user.id,'lochire-tier':plan.id}});
  if(result.reference!==reference)fail(503,'The Kora purchase reference could not be validated. Check your saved purchase.');
  const url=checkoutUrl(result.checkout_url);
  await run(db,"UPDATE lh_kora_premium_orders SET checkout_url=?,status=CASE WHEN status='initializing' THEN 'pending' ELSE status END WHERE reference=?",url,reference);
  return {checkoutUrl:url,order:pubOrder(await first(db,'SELECT * FROM lh_kora_premium_orders WHERE reference=?',reference))};
}

const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
export function matchesJobAlert(worker,opening,preferences){
  if(opening.status!=='Open'||worker.published===false||worker.suspended||preferences.enabled===0)return false;
  const city=preferences.city||worker.city,area=preferences.area,category=preferences.category;
  return !!city&&norm(city)===norm(opening.city)&&(!category||norm(category)===norm(opening.category))&&(!area||[opening.area].some(a=>norm(a)===norm(area)));
}
export async function queueNearbyJobAlerts(db,openingId){
  const openingRow=await first(db,"SELECT o.*,p.user_id AS hirer_user,p.published,p.suspended FROM live_openings o JOIN available_live_profiles p ON p.id=o.employer_id WHERE o.id=?",openingId);
  if(!openingRow||openingRow.status!=='Open'||!openingRow.published||openingRow.suspended){await run(db,'UPDATE lh_job_alert_outbox SET processed_at=? WHERE opening_id=?',now(),openingId);return;}
  const opening={...JSON.parse(openingRow.data),id:openingRow.id,status:openingRow.status};
  if(opening.title.startsWith('Booking:')){await run(db,'UPDATE lh_job_alert_outbox SET processed_at=? WHERE opening_id=?',now(),openingId);return;}
  // Live passes alone queue live job alerts. Tests use the same matching and
  // delivery contract through fixtures; sandbox money never creates live mail.
  const recipients=await all(db,`SELECT DISTINCT p.user_id,p.data,a.enabled,a.city,a.area,a.category FROM available_live_profiles p JOIN lh_job_alert_preferences a ON a.user_id=p.user_id JOIN live_account_settings s ON s.user_id=p.user_id WHERE p.role='worker' AND p.published=1 AND p.suspended=0 AND a.enabled=1 AND s.email_verified_at IS NOT NULL AND p.user_id!=? AND EXISTS(SELECT 1 FROM lh_premium_grants g WHERE g.user_id=p.user_id AND g.mode='live' AND g.tier='alerts' AND g.revoked_at IS NULL AND g.starts_at<=? AND g.starts_at<=? AND g.expires_at>?) AND NOT EXISTS(SELECT 1 FROM live_blocks b WHERE (b.actor=p.id AND b.target=?) OR (b.target=p.id AND b.actor=?))`,openingRow.hirer_user,now(),openingRow.created_at,now(),openingRow.employer_id,openingRow.employer_id);
  for(const r of recipients){if(!matchesJobAlert(JSON.parse(r.data),opening,r))continue;
    const notification='JOB-'+openingId+'-'+r.user_id;
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO lh_job_alerts(notification_id,user_id,opening_id,created_at) VALUES(?,?,?,?)').bind(notification,r.user_id,openingId,now()),
      db.prepare("INSERT OR IGNORE INTO live_notifications(id,user_id,kind,title,created_at) VALUES(?,?,'job_alert',?,?)").bind(notification,r.user_id,'New nearby job: '+opening.title,now()),
      db.prepare('INSERT OR IGNORE INTO live_notification_emails(notification_id) VALUES(?)').bind(notification)
    ]);
  }
  await run(db,'UPDATE lh_job_alert_outbox SET processed_at=? WHERE opening_id=?',now(),openingId);
}
export async function drainJobAlertOutbox(db){const jobs=await all(db,'SELECT opening_id FROM lh_job_alert_outbox WHERE processed_at IS NULL LIMIT 5');for(const j of jobs)await queueNearbyJobAlerts(db,j.opening_id);return jobs.length;}
export async function jobAlertContent(db,env,row){
  const r=await first(db,`SELECT o.*,p.published,p.suspended,w.data AS worker_data,a.enabled,a.city,a.area,a.category FROM lh_job_alerts j JOIN live_openings o ON o.id=j.opening_id JOIN available_live_profiles p ON p.id=o.employer_id JOIN available_live_profiles w ON w.user_id=j.user_id AND w.role='worker' JOIN lh_job_alert_preferences a ON a.user_id=j.user_id WHERE j.notification_id=? AND w.published=1 AND w.suspended=0 AND NOT EXISTS(SELECT 1 FROM live_blocks b WHERE (b.actor=w.id AND b.target=p.id) OR (b.actor=p.id AND b.target=w.id))`,row.notification_id);
  if(!r||!r.published||r.suspended)return null;
  const access=await premiumAccess(db,{id:row.user_id,email:row.email},{KORAPAY_MODE:'live'}),o={...JSON.parse(r.data),status:r.status};
  if(!access.alerts||!matchesJobAlert(JSON.parse(r.worker_data),o,r))return null;
  return {opening:o,link:new URL('/#opening/'+encodeURIComponent(r.id),env.APP_ORIGIN).href};
}
export async function premiumFinance(db,env){
  const mode=env.KORAPAY_MODE==='live'?'live':'test';
  const totals=await first(db,"SELECT COALESCE(SUM(CASE WHEN status='success' THEN amount ELSE 0 END),0) AS revenue,COALESCE(SUM(CASE WHEN status='success' THEN fees ELSE 0 END),0) AS fees,COUNT(CASE WHEN status='success' THEN 1 END) AS purchases FROM lh_kora_premium_orders WHERE mode=?",mode);
  return {mode,totals,plans:Object.values(PREMIUM_PLANS),orders:await all(db,'SELECT o.reference,o.tier,o.amount,o.status,o.created_at AS createdAt,u.name FROM lh_kora_premium_orders o JOIN users u ON u.id=o.user_id WHERE o.mode=? ORDER BY o.created_at DESC LIMIT 100',mode)};
}
