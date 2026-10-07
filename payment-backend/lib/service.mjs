import { DepositError, depositReadiness, depositSummary, depositAction, depositCallback } from './deposits.mjs';
import { WemaProvider, bankReadiness, authorizeMandate } from './wema.mjs';
import { PostcodeError, postcodeReadiness, lookupPostcode, jobLocation, locationForParticipant } from './postcode.mjs';

const enc = new TextEncoder();
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };
const stamp = () => new Date().toISOString();
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
export const digest = async value => hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
const first = (db, sql, ...values) => db.prepare(sql).bind(...values).first();
const all = async (db, sql, ...values) => (await db.prepare(sql).bind(...values).all()).results;
const run = (db, sql, ...values) => db.prepare(sql).bind(...values).run();
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, createdAt: u.created_at });
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000}, key, 256));
}
function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let r=0; for(let i=0;i<a.length;i++) r|=a.charCodeAt(i)^b.charCodeAt(i); return r===0; }
function clean(value, name, max=120, min=1) { if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,`Enter a valid ${name}.`); return value.trim(); }
function amount(value) { if (!Number.isSafeInteger(value)||value<100||value>100000000) fail(400,'Amount must be between ₦1 and ₦1,000,000, in whole kobo.'); return value; }
function sessionCookie(token, secure=true) { return `lh_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure?'; Secure':''}`; }
async function session(db, request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)lh_session=([^;]+)/)?.[1];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401,'Sign in to your wallet first.');
  const user=await first(db,'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?',await digest(token),Date.now());
  if(!user)fail(401,'Your session has expired. Please sign in again.');
  return user;
}
async function newSession(db,userId) {
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await run(db,'INSERT INTO sessions (hash,user_id,expires_at) VALUES (?,?,?)',await digest(token),userId,Date.now()+86400000);
  return token;
}
async function limit(db,key,max=60) {
  const now=Date.now(),slot=Math.floor(now/300000),k=await digest(`${key}:${slot}`);
  await run(db,'INSERT INTO rate_limits (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1',k,(slot+1)*300000);
  const row=await first(db,'SELECT attempts FROM rate_limits WHERE key=?',k);
  if(row.attempts>max)fail(429,'Too many requests. Try again in a few minutes.');
}
async function trust(db,userId) {
  const jobs=await first(db,"SELECT COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled FROM payment_jobs WHERE worker_id=?",userId);
  const review=await first(db,'SELECT COUNT(*) AS count,AVG(rating) AS average,SUM(CASE WHEN rating>=4 THEN 1 ELSE 0 END) AS positive FROM payment_reviews WHERE target_id=?',userId);
  return { completedJobs: jobs.completed||0, cancelledJobs:jobs.cancelled||0, reviews:review.count||0, rating:review.average?Math.round(review.average*10)/10:null,positiveReviews:review.positive||0,positivePercent:review.count?Math.round((review.positive||0)/review.count*100):null, basis:'Completed payment agreements and participant reviews, including test activity. These records are not a reliability guarantee.' };
}
async function summary(db,user) {
  const w=await first(db,'SELECT * FROM wallets WHERE user_id=?',user.id);
  const transactions=await all(db,'SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100',user.id);
  const jobs=await all(db,'SELECT j.*, e.name AS employer_name,w.name AS worker_name FROM payment_jobs j JOIN users e ON e.id=j.employer_id JOIN users w ON w.id=j.worker_id WHERE employer_id=? OR worker_id=? ORDER BY created_at DESC LIMIT 100',user.id,user.id);
  const locations=jobs.length?await all(db,`SELECT * FROM job_locations WHERE job_id IN (${jobs.map(()=>'?').join(',')})`,...jobs.map(j=>j.id)):[];
  for(const job of jobs)job.location=locationForParticipant(locations.find(l=>l.job_id===job.id),job,user.id);
  const reviews=await all(db,'SELECT r.*,u.name AS author_name FROM payment_reviews r JOIN users u ON u.id=r.author_id WHERE r.target_id=? ORDER BY r.created_at DESC LIMIT 50',user.id);
  const bankPayments=await all(db,"SELECT reference,status,amount,job_id,created_at FROM bank_requests WHERE user_id=? AND kind='payment' ORDER BY created_at DESC LIMIT 20",user.id);
  return { user:publicUser(user),wallet:{id:user.id,currency:'TEST-NGN',available:w.available,held:w.held,bankStatus:w.bank_status,accountNumber:w.bank_account,accountName:w.bank_name,bankEnvironment:w.bank_environment},...await depositSummary(db,user),transactions,jobs,reviews,bankPayments,trust:await trust(db,user.id) };
}
async function jobFor(db,id,user) {
  const job=await first(db,'SELECT * FROM payment_jobs WHERE id=? AND (employer_id=? OR worker_id=?)',id,user.id,user.id);
  if(!job)fail(404,'This payment job is not available to your account.');
  job.location=locationForParticipant(await first(db,'SELECT * FROM job_locations WHERE job_id=?',id),job,user.id);
  return job;
}
// Every money mutation runs as one database transaction. The guard is evaluated
// inside that transaction. All later statements require its operation row.
async function transact(db,user,request,kind,payload,guard,guardValues,statements) {
  const key=request.headers.get('idempotency-key');
  if(!key||!/^[-\w]{8,100}$/.test(key))fail(400,'A valid Idempotency-Key header is required.');
  const fingerprint=await digest(JSON.stringify({kind,payload}));
  const id='OP-'+await digest(`${user.id}:${key}`),at=stamp();
  const checkReplay=async()=>{
    const old=await first(db,'SELECT * FROM operations WHERE id=?',id);
    if(!old)return false;
    if(old.fingerprint!==fingerprint)fail(409,'This request key was already used for different details.');
    return true;
  };
  if(await checkReplay())return {replayed:true};
  const opCondition='EXISTS(SELECT 1 FROM operations WHERE id=?)';
  const batch=[db.prepare(`INSERT INTO operations (id,user_id,key,fingerprint,kind,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id,user.id,key,fingerprint,kind,at,...guardValues)];
  for(const make of statements) {const [sql,values]=make({id,at,opCondition});batch.push(db.prepare(sql).bind(...values));}
  try {await db.batch(batch);} catch(error) {if(await checkReplay())return {replayed:true};throw error;}
  if(!(await first(db,'SELECT id FROM operations WHERE id=?',id)))fail(409,'The job or balance changed. Refresh and try again.');
  return {replayed:false};
}
const transactionInsert=(userId,jobId,kind,amountValue,description)=>({id,at,opCondition})=>[
  `INSERT INTO transactions (id,reference,user_id,job_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,?,?,?,'successful',?,'sandbox',? WHERE ${opCondition}`,
  [`${id}-${kind}-${userId}`,`LH-${id.slice(3,27)}-${kind}-${userId.slice(-6)}`,userId,jobId,kind,amountValue,description,at,id]
];
async function sandboxAction(db,user,request,body,path,env) {
  if(path==='sandbox/fund') {
    const n=amount(body.amount);
    if(n>10000000)fail(400,'Add at most ₦100,000 of test money at a time.');
    const result=await transact(db,user,request,'fund',{amount:n},"COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id=? AND kind='test_credit' AND created_at>?),0)+?<=10000000",[user.id,new Date(Date.now()-86400000).toISOString(),n],[
      ({id,opCondition})=>[`UPDATE wallets SET available=available+? WHERE user_id=? AND ${opCondition}`,[n,user.id,id]],
      transactionInsert(user.id,null,'test_credit',n,'Test funds added · No bank transfer'),
    ]);
    return {...result,...await summary(db,user)};
  }
  if(path==='jobs') {
    if(!['employer','both'].includes(user.role))fail(403,'Only an employer account can create a payment job.');
    const title=clean(body.title,'job title',100),scope=clean(body.scope,'scope',1500,5),category=clean(body.category,'category',70),n=amount(body.amount);
    const rail=body.rail==='wema'?'wema':'sandbox';
    if(rail==='wema'&&!bankReadiness(env).ready)fail(503,'Wema is not connected. Use a test payment agreement.');
    const worker=await first(db,"SELECT id FROM users WHERE id=? AND role IN ('worker','both')",clean(body.workerId,'worker wallet ID',60));
    if(!worker||worker.id===user.id)fail(400,'Use a different registered worker’s wallet ID.');
    const jobId=uid('JOB');
    const location=await jobLocation(body,env,user.id);
    await transact(db,user,request,'create_job',{title,scope,category,amount:n,workerId:worker.id,rail,location},'1=1',[],[
      ({id,at,opCondition})=>[`INSERT INTO payment_jobs (id,employer_id,worker_id,title,scope,category,amount,status,rail,created_at) SELECT ?,?,?,?,?,?,?,'invited',?,? WHERE ${opCondition}`,[jobId,user.id,worker.id,title,scope,category,n,rail,at,id]]
      ,...(location?[({id,opCondition})=>[`INSERT INTO job_locations (job_id,postcode,status,environment,administrative,address,checked_at) SELECT ?,?,?,?,?,?,? WHERE ${opCondition}`,[jobId,location.postcode,location.status,location.environment,location.administrative?JSON.stringify(location.administrative):null,location.address,location.checkedAt,id]]]:[])
    ]);
    return summary(db,user);
  }
  const parts=path.split('/'),job=await jobFor(db,parts[1],user),action=parts[2],employer=job.employer_id===user.id;
  if(action==='accept'||action==='decline') {
    if(employer)fail(403,'Only the invited worker can respond.');
    await transact(db,user,request,action,{jobId:job.id},"EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='invited')",[job.id],[
      ({id,opCondition})=>[`UPDATE payment_jobs SET status=? WHERE id=? AND ${opCondition}`,[action==='accept'?'accepted':'cancelled',job.id,id]]
      ,...(action==='accept'?[({id,at,opCondition})=>[`UPDATE job_locations SET accepted_at=? WHERE job_id=? AND ${opCondition}`,[at,job.id,id]]]:[])
    ]);
  } else if(action==='reserve') {
    if(!employer)fail(403,'Only the employer can reserve payment.');
    if(job.rail!=='sandbox')fail(409,'Use the Wema payment action for this bank payment job.');
    await transact(db,user,request,'reserve',{jobId:job.id},"EXISTS(SELECT 1 FROM payment_jobs j JOIN wallets w ON w.user_id=j.employer_id WHERE j.id=? AND j.status='accepted' AND w.available>=j.amount)",[job.id],[
      ({id,opCondition})=>[`UPDATE wallets SET available=available-?,held=held+? WHERE user_id=? AND ${opCondition}`,[job.amount,job.amount,user.id,id]],
      ({id,opCondition})=>[`UPDATE payment_jobs SET status='funded' WHERE id=? AND ${opCondition}`,[job.id,id]],
      transactionInsert(user.id,job.id,'reserved',-job.amount,`Reserved for ${job.title}`),
    ]);
  } else if(action==='complete') {
    const column=employer?'employer_done':'worker_done';
    await transact(db,user,request,'complete',{jobId:job.id},`EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status IN ('funded','bank_paid') AND ${column}=0)`,[job.id],[
      ({id,opCondition})=>[`UPDATE payment_jobs SET ${column}=1 WHERE id=? AND ${opCondition}`,[job.id,id]],
      ({id,opCondition})=>[`UPDATE wallets SET held=held-? WHERE user_id=? AND ${opCondition} AND EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='funded' AND employer_done=1 AND worker_done=1)`,[job.amount,job.employer_id,id,job.id]],
      ({id,opCondition})=>[`UPDATE wallets SET available=available+? WHERE user_id=? AND ${opCondition} AND EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='funded' AND employer_done=1 AND worker_done=1)`,[job.amount,job.worker_id,id,job.id]],
      ({id,at,opCondition})=>[`INSERT INTO transactions (id,reference,user_id,job_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,?,'received',?,'successful',?,'sandbox',? WHERE ${opCondition} AND EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='funded' AND employer_done=1 AND worker_done=1)`,[`${id}-received`,`LH-${id.slice(3,27)}-received`,job.worker_id,job.id,job.amount,`Payment received for ${job.title}`,at,id,job.id]],
      ({id,at,opCondition})=>[`INSERT INTO transactions (id,reference,user_id,job_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,?,'released',0,'successful',?,'sandbox',? WHERE ${opCondition} AND EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='funded' AND employer_done=1 AND worker_done=1)`,[`${id}-released`,`LH-${id.slice(3,27)}-released`,job.employer_id,job.id,`Payment released for ${job.title}`,at,id,job.id]],
      ({id,at,opCondition})=>[`UPDATE payment_jobs SET status='completed',completed_at=? WHERE id=? AND employer_done=1 AND worker_done=1 AND ${opCondition}`,[at,job.id,id]],
    ]);
  } else if(action==='cancel') {
    if(!employer)fail(403,'Only the employer can cancel. A worker can raise a dispute.');
    await transact(db,user,request,'cancel',{jobId:job.id},"EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status IN ('invited','accepted','funded') AND employer_done=0 AND worker_done=0)",[job.id],[
      ({id,opCondition})=>[`UPDATE wallets SET available=available+?,held=held-? WHERE user_id=? AND ${opCondition} AND EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='funded')`,[job.amount,job.amount,job.employer_id,id,job.id]],
      ({id,at,opCondition})=>[`INSERT INTO transactions (id,reference,user_id,job_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,?,'refunded',?,'successful',?,'sandbox',? WHERE ${opCondition} AND EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='funded')`,[`${id}-refunded`,`LH-${id.slice(3,27)}-refund`,job.employer_id,job.id,job.amount,`Test funds returned for ${job.title}`,at,id,job.id]],
      ({id,opCondition})=>[`UPDATE payment_jobs SET status='cancelled' WHERE id=? AND ${opCondition}`,[job.id,id]],
    ]);
  } else if(action==='dispute') {
    const reason=clean(body.reason,'dispute reason',500,5);
    await transact(db,user,request,'dispute',{jobId:job.id,reason},"EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='funded')",[job.id],[
      ({id,opCondition})=>[`UPDATE payment_jobs SET status='disputed',dispute_reason=? WHERE id=? AND ${opCondition}`,[reason,job.id,id]],
    ]);
  } else if(action==='review') {
    if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)fail(400,'Choose a rating from 1 to 5.');
    const text=clean(body.text,'review',1000,5);
    await transact(db,user,request,'review',{jobId:job.id,rating:body.rating,text},"EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='completed') AND NOT EXISTS(SELECT 1 FROM payment_reviews WHERE job_id=? AND author_id=?)",[job.id,job.id,user.id],[
      ({id,at,opCondition})=>[`INSERT INTO payment_reviews (id,job_id,author_id,target_id,rating,text,created_at) SELECT ?,?,?,?,?,?,? WHERE ${opCondition}`,[uid('REV'),job.id,user.id,employer?job.worker_id:job.employer_id,body.rating,text,at,id]],
    ]);
  } else fail(404,'Payment action not found.');
  return summary(db,user);
}
async function handleBank(db,user,request,body,path,env) {
  const readiness=bankReadiness(env);
  if(!readiness.ready)fail(503,'Wema is not connected yet. The test wallet remains available.');
  const bank=new WemaProvider(env),wallet=await first(db,'SELECT * FROM wallets WHERE user_id=?',user.id);
  if(['wema/deposits/check','wema/balance/refresh'].includes(path)){await limit(db,`bank-read:${user.id}`,10);return {...await depositAction(db,user,body,path,env),...await summary(db,user)};}
  if(path==='wema/payments/create') {
    const job=await jobFor(db,clean(body.jobId,'job ID',60),user);
    if(job.employer_id!==user.id)fail(403,'Only the employer can pay for this job.');
    if(job.rail!=='wema')fail(409,'Create a Wema payment agreement. Test jobs cannot spend real funds.');
    if(typeof body.password!=='string'||!equal(await passwordHash(body.password,user.password_salt),user.password_hash))fail(401,'Confirm your password before making a bank payment.');
    const recipient=await first(db,"SELECT * FROM wallets WHERE user_id=? AND bank_status='active'",job.worker_id);
    if(wallet.bank_status!=='active'||!recipient||(env.WEMA_ENVIRONMENT==='production'&&(wallet.bank_environment!=='production'||recipient.bank_environment!=='production')))fail(409,'Both participants need bank-confirmed Wema wallets.');
    const payment={id:uid('BANK'),user_id:user.id,kind:'payment',reference:uid('LH-PAY'),amount:job.amount,source:wallet.bank_account,destination:recipient.bank_account,job_id:job.id,environment:env.WEMA_ENVIRONMENT};
    const result=await transact(db,user,request,'bank_payment',{jobId:job.id},"EXISTS(SELECT 1 FROM payment_jobs WHERE id=? AND status='accepted' AND rail='wema') AND NOT EXISTS(SELECT 1 FROM bank_requests WHERE job_id=? AND kind='payment')",[job.id,job.id],[
      ({id,at,opCondition})=>[`INSERT INTO bank_requests (id,user_id,kind,reference,amount,source,destination,job_id,status,environment,created_at) SELECT ?,?,'payment',?,?,?,?,?,'created',?,? WHERE ${opCondition}`,[payment.id,user.id,payment.reference,payment.amount,payment.source,payment.destination,job.id,payment.environment,at,id]],
      ({id,opCondition})=>[`UPDATE payment_jobs SET status='bank_pending' WHERE id=? AND ${opCondition}`,[job.id,id]],
    ]);
    if(result.replayed)return {status:'pending',message:'The payment was already submitted. Requery its reference; do not submit it again.'};
    try {
      // Name enquiries confirm both sides before the bank debit request.
      const sourceEnquiry=await bank.sourceNameEnquiry(payment.source);
      const destinationEnquiry=await bank.destinationNameEnquiry(env.WEMA_BANK_CODE||'035',payment.destination);
      if(!bank.matchesAccountName(sourceEnquiry,wallet.bank_name)||!bank.matchesAccountName(destinationEnquiry,recipient.bank_name))throw Error('Bank name enquiry does not match the confirmed wallet owner.');
      await bank.initiateTransfer(payment);
      await run(db,"UPDATE bank_requests SET status='pending' WHERE id=? AND status='created'",payment.id);
    } catch {
      // A timeout can follow a successful bank debit. Preserve the same reference
      // for requery and never auto-retry a money-moving request.
      await run(db,"UPDATE bank_requests SET status='unknown' WHERE id=? AND status='created'",payment.id);
    }
    return {status:'pending',reference:payment.reference,message:'The bank must confirm this transfer. Refresh payment history to requery the same reference.'};
  }
  if(path==='wema/payments/reconcile') {
    const payment=await first(db,"SELECT * FROM bank_requests WHERE reference=? AND kind='payment' AND user_id=?",clean(body.reference,'payment reference',100),user.id);
    if(!payment)fail(404,'Payment not found.');
    if(payment.environment!==env.WEMA_ENVIRONMENT)fail(409,'This payment belongs to a different bank environment.');
    const verified=await bank.verifyPayment(payment);
    await recordBankResult(db,payment,verified);
    return {reference:payment.reference,status:verified.status};
  }
  if(path==='wema/onboarding/status') {
    await limit(db,`bank-read:${user.id}`,10);
    if(wallet.bank_status!=='pending'||!wallet.bank_tracking)fail(409,'There is no pending Wema verification to check.');
    let verified;try{verified=await bank.verifyCreatedWallet(wallet.bank_tracking);}catch{fail(502,'Wema has not confirmed your account yet. Check again later.');}
    if(verified.email!==user.email||!/^\d{10}$/.test(verified.accountNumber||'')||typeof verified.accountName!=='string'||!verified.accountName.trim())fail(409,'Bank wallet ownership could not be confirmed.');
    await run(db,"UPDATE wallets SET bank_status='active',bank_account=?,bank_name=?,bank_environment=? WHERE user_id=? AND bank_status='pending'",verified.accountNumber,verified.accountName,env.WEMA_ENVIRONMENT,user.id);
    return {status:'active',message:'Wema confirmed your bank wallet.'};
  }
  if(path==='wema/onboarding/request') {
    if(body.consent!==true)fail(400,'Your consent is required to request a Wema wallet.');
    if(['active','pending','submitting'].includes(wallet.bank_status))fail(409,'Your Wema wallet is connected or already being processed.');
    if(!/^\d{11}$/.test(body.nin||''))fail(400,'Enter an 11-digit NIN.');
    await run(db,"UPDATE wallets SET bank_status='submitting',bank_consent_at=? WHERE user_id=?",stamp(),user.id);
    const response=await bank.requestWallet({email:user.email,phoneNumber:user.phone,nin:body.nin});
    const tracking=bank.trackingId(response);
    if(!tracking)fail(502,'Wema did not return a tracking reference. Retry only after checking the bank portal.');
    await run(db,"UPDATE wallets SET bank_status='otp_required',bank_tracking=?,bank_consent_at=? WHERE user_id=?",tracking,stamp(),user.id);
    return {status:'otp_required',message:'Enter the OTP sent by Wema to the phone linked to your NIN.'};
  }
  if(path==='wema/onboarding/verify') {
    if(wallet.bank_status!=='otp_required'||!wallet.bank_tracking)fail(409,'Request a Wema wallet first.');
    if(!/^\d{4,8}$/.test(body.otp||''))fail(400,'Enter the OTP sent by Wema.');
    await bank.verifyWallet({otp:body.otp,trackingId:wallet.bank_tracking,phoneNumber:user.phone});
    await run(db,"UPDATE wallets SET bank_status='pending' WHERE user_id=?",user.id);
    return {status:'pending',message:'Wema is processing your wallet. Account details appear after bank confirmation.'};
  }
  if(path==='wema/statements/request') {
    if(body.consent!==true||wallet.bank_status!=='active')fail(400,'Connect a Wema wallet and approve access to its payment history first.');
    const result=await bank.requestStatement(wallet.bank_account,body.fromDate,body.toDate);
    const ref=bank.statementReference(result);if(!ref)fail(502,'Wema did not return a statement reference.');
    await run(db,"INSERT INTO bank_requests (id,user_id,kind,reference,provider_reference,status,created_at) VALUES (?,?, 'statement',?,?,'awaiting_consent',?)",uid('BANK'),user.id,uid('LH-ST'),ref,stamp());
    return {status:'awaiting_consent',message:'Approve this statement request in the ALAT app within 15 minutes.'};
  }
  if(path==='wema/statements/sync') {
    const row=await first(db,"SELECT * FROM bank_requests WHERE user_id=? AND kind='statement' ORDER BY created_at DESC LIMIT 1",user.id);
    if(!row||Date.parse(row.created_at)<Date.now()-900000)fail(409,'Request fresh consent in ALAT before syncing.');
    const records=await bank.getStatement(row.provider_reference);
    // Statement entries are informational only. They can never credit a wallet.
    return {status:'synced',records:bank.locHireRecords(records),message:'Only LocHire-related bank references are returned.'};
  }
  fail(501,'This bank operation requires the confirmed Wema contract. See the integration guide.');
}
async function recordBankResult(db,payment,verified) {
  if(!['successful','failed','pending'].includes(verified.status))fail(502,'Unrecognized bank status.');
  const at=stamp(),eventId=await digest(`${payment.reference}:${verified.status}`);
  const statements=[
    db.prepare('INSERT OR IGNORE INTO bank_events (id,reference,state,created_at) VALUES (?,?,?,?)').bind(eventId,payment.reference,verified.status,at),
    db.prepare("UPDATE bank_requests SET status=? WHERE reference=? AND status NOT IN ('successful','failed')").bind(verified.status,payment.reference),
  ];
  if(verified.status==='successful') {
    const job=await first(db,'SELECT * FROM payment_jobs WHERE id=? AND rail=\'wema\'',payment.job_id);
    if(!job)fail(409,'A matching bank payment job is required.');
    for(const [userId,kind,value] of [[job.employer_id,'bank_paid',-payment.amount],[job.worker_id,'bank_received',payment.amount]]) {
      statements.push(db.prepare("INSERT OR IGNORE INTO transactions (id,reference,user_id,job_id,kind,amount,status,description,mode,created_at) SELECT ?,?,?,?,?,?,'successful',?,?,? WHERE EXISTS(SELECT 1 FROM bank_requests WHERE reference=? AND status='successful')").bind(`${payment.id}-${kind}`,`${payment.reference}-${kind}`,userId,job.id,kind,value,`Wema payment for ${job.title}`,payment.environment==='production'?'wema':'wema_sandbox',at,payment.reference));
    }
    statements.push(db.prepare("UPDATE payment_jobs SET status='bank_paid' WHERE id=? AND status='bank_pending' AND EXISTS(SELECT 1 FROM bank_requests WHERE reference=? AND status='successful')").bind(job.id,payment.reference));
  }
  await db.batch(statements);
}
async function callback(db,request,body,path,env) {
  if(path==='webhooks/wema/authorize')return authorizeMandate(db,body,env);
  if(!bankReadiness(env).ready)fail(503,'Wema callbacks are disabled until configuration is confirmed.');
  if(!env.WEMA_CALLBACK_TOKEN||!equal(request.headers.get('x-wema-callback-token'),env.WEMA_CALLBACK_TOKEN))fail(401,'Invalid bank callback authentication.');
  const bank=new WemaProvider(env);
  if(path==='webhooks/wema/deposits')return depositCallback(db,body,env);
  if(path==='webhooks/wema/wallet') {
    const data=body.data||{},email=String(data.email||'').toLowerCase();
    const user=await first(db,"SELECT u.id,w.bank_tracking FROM users u JOIN wallets w ON w.user_id=u.id WHERE u.email=? AND w.bank_status='pending'",email);
    if(!user)fail(404,'Pending wallet not found.');
    const verified=await bank.verifyCreatedWallet(user.bank_tracking);
    if(verified.email!==email||!/^\d{10}$/.test(verified.accountNumber||'')||typeof verified.accountName!=='string'||!verified.accountName.trim())fail(409,'Bank wallet details could not be independently verified.');
    await run(db,"UPDATE wallets SET bank_status='active',bank_account=?,bank_name=?,bank_environment=? WHERE user_id=? AND bank_status='pending'",verified.accountNumber,verified.accountName,env.WEMA_ENVIRONMENT,user.id);
    return {received:true};
  }
  const reference=clean(body.data?.transactionReference||body.transactionReference,'transaction reference',100);
  const payment=await first(db,"SELECT * FROM bank_requests WHERE reference=? AND kind='payment'",reference);
  if(!payment)fail(404,'Payment reference not found.');
  if(payment.environment!==env.WEMA_ENVIRONMENT)fail(409,'This payment belongs to a different bank environment.');
  // Bank notifications are signals, never proof of money movement. Independently
  // requery status, exact amount, currency, source and destination before recording.
  const verified=await bank.verifyPayment(payment);
  if(!['successful','failed','pending'].includes(verified.status))fail(502,'Unrecognized bank status.');
  await recordBankResult(db,payment,verified);
  // Real bank statements remain separate from the TEST-NGN ledger.
  return {received:true,status:verified.status};
}
export async function handleRequest(request,env) {
  let response;
  const send=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  try {
    if(!env.SERVICE_SECRET||!equal(request.headers.get('x-lochire-service-key'),env.SERVICE_SECRET))fail(403,'Use the LocHire application to access this service.');
    const path=new URL(request.url).pathname.replace(/^\/api\//,'').replace(/\/$/,'');
    const db=env.DB;if(!db)fail(503,'Payment database is unavailable.');
    if(request.method==='GET'&&path==='health'){await first(db,'SELECT COUNT(*) AS total FROM wallets');return send({ok:true,storage:'persistent',ledger:'sandbox',bank:bankReadiness(env).ready?'configured':'awaiting_credentials'});}
    if(request.method==='GET'&&path==='config')return send({mode:'sandbox',currency:'TEST-NGN',wema:{...bankReadiness(env),deposits:depositReadiness(env)},features:{accounts:true,persistentHistory:true,reservedPayments:true,verifiedBankPayments:bankReadiness(env).ready,bankDeposits:depositReadiness(env).ready}});
    if(request.method==='GET'&&path==='postcode/config')return send(postcodeReadiness(env));
    if(!['GET','POST'].includes(request.method))fail(405,'Method not allowed.');
    const origin=request.headers.get('origin');
    if(request.method==='POST'&&!path.startsWith('webhooks/')&&origin!==env.APP_ORIGIN)fail(403,'This request must come from LocHire.');
    if(Number(request.headers.get('content-length')||0)>16000)fail(413,'Request is too large.');
    let body={};
    if(request.method==='POST') {const raw=await request.text();if(raw.length>16000)fail(413,'Request is too large.');try{body=JSON.parse(raw||'{}');}catch{fail(400,'Invalid JSON request.');}if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'Invalid request body.');}
    await limit(db,request.headers.get('x-lochire-client-ip')||'unknown');
    if(path.startsWith('webhooks/')&&request.method==='POST')return send(await callback(db,request,body,path,env));
    if(['auth/register','auth/login'].includes(path)&&request.method==='POST') {
      const email=clean(body.email,'email address',254).toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Enter a valid email address.');
      const password=clean(body.password,'password',200,10);
      await limit(db,`auth:${email}`,10);
      let user;
      if(path==='auth/register') {
        const name=clean(body.name,'name',70),phone=clean(body.phone,'phone number',20);
        if(!/^(\+234|0)\d{10}$/.test(phone))fail(400,'Use a Nigerian number, starting with 0 or +234.');
        if(!['worker','employer','both'].includes(body.role))fail(400,'Choose worker, employer or both.');
        if(body.demoConsent!==true)fail(400,'Confirm that this is a test account with no real money.');
        if(await first(db,'SELECT id FROM users WHERE email=?',email))fail(409,'This email is already registered. Sign in instead.');
        const id=uid('LH'),salt=hex(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(password,salt),at=stamp();
        await db.batch([
          db.prepare('INSERT INTO users (id,email,name,phone,role,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,email,name,phone,body.role,hash,salt,at),
          db.prepare('INSERT INTO wallets (user_id,available,held,bank_status) VALUES (?,0,0,\'not_connected\')').bind(id),
        ]);
        user=await first(db,'SELECT * FROM users WHERE id=?',id);
      } else {
        user=await first(db,'SELECT * FROM users WHERE email=?',email);
        const hash=await passwordHash(password,user?.password_salt||'invalid-account-salt');
        if(!user||!equal(hash,user.password_hash))fail(401,'Email or password is incorrect.');
      }
      const token=await newSession(db,user.id);
      return send(await summary(db,user),path==='auth/register'?201:200,{'Set-Cookie':sessionCookie(token,env.APP_ORIGIN?.startsWith('https:'))});
    }
    if(path==='auth/logout'&&request.method==='POST') {
      const token=request.headers.get('cookie')?.match(/(?:^|;\s*)lh_session=([^;]+)/)?.[1];
      if(token)await run(db,'DELETE FROM sessions WHERE hash=?',await digest(token));
      return send({ok:true},200,{'Set-Cookie':'lh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure'});
    }
    const user=await session(db,request);
    if(path==='postcode/lookup'&&request.method==='POST') {
      if(body.consent!==true)fail(400,'Approve sending this postcode to NIPOST before checking it.');
      await limit(db,`postcode:${user.id}`,10);
      return send(await lookupPostcode(body.code,env,user.id));
    }
    if(path==='wallet'&&request.method==='GET')return send(await summary(db,user));
    if(path.startsWith('members/')&&request.method==='GET') {
      const member=await first(db,'SELECT id,name,role FROM users WHERE id=?',path.split('/')[1]);
      if(!member)fail(404,'Wallet ID not found.');
      return send({...member,trust:await trust(db,member.id)});
    }
    if(path.startsWith('receipts/')&&request.method==='GET') {
      const transaction=await first(db,'SELECT * FROM transactions WHERE reference=? AND user_id=?',decodeURIComponent(path.split('/')[1]),user.id);
      if(!transaction)fail(404,'Receipt not found.');
      const job=transaction.job_id?await jobFor(db,transaction.job_id,user):null;
      const deposit=transaction.kind==='bank_deposit'?await first(db,'SELECT reference,account,environment,verified_at FROM bank_deposits WHERE receipt_reference=? AND user_id=?',transaction.reference,user.id):null;
      return send({transaction,job,deposit,issuedTo:user.name,label:transaction.mode==='wema'?'WEMA BANK TRANSFER RECEIPT':transaction.mode==='wema_sandbox'?'WEMA SANDBOX RECEIPT · NO REAL BANK TRANSFER':'TEST RECEIPT · NO REAL BANK TRANSFER',currency:transaction.mode==='wema'?'NGN':'TEST-NGN'});
    }
    if(request.method==='POST'&&(path==='sandbox/fund'||path==='jobs'||/^jobs\/[^/]+\/(accept|decline|reserve|complete|cancel|dispute|review)$/.test(path))) {
      if(env.PAYMENT_MODE!=='sandbox')fail(503,'The test ledger is disabled. Real bank transfers must use the bank adapter.');
      return send(await sandboxAction(db,user,request,body,path,env));
    }
    if(request.method==='POST'&&path.startsWith('wema/'))return send(await handleBank(db,user,request,body,path,env));
    fail(404,'Endpoint not found.');
  } catch(error) {
    // Never return bank responses, secrets, passwords, NIN, OTP or database errors.
    response=send({error:error instanceof ApiError||error instanceof PostcodeError||error instanceof DepositError?error.message:'The service could not complete this request. Refresh and try again.'},error instanceof ApiError||error instanceof PostcodeError||error instanceof DepositError?error.status:500);
  }
  return response;
}
