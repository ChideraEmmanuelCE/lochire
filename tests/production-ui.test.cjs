const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
async function fixture(extraEnv={}){
  const {handleRequest}=await import('../payment-backend/lib/service.mjs');
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const f of fs.readdirSync(path.join(root,'payment-backend/drizzle')).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(path.join(root,'payment-backend/drizzle',f),'utf8'));
  const db={prepare(sql){return {bind(...values){return {sql,values,first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:sqlite.prepare(sql).run(...values)})};}};},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.values)}));sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const env={DB:db,SERVICE_SECRET:'fixture-service-secret',APP_ORIGIN:'https://lochire.vercel.app',APP_MODE:'production',PAYMENT_MODE:'live',WEMA_MODE:'live',WEMA_ENABLED:'false',WEMA_ENVIRONMENT:'production',...extraEnv};
  let ip=0;const errors=[];
  function browser(options={}){let cookie='',stateDelay=null;const calls=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:env.APP_ORIGIN,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window;
    w.scrollTo=()=>{};w.AbortSignal=global.AbortSignal;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    w.fetch=async(url,options={})=>{calls.push({path:String(url),body:options.body?JSON.parse(options.body):null});const request=new Request(new URL(url,env.APP_ORIGIN),{method:options.method||'GET',headers:{'x-lochire-service-key':env.SERVICE_SECRET,'x-lochire-client-ip':'fixture-'+(++ip),origin:env.APP_ORIGIN,...(cookie?{cookie}:{}),...options.headers},body:options.body});const response=await handleRequest(request,env);const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];if(stateDelay&&String(url).startsWith('/api/hiring/state')){const gate=stateDelay;stateDelay=null;gate.captured();await gate.wait;}return response;};
    let dark=!!options.dark;const listeners=[];w.matchMedia=()=>({get matches(){return dark;},addEventListener:(event,fn)=>listeners.push(fn)});if(options.theme)w.localStorage.setItem('lochire-theme',options.theme);w.eval(fs.readFileSync(path.join(root,'theme.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'live-domain.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
    return {w,calls,deferNextState(){let captured,release;const ready=new Promise(r=>captured=r),wait=new Promise(r=>release=r);stateDelay={captured,wait};return {ready,release};},deviceTheme(value){dark=value;listeners.forEach(fn=>fn());},close:()=>dom.window.close()};
  }
  return {browser,errors,sqlite};
}
async function click(b,selector){const el=b.w.document.querySelector(selector);assert.ok(el,selector+' missing');el.click();await tick();}
function fill(b,values){for(const [name,value]of Object.entries(values)){const active=b.w.document.querySelector("dialog[open] form")||b.w.document.querySelector("main form");const el=active?.querySelector(`[name="${name}"]`);assert.ok(el,name+' missing');if(el.type==='checkbox')el.checked=!!value;else el.value=value;el.dispatchEvent(new b.w.Event('change',{bubbles:true}));}}
async function submit(b,id){const f=b.w.document.getElementById(id);assert.ok(f,id+' missing');f.dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<160&&f.dataset.submitting==='true';i++)await tick();assert.notEqual(f.dataset.submitting,'true','form submission timed out');await tick();}
async function register(b,label){await click(b,'#account-button');await click(b,'[data-page="account"]');await click(b,'[data-action="auth-login"]');await click(b,'[data-action="auth-register"]');fill(b,{name:label,email:label+'@example.test',phone:'08012345678',password:'SecureFixturePassword123!',termsConsent:true,dateOfBirth:'1995-01-01',adultConsent:true});await submit(b,'auth-form');assert.match(b.w.document.querySelector('main').textContent,/Your work profile/);}
async function switchRole(b,role){await click(b,'#role-button');await click(b,`[data-action="role-${role}"]`);}
async function createProfile(b,worker){await click(b,'[data-action="edit-profile"]');fill(b,worker?{city:'Ibadan',area:'Jericho',occupation:'Plumbing',speciality:'Leak repair',skills:'Pipe fitting',years:'4',experience:'Repair and installation work',pay:'20000',basis:'Per task'}:{city:'Ibadan',area:'Jericho',intro:'A household looking for repairs.'});await submit(b,'profile-form');assert.match(b.w.document.querySelector('main').textContent,/Published/);}

test('the published UI has real account gates, empty discovery and no fictional listings',async()=>{
  const f=await fixture(),b=f.browser();try{await tick();assert.match(b.w.document.querySelector('main').textContent,/Find local workers/);assert.doesNotMatch(b.w.document.body.textContent,/DEMO|Amaka Eze|Green Table Kitchen/);assert.ok(b.w.document.querySelector('[data-action="be-worker"]'));assert.ok(b.w.document.querySelector('[data-action="be-employer"]'));await click(b,'#account-button');assert.match(b.w.document.querySelector('dialog').textContent,/Premium & payments/);await click(b,'[data-action="close"]');await click(b,'[data-action="hire"]');assert.match(b.w.document.querySelector('main').textContent,/0 workers/);await click(b,'[data-action="post"]');assert.equal(b.w.document.querySelector('dialog').open,true);assert.ok(b.w.document.querySelector('#auth-form'));assert.equal(f.errors.length,0);}finally{b.close();}
});


function seedPass(f,label,tier='access',status='success'){
 const user=f.sqlite.prepare('SELECT id FROM users WHERE email=?').get(label+'@example.test'),ref='LHPR-'+require('node:crypto').randomUUID().replaceAll('-',''),at=new Date(Date.now()-1000).toISOString();
 f.sqlite.prepare('INSERT INTO lh_kora_premium_orders(reference,user_id,mode,tier,amount,status,claim,created_at,applied) VALUES(?,?,?,?,?,?,?,?,?)').run(ref,user.id,'live',tier,tier==='alerts'?120000:90000,status,require('node:crypto').randomUUID(),at,status==='success'?1:0);
 if(status==='success')f.sqlite.prepare('INSERT INTO lh_premium_grants(reference,user_id,mode,tier,starts_at,expires_at) VALUES(?,?,?,?,?,?)').run(ref,user.id,'live',tier,at,new Date(Date.now()+30*86400000).toISOString());return {ref,id:user.id};
}

test('two real browser sessions create profiles, post work, agree, complete and publish a review',async()=>{
  const f=await fixture(),w=f.browser(),e=f.browser();try{
    await tick();await register(w,'artisan');await createProfile(w,true);seedPass(f,'artisan');await register(e,'hirer');await switchRole(e,'employer');await createProfile(e,false);
    await click(e,'[data-page="openings"]');await click(e,'[data-action="post"]');const future=new Date(Date.now()+86400000).toISOString().slice(0,10);fill(e,{type:'One-off task',category:'Plumbing',title:'Repair the kitchen pipe',description:'Inspect and repair the leak.',min:'15000',max:'25000',basis:'Per task',skills:'Pipe fitting',date:future,duration:'Two hours',accommodation:'Not applicable'});await submit(e,'opening-form');assert.match(e.w.document.querySelector('main').textContent,/Repair the kitchen pipe/);
    await click(w,'[data-page="discover"]');await click(w,'[data-action="refresh"]');await click(w,'[data-action="view-opening"]');await click(w,'[data-action="apply"]');fill(w,{message:'I can help with this repair.'});await submit(w,'apply-form');await click(w,'[data-action="record"]');assert.match(w.w.document.querySelector('main').textContent,/I can help/);
    await click(e,'[data-page="engagements"]');e.w.dispatchEvent(new e.w.Event('focus'));await tick();await click(e,'[data-action="record"]');await click(e,'[data-op="accept"]');await click(e,'[data-action="terms"]');fill(e,{pay:'20000',scope:'Repair the pipe and check for leaks.',schedule:'10am WAT',start:new Date(Date.now()-86400000).toISOString().slice(0,10),completionDate:new Date(Date.now()-86400000).toISOString().slice(0,10)});await submit(e,'terms-form');await click(e,'[data-op="confirm"]');await click(e,'[data-action="eng-final"]');
    w.w.dispatchEvent(new w.w.Event('focus'));await tick();await click(w,'[data-op="confirm"]');await click(w,'[data-action="eng-final"]');assert.match(w.w.document.querySelector('main').textContent,/Confirmed/);
    e.w.dispatchEvent(new e.w.Event('focus'));await tick();await click(e,'[data-action="record-payment"]');fill(e,{amount:'20000',method:'bank_transfer',note:'Kitchen repair transfer'});await submit(e,'payment-form');assert.match(e.w.document.querySelector('main').textContent,/awaiting worker acknowledgement/);
    w.w.dispatchEvent(new w.w.Event('focus'));await tick();await click(w,'[data-action="payment-ack"][data-status="acknowledged"]');assert.match(w.w.document.querySelector('main').textContent,/Acknowledged by worker/);
    e.w.dispatchEvent(new e.w.Event('focus'));await tick();assert.match(e.w.document.querySelector('main').textContent,/Acknowledged by worker/);
    await click(w,'[data-op="complete"]');await click(w,'[data-action="eng-final"]');e.w.dispatchEvent(new e.w.Event('focus'));await tick();await click(e,'[data-op="complete"]');await click(e,'[data-action="eng-final"]');await click(e,'[data-action="review"]');fill(e,{rating:'5',text:'The repair was completed well.'});await submit(e,'review-form');
    await click(e,'[data-action="view-participant"], [data-action="view-person"]');assert.match(e.w.document.querySelector('main').textContent,/5.0 \/ 5/);assert.match(e.w.document.querySelector('main').textContent,/repair was completed well/);assert.equal(f.errors.length,0);
  }finally{w.close();e.close();}
});

test('the old wallet route opens premium access in either role without salary or funding controls',async()=>{
 const f=await fixture(),b=f.browser();try{await tick();await register(b,'wallet');await createProfile(b,true);b.w.location.hash='#wallet';await tick();assert.match(b.w.document.querySelector('main').textContent,/₦900/);assert.match(b.w.document.querySelector('main').textContent,/₦1,200/);assert.match(b.w.document.querySelector('main').textContent,/30 days/);for(const action of ['add-money','pay-online','connect-bank'])assert.equal(b.w.document.querySelector('[data-action="'+action+'"]'),null);await switchRole(b,'employer');assert.equal(b.w.location.hash,'#wallet');assert.equal(b.w.document.querySelectorAll('.premium-plan').length,2);assert.equal(f.errors.length,0);}finally{b.close();}
});

test('locked jobs show upgrade choices while published workers remain visible without a pass',async()=>{
 const f=await fixture(),w=f.browser(),e=f.browser();try{await tick();await register(w,'locked');await createProfile(w,true);await register(e,'lockedhirer');await switchRole(e,'employer');await createProfile(e,false);await click(e,'[data-page="discover"]');await click(e,'[data-action="refresh"]');assert.ok(e.w.document.querySelector('.card'));assert.match(e.w.document.querySelector('main').textContent,/locked/);await click(e,'#account-button');await click(e,'[data-page="openings"]');await click(e,'[data-action="post"]');const future=new Date(Date.now()+86400000).toISOString().slice(0,10);fill(e,{type:'One-off task',category:'Plumbing',title:'Local repair',description:'PRIVATE FULL DESCRIPTION',min:'10000',max:'20000',basis:'Per task',date:future,duration:'One hour',accommodation:'Not applicable'});await submit(e,'opening-form');await click(w,'[data-page="discover"]');await click(w,'[data-action="refresh"]');assert.match(w.w.document.querySelector('main').textContent,/Locked/);assert.doesNotMatch(w.w.document.querySelector('main').textContent,/PRIVATE FULL DESCRIPTION/);await click(w,'[data-action="view-opening"]');assert.equal(w.w.document.querySelector('[data-action="apply"]'),null);assert.ok(w.w.document.querySelector('[data-action="premium"]'));await click(w,'[data-action="premium"]');assert.equal(w.w.document.querySelectorAll('.premium-plan').length,2);assert.match(w.w.document.querySelector('main').textContent,/awaiting approval/);assert.equal(f.errors.length,0);}finally{w.close();e.close();}
});
test('appearance follows the device, saves manual choices and survives navigation',async()=>{
 const f=await fixture(),b=f.browser({dark:true});try{await tick();assert.equal(b.w.document.documentElement.dataset.theme,'dark');await click(b,'#account-button');await click(b,'[data-page="settings"]');await click(b,'[data-action="theme-light"]');assert.equal(b.w.document.documentElement.dataset.theme,'light');assert.equal(b.w.localStorage.getItem('lochire-theme'),'light');b.deviceTheme(true);assert.equal(b.w.document.documentElement.dataset.theme,'light');await click(b,'[data-action="theme-dark"]');assert.equal(b.w.document.documentElement.dataset.theme,'dark');await click(b,'[data-page="discover"]');assert.equal(b.w.document.documentElement.dataset.theme,'dark');await click(b,'#account-button');await click(b,'[data-page="settings"]');assert.equal(b.w.document.querySelector('[data-action="theme-dark"]').getAttribute('aria-pressed'),'true');await click(b,'[data-action="theme-system"]');b.deviceTheme(false);assert.equal(b.w.document.documentElement.dataset.theme,'light');assert.equal(b.w.document.querySelector('meta[name="theme-color"]').content,'#f7f8f2');assert.equal(f.errors.length,0);}finally{b.close();}
 const saved=f.browser({theme:'dark'});try{await tick();assert.equal(saved.w.document.documentElement.dataset.theme,'dark');}finally{saved.close();}
});

test('filters expand on demand and preserve their state through refresh',async()=>{
 const f=await fixture(),b=f.browser();try{await tick();assert.equal(b.w.document.querySelector('[data-disclosure="home-more"]').open,false);assert.equal(b.w.document.querySelectorAll('.header-actions button').length,2);assert.equal(b.w.document.querySelectorAll('#nav button').length,4);await click(b,'[data-page="discover"]');assert.equal(b.w.document.querySelector('[data-disclosure="filters"]').open,false);await click(b,'[data-disclosure="filters"] summary');fill(b,{ });const el=b.w.document.querySelector('[name="search-city"]');el.value='Ibadan';el.dispatchEvent(new b.w.Event('input',{bubbles:true}));await click(b,'[data-action="refresh"]');assert.equal(b.w.document.querySelector('[data-disclosure="filters"]').open,true);assert.equal(b.w.document.querySelector('[name="search-city"]').value,'Ibadan');await click(b,'[data-action="clear-filters"]');assert.equal(b.w.document.querySelector('[name="search-city"]').value,'');assert.equal(f.errors.length,0);}finally{b.close();}
});

test('invalid fields in an optional panel reveal themselves before correction',async()=>{
 const f=await fixture(),b=f.browser();try{await tick();await register(b,'hiddenfield');await click(b,'[data-action="edit-profile"]');const details=b.w.document.querySelector('[data-disclosure="availability"]'),input=details.querySelector('[name="hoursStart"]');assert.equal(details.open,false);input.value='';input.dispatchEvent(new b.w.Event('invalid',{cancelable:true}));assert.equal(details.open,true);assert.equal(f.errors.length,0);}finally{b.close();}
});

test('password settings expose recovery and validate matching new passwords before changing them',async()=>{
 const f=await fixture(),b=f.browser();try{await tick();await register(b,'security');await click(b,'#account-button');await click(b,'[data-page="settings"]');await click(b,'[data-page="password"]');assert.ok(b.w.document.querySelector('[name="currentPassword"]'));assert.ok(b.w.document.querySelector('[data-action="auth-forgot"]'));fill(b,{currentPassword:'SecureFixturePassword123!',password:'NewSecureFixturePassword123!',confirmPassword:'DifferentFixturePassword123!'});await submit(b,'password-form');assert.match(b.w.document.querySelector('#form-error').textContent,/do not match/);assert.equal(b.calls.filter(x=>x.path==='/api/auth/password').length,0);await click(b,'[data-action="auth-forgot"]');assert.equal(b.w.document.querySelector('dialog [name="email"]').value,'security@example.test');await submit(b,'auth-form');assert.match(b.w.document.querySelector('#auth-status').textContent,/awaiting activation/);assert.equal(b.w.document.querySelector('#auth-status').hidden,false);await click(b,'[data-action="close"]');fill(b,{currentPassword:'SecureFixturePassword123!',password:'NewSecureFixturePassword123!',confirmPassword:'NewSecureFixturePassword123!'});await submit(b,'password-form');assert.match(b.w.document.querySelector('main').textContent,/Welcome to LocHire/);assert.equal(f.errors.length,0);}finally{b.close();}
});

test('signup requests verification, reveals its next step, and resumes profile creation after the email link',async()=>{
 const original=global.fetch,mails=[];global.fetch=async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');mails.push(JSON.parse(opts.body));return Response.json({id:'email-'+mails.length});};
 const f=await fixture({RESEND_API_KEY:'re_fixture',EMAIL_FROM:'LocHire <accounts@verified.example>'}),b=f.browser();try{await tick();await click(b,'[data-action="edit-profile"]');await click(b,'[data-action="auth-register"]');fill(b,{name:'Verified worker',email:'verified@example.test',phone:'08012345678',password:'SecureFixturePassword123!',termsConsent:true,dateOfBirth:'1995-01-01',adultConsent:true});await submit(b,'auth-form');assert.equal(mails.length,1);assert.equal(b.w.location.hash,'#check-email');assert.match(b.w.document.querySelector('main').textContent,/verified@example.test/);assert.ok(b.w.document.querySelector('[data-action="verify-email"]'));assert.equal(b.w.document.querySelector('#profile-form'),null);const token=mails[0].text.match(/\/#verify\/([a-f0-9]{64})/)[1];b.w.location.hash='#verify/'+token;await tick();await submit(b,'verify-form');assert.equal(b.w.location.hash,'#email-verified');assert.match(b.w.document.querySelector('main').textContent,/Email verified/);await click(b,'[data-action="continue-verified"]');assert.ok(b.w.document.querySelector('#profile-form'));assert.equal(f.errors.length,0);}finally{b.close();global.fetch=original;}
});

test('reset links let a signed-out user choose a password and return to sign-in',async()=>{
 const original=global.fetch,mails=[];global.fetch=async(url,opts)=>{mails.push(JSON.parse(opts.body));return Response.json({id:'email-'+mails.length});};
 const f=await fixture({RESEND_API_KEY:'re_fixture',EMAIL_FROM:'LocHire <accounts@verified.example>'}),b=f.browser();try{await tick();await click(b,'#account-button');await click(b,'[data-page="account"]');await click(b,'[data-action="auth-register"]');fill(b,{name:'Reset worker',email:'reset@example.test',phone:'08012345678',password:'SecureFixturePassword123!',termsConsent:true,dateOfBirth:'1995-01-01',adultConsent:true});await submit(b,'auth-form');await click(b,'[data-action="logout"]');await click(b,'#account-button');await click(b,'[data-page="account"]');await click(b,'[data-action="auth-forgot"]');fill(b,{email:'reset@example.test'});await submit(b,'auth-form');assert.match(b.w.document.querySelector('#auth-status').textContent,/Check your inbox/);await click(b,'[data-action="close"]');const token=mails[1].text.match(/\/#reset\/([a-f0-9]{64})/)[1];b.w.location.hash='#reset/'+token;await tick();fill(b,{password:'ResetNewPassword123!',confirmPassword:'ResetNewPassword123!'});await submit(b,'reset-form');assert.ok(b.w.document.querySelector('dialog[open] #auth-form'));fill(b,{email:'reset@example.test',password:'ResetNewPassword123!'});await submit(b,'auth-form');assert.equal(b.w.location.hash,'#check-email');assert.equal(f.errors.length,0);}finally{b.close();global.fetch=original;}
});


test('owner dashboard loads real counts, filters users and hides access from other accounts',async()=>{
  const f=await fixture({ADMIN_EMAILS:'owner@example.test'}),owner=f.browser(),member=f.browser();
  try{
    await tick();await register(owner,'owner');await register(member,'member');
    owner.w.location.hash='#admin';await tick();assert.match(owner.w.document.querySelector('main').textContent,/Verify the owner account email/);assert.equal(owner.w.document.querySelector('#admin-users-form'),null);
    const id=f.sqlite.prepare('SELECT id FROM users WHERE email=?').get('owner@example.test').id;
    f.sqlite.prepare('INSERT INTO live_account_settings (user_id,email_verified_at) VALUES (?,?)').run(id,new Date().toISOString());
    owner.w.dispatchEvent(new owner.w.Event('focus'));await tick();await tick();
    assert.equal(owner.w.document.querySelector('.admin-metric strong').textContent,'2');assert.ok(owner.w.document.querySelector('.admin-chart'));assert.equal(owner.w.document.querySelectorAll('.admin-user').length,2);
    fill(owner,{q:'member',verified:''});await submit(owner,'admin-users-form');assert.equal(owner.w.document.querySelectorAll('.admin-user').length,1);assert.match(owner.w.document.querySelector('.admin-user').textContent,/member@example.test/);
    fill(owner,{q:'',verified:'yes'});await submit(owner,'admin-users-form');assert.equal(owner.w.document.querySelectorAll('.admin-user').length,1);assert.match(owner.w.document.querySelector('.admin-user').textContent,/owner@example.test/);
    member.w.location.hash='#admin';await tick();assert.match(member.w.document.querySelector('main').textContent,/Administrator access required/);assert.equal(member.w.document.querySelector('#admin-users-form'),null);
    assert.equal(f.errors.length,0);
  }finally{owner.close();member.close();}
});
test('admin URL has a signed-out sign-in flow and returns to the dashboard after owner login',async()=>{
  const f=await fixture(),b=f.browser();try{
    b.w.history.replaceState(null,'','/admin');b.w.dispatchEvent(new b.w.HashChangeEvent('hashchange'));await tick();assert.match(b.w.document.querySelector('main').textContent,/Admin dashboard/);assert.ok(b.w.document.querySelector('[data-action="admin-login"]'));await click(b,'[data-action="admin-login"]');assert.ok(b.w.document.querySelector('#auth-form'));
  }finally{b.close();}
});

test('a saved Kora purchase is verified from the UI and access restores after logout',async()=>{
 const original=global.fetch,f=await fixture({KORAPAY_MODE:'live',KORAPAY_SECRET_KEY:'sk_live_fixture',KORAPAY_BUSINESS_APPROVED:'true',KORAPAY_WEBHOOKS_ENABLED:'true',KORAPAY_PREMIUM_ENABLED:'true'}),b=f.browser();try{
 await tick();await register(b,'premium');await createProfile(b,true);const purchase=seedPass(f,'premium','alerts','pending');
 global.fetch=async(url)=>{assert.match(url,/charges\/LHPR-/);return Response.json({status:true,data:{reference:purchase.ref,status:'success',currency:'NGN',amount:1200,amount_paid:1200,customer:{email:'premium@example.test'}}});};
 b.w.dispatchEvent(new b.w.Event('focus'));await tick();b.w.location.hash='#premium';await tick();await click(b,'[data-action="premium-check"]');assert.match(b.w.document.querySelector('main').textContent,/Premium Plus active/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM lh_premium_grants').get().n,1);
 await click(b,'[data-action="premium-buy"][data-tier="alerts"]');assert.match(b.w.document.querySelector('dialog').textContent,/₦1,200/);assert.ok(b.w.document.querySelector('[name="alertsConsent"]'));assert.ok(b.w.document.querySelector('[name="consent"]'));assert.equal(b.w.document.querySelector('[name="method"]'),null);await click(b,'[data-action="close"]');
 await click(b,'#account-button');await click(b,'[data-page="account"]');await click(b,'[data-action="logout"]');await loginSaved(b,'premium');b.w.location.hash='#premium';await tick();assert.match(b.w.document.querySelector('main').textContent,/Premium Plus active/);assert.equal(f.errors.length,0);
 }finally{b.close();global.fetch=original;}
});test('owner revenue shows Kora premium purchases without salary commissions or withdrawal controls',async()=>{
 const f=await fixture({ADMIN_EMAILS:'owner@example.test'}),b=f.browser();try{await tick();await register(b,'owner');const user=f.sqlite.prepare('SELECT id FROM users WHERE email=?').get('owner@example.test');f.sqlite.prepare('INSERT INTO live_account_settings(user_id,email_verified_at) VALUES(?,?)').run(user.id,new Date().toISOString());b.w.dispatchEvent(new b.w.Event('focus'));await tick();b.w.location.hash='#finance';await tick();assert.match(b.w.document.querySelector('main').textContent,/Premium revenue/);assert.match(b.w.document.querySelector('main').textContent,/Kora/);assert.doesNotMatch(b.w.document.querySelector('main').textContent,/Service fees|Work payment fee/);assert.equal(b.w.document.querySelector('[data-action="finance-withdraw"]'),null);assert.equal(b.w.document.querySelector('#finance-settings-form'),null);assert.equal(f.errors.length,0);}finally{b.close();}
});

test('worker and hirer invitation links lead to truthful onboarding and preserve account gates',async()=>{
 const f=await fixture(),b=f.browser();try{await tick();b.w.location.hash='#join-worker';await tick();assert.match(b.w.document.querySelector('main').textContent,/Find work near you/);assert.match(b.w.document.querySelector('main').textContent,/verify your email/);await click(b,'[data-action="be-worker"]');assert.ok(b.w.document.querySelector('#auth-form'));await click(b,'[data-action="close"]');b.w.location.hash='#join-hirer';await tick();assert.match(b.w.document.querySelector('main').textContent,/Find local help/);await click(b,'[data-action="be-employer"]');assert.ok(b.w.document.querySelector('#auth-form'));assert.equal(f.errors.length,0);}finally{b.close();}
});

test('work email preference is saved across page reloads without disabling account security mail',async()=>{
 const f=await fixture(),b=f.browser();try{await tick();await register(b,'emailprefs');await click(b,'#account-button');await click(b,'[data-page="settings"]');fill(b,{enabled:false});await submit(b,'email-preferences-form');assert.equal(b.w.document.querySelector('#email-preferences-form [name="enabled"]').checked,false);assert.match(b.w.document.querySelector('main').textContent,/Security and password-reset emails stay enabled/);await click(b,'[data-page="profile"]');await click(b,'[data-page="settings"]');assert.equal(b.w.document.querySelector('#email-preferences-form [name="enabled"]').checked,false);assert.equal(f.errors.length,0);}finally{b.close();}
});

test('hirer-only live matches accept a worker for interview, save details across sessions, and respect dark mode',async()=>{
 const f=await fixture(),w=f.browser({theme:'dark'}),e=f.browser({theme:'dark'});
 try{
  await tick();await register(w,'radarworker');await createProfile(w,true);await register(e,'radarhirer');await switchRole(e,'employer');await createProfile(e,false);
  await click(e,'[data-page="openings"]');await click(e,'[data-action="post"]');const future=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  fill(e,{type:'One-off task',category:'Plumbing',title:'Local pipe repair interview',description:'Inspect and repair the leak.',min:'15000',max:'25000',basis:'Per task',skills:'Pipe fitting',date:future,duration:'Two hours',accommodation:'Not applicable'});await submit(e,'opening-form');
  await click(e,'#account-button');await click(e,'[data-page="available"]');assert.equal(e.w.document.querySelectorAll('.match-card').length,1);assert.match(e.w.document.querySelector('main').textContent,/radarworker/);assert.match(e.w.document.querySelector('main').textContent,/Active now/);assert.match(e.w.document.querySelector('main').textContent,/matching skill/);assert.equal(e.w.document.documentElement.dataset.theme,'dark');
  await click(e,'[data-action="match-accept"]');fill(e,{date:future,time:'10:00',location:'12 Interview Street, Jericho, Ibadan',contactName:'Local hiring manager',phone:'08012345678',contactEmail:'radarhirer@example.test',notes:'Bring examples of your repairs.',shareDetails:false});await submit(e,'interview-form');assert.match(e.w.document.querySelector('#form-error').textContent,/Approve sharing/);
  fill(e,{shareDetails:true});await submit(e,'interview-form');assert.match(e.w.document.querySelector('main').textContent,/12 Interview Street/);assert.ok(e.w.document.querySelector('[data-action="save-interview"]'));
  w.w.dispatchEvent(new w.w.Event('focus'));await tick();await click(w,'[data-page="notifications"]');assert.match(w.w.document.querySelector('main').textContent,/Accepted for an interview/);await click(w,'[data-action="record"]');assert.match(w.w.document.querySelector('.interview-panel').textContent,/Local hiring manager/);assert.match(w.w.document.querySelector('.interview-panel').textContent,/12 Interview Street/);await click(w,'[data-op="accept"]');assert.match(w.w.document.querySelector('.interview-panel').textContent,/confirmed/);
  await click(w,'#account-button');await click(w,'[data-page="settings"]');await click(w,'[data-action="theme-light"]');assert.equal(w.w.document.documentElement.dataset.theme,'light');await click(w,'[data-page="engagements"]');await click(w,'[data-action="record"]');assert.match(w.w.document.querySelector('.interview-panel').textContent,/12 Interview Street/);
  w.w.location.hash='#available';await tick();assert.equal(w.w.document.querySelector('.match-card'),null);assert.match(w.w.document.querySelector('main').textContent,/Switch to Hiring/);
  assert.equal(f.errors.length,0);
 }finally{w.close();e.close();}
});

test('declined matches stay hidden and workers can pause local promotion without changing the theme',async()=>{
 const f=await fixture(),w=f.browser(),e=f.browser();try{
  await tick();await register(w,'declineworker');await createProfile(w,true);await register(e,'declinehirer');await switchRole(e,'employer');await createProfile(e,false);
  await click(e,'[data-page="openings"]');await click(e,'[data-action="post"]');const future=new Date(Date.now()+86400000).toISOString().slice(0,10);
  fill(e,{type:'One-off task',category:'Plumbing',title:'Repair visit',description:'Repair the leak.',min:'15000',max:'25000',basis:'Per task',skills:'Pipe fitting',date:future,duration:'Two hours',accommodation:'Not applicable'});await submit(e,'opening-form');
  await click(e,'#account-button');await click(e,'[data-page="available"]');await click(e,'[data-action="match-decline"]');await submit(e,'match-decline-form');assert.equal(e.w.document.querySelector('.match-card'),null);await click(e,'[data-action="refresh"]');assert.equal(e.w.document.querySelector('.match-card'),null);
  await click(w,'[data-page="profile"]');await click(w,'[data-action="availability-toggle"]');assert.match(w.w.document.querySelector('.availability-panel').textContent,/paused/);await click(w,'[data-action="availability-toggle"]');assert.match(w.w.document.querySelector('.availability-panel').textContent,/Ready for your next opportunity/);assert.equal(f.errors.length,0);
 }finally{w.close();e.close();}
});

test('bank sandbox and salary controls are absent from menus and settings',async()=>{
 const f=await fixture({KORAPAY_MODE:'test',KORAPAY_SANDBOX_WALLET_ENABLED:'true',ADMIN_EMAILS:'retired@example.test'}),b=f.browser();try{await tick();await register(b,'retired');await createProfile(b,true);await click(b,'#account-button');assert.equal(b.w.document.querySelector('[data-page="bank-sandbox"]'),null);await click(b,'[data-page="settings"]');assert.equal(b.w.document.querySelector('[data-page="bank-sandbox"]'),null);assert.ok(b.w.document.querySelector('[data-page="premium"]'));assert.equal(f.errors.length,0);}finally{b.close();}
});
async function loginSaved(b,label){await click(b,'#account-button');await click(b,'[data-page="account"]');await click(b,'[data-action="auth-login"]');fill(b,{email:label+'@example.test',password:'SecureFixturePassword123!'});await submit(b,'auth-form');}
async function logoutSaved(b){await click(b,'#account-button');await click(b,'[data-page="account"]');await click(b,'[data-action="logout"]');}

test('own published worker is visible to hirers; filters are visible and role-aware; edit targets worker',async()=>{
 const f=await fixture(),b=f.browser(),other=f.browser();try{
  await tick();await register(b,'savedworker');await createProfile(b,true);await switchRole(b,'employer');await click(b,'[data-page="discover"]');assert.match(b.w.document.querySelector('#discovery-list').textContent,/1 workers/);assert.match(b.w.document.querySelector('.card').textContent,/Your profile/);
  const city=b.w.document.querySelector('[name="search-city"]');city.value='Abuja';city.dispatchEvent(new b.w.Event('input',{bubbles:true}));assert.match(b.w.document.querySelector('#discovery-list').textContent,/No matches for these filters/);assert.match(b.w.document.querySelector('#active-discovery-filters').textContent,/Abuja/);assert.ok(b.w.document.querySelector('#active-discovery-filters [data-action="clear-filters"]'));await click(b,'#active-discovery-filters [data-action="clear-filters"]');assert.match(b.w.document.querySelector('#discovery-list').textContent,/1 workers/);
  await click(b,'[data-action="view-person"]');assert.equal(b.w.document.querySelector('[data-action="invite"]'),null);await click(b,'[data-action="edit-own-profile"]');assert.equal(b.w.document.querySelector('[name="occupation"]').value,'Plumbing');await click(b,'[data-page="discover"]');const input=b.w.document.querySelector('#discovery-search');input.value='Unmatched phrase';input.dispatchEvent(new b.w.Event('input',{bubbles:true}));await switchRole(b,'employer');assert.equal(b.w.document.querySelector('#discovery-search').value,'');assert.match(b.w.document.querySelector('#discovery-list').textContent,/1 workers/);
  other.w.dispatchEvent(new other.w.Event('focus'));await tick();await click(other,'[data-action="hire"]');assert.match(other.w.document.querySelector('#discovery-list').textContent,/savedworker/);assert.equal(f.errors.length,0);
 }finally{b.close();other.close();}
});

test('logout and fresh sign-in restore both saved profiles and server role, with no data from another account',async()=>{
 const f=await fixture(),b=f.browser(),fresh=f.browser();try{
  await tick();await register(b,'persisted');await createProfile(b,true);await switchRole(b,'employer');await createProfile(b,false);const before=f.sqlite.prepare('SELECT id,role,data,revision,published FROM live_profiles ORDER BY id').all();await logoutSaved(b);assert.match(b.w.document.querySelector('#toast').textContent,/profiles are saved/);b.w.location.hash='#profile';await tick();assert.match(b.w.document.querySelector('main').textContent,/same email/);
  await loginSaved(fresh,'persisted');assert.match(fresh.w.document.querySelector('h1').textContent,/employer profile/);assert.match(fresh.w.document.querySelector('main').textContent,/worker profile is also saved/);assert.match(fresh.w.document.querySelector('.profile-overview').textContent,/Published/);await switchRole(fresh,'worker');assert.match(fresh.w.document.querySelector('.profile-overview').textContent,/Plumbing/);assert.deepEqual(f.sqlite.prepare('SELECT id,role,data,revision,published FROM live_profiles ORDER BY id').all(),before);
  await switchRole(b,'worker');await register(b,'separate');assert.equal(b.w.document.querySelector('.profile-overview'),null);assert.doesNotMatch(b.w.document.querySelector('main').textContent,/persisted@example/);assert.equal(f.errors.length,0);
 }finally{b.close();fresh.close();}
});

test('delayed anonymous refresh cannot replace sign-in or a newly saved profile',async()=>{
 const f=await fixture(),b=f.browser();let held;try{
  await tick();await register(b,'raceuser');await createProfile(b,true);await logoutSaved(b);held=b.deferNextState();b.w.dispatchEvent(new b.w.Event('focus'));await held.ready;await loginSaved(b,'raceuser');assert.match(b.w.document.querySelector('.profile-overview').textContent,/Plumbing/);held.release();await tick();await tick();await click(b,'[data-page="profile"]');assert.match(b.w.document.querySelector('.profile-overview').textContent,/Published/);
  held=b.deferNextState();b.w.dispatchEvent(new b.w.Event('focus'));await held.ready;await click(b,'[data-action="edit-profile"]');fill(b,{speciality:'Updated saved speciality'});await submit(b,'profile-form');held.release();await tick();await click(b,'[data-action="edit-profile"]');assert.equal(b.w.document.querySelector('[name="speciality"]').value,'Updated saved speciality');assert.equal(f.errors.length,0);
 }finally{held?.release();b.close();}
});

test('delayed private refresh cannot restore signed-out data or leak into another account',async()=>{
 const f=await fixture(),b=f.browser();let held;try{
  await tick();await register(b,'oldaccount');await createProfile(b,true);held=b.deferNextState();b.w.dispatchEvent(new b.w.Event('focus'));await held.ready;await logoutSaved(b);await register(b,'newaccount');held.release();await tick();await click(b,'[data-page="profile"]');assert.equal(b.w.document.querySelector('.profile-overview'),null);assert.match(b.w.document.querySelector('main').textContent,/newaccount@example.test/);assert.doesNotMatch(b.w.document.querySelector('main').textContent,/oldaccount/);assert.equal(f.errors.length,0);
 }finally{held?.release();b.close();}
});


test('explicit hirer onboarding after login opens the hirer form while retaining the saved worker',async()=>{
 const f=await fixture(),b=f.browser();try{
  await tick();await register(b,'switchsignin');await createProfile(b,true);await logoutSaved(b);b.w.location.hash='#join-hirer';await tick();await click(b,'[data-action="be-employer"]');fill(b,{email:'switchsignin@example.test',password:'SecureFixturePassword123!'});await submit(b,'auth-form');assert.equal(b.w.document.querySelector('[name="occupation"]'),null);assert.ok(b.w.document.querySelector('[name="intro"]'));assert.match(b.w.document.querySelector('#role-button').textContent,/Hire/);assert.equal(f.sqlite.prepare("SELECT published FROM live_profiles WHERE role='worker'").get().published,1);assert.equal(f.errors.length,0);
 }finally{b.close();}
});

test('email preferences link signs into the receiving account, opens alerts and saves its own opt-out',async()=>{
 const f=await fixture(),b=f.browser();try{
  await tick();await register(b,'emailmanage');await createProfile(b,true);await logoutSaved(b);
  b.w.history.replaceState(null,'','/?manage_job_alerts=1#premium');b.w.dispatchEvent(new b.w.HashChangeEvent('hashchange'));await tick();assert.match(b.w.document.querySelector('main').textContent,/Sign in with the account that received the email/);await click(b,'[data-action="manage-job-alerts"]');fill(b,{email:'emailmanage@example.test',password:'SecureFixturePassword123!'});await submit(b,'auth-form');
  assert.equal(b.w.location.hash,'#premium');assert.equal(new URL(b.w.location.href).searchParams.has('manage_job_alerts'),false);assert.equal(b.w.document.querySelector('[data-disclosure="job-alerts"]').open,true);assert.equal(b.w.document.querySelector('#job-alerts-form [name="city"]').value,'Ibadan');
  fill(b,{enabled:false,city:'Ibadan',area:'Jericho',category:'Plumbing'});await submit(b,'job-alerts-form');assert.equal(f.sqlite.prepare('SELECT enabled FROM lh_job_alert_preferences').get().enabled,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM live_account_settings WHERE hiring_email_enabled=0').get().n,0,'job alert opt-out does not disable invitation emails');assert.equal(f.errors.length,0);
 }finally{b.close();}
});

test('simple home has large labelled choices and adult-only registration blocks a minor before sending',async()=>{
 const f=await fixture(),b=f.browser();try{
  await tick();assert.match(b.w.document.querySelector('[data-action="find-work"]').textContent,/I need a job/);assert.match(b.w.document.querySelector('[data-action="hire"]').textContent,/I want to hire/);assert.match(b.w.document.querySelector('#account-button').textContent,/Menu/);assert.match(b.w.document.querySelector('#nav').textContent,/Find jobs/);assert.match(b.w.document.querySelector('main').textContent,/3 easy steps/);
  await click(b,'[data-action="edit-profile"]');await click(b,'[data-action="auth-register"]');const input=b.w.document.querySelector('[name="dateOfBirth"]');assert.ok(input.required);assert.ok(b.w.document.querySelector('[name="adultConsent"]').required);assert.ok(input.max);
  fill(b,{name:'Young applicant',email:'minor-ui@example.test',phone:'08012345678',password:'SecureFixturePassword123!',dateOfBirth:'2015-01-01',adultConsent:true,termsConsent:true});await submit(b,'auth-form');assert.match(b.w.document.querySelector('#form-error').textContent,/18 or older/);assert.equal(b.calls.filter(c=>c.path==='/api/auth/register').length,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
  fill(b,{dateOfBirth:'1995-01-01',adultConsent:false});await submit(b,'auth-form');assert.equal(b.calls.filter(c=>c.path==='/api/auth/register').length,0);assert.equal(f.errors.length,0);
 }finally{b.close();}
});

test('month shortcut shows the agreed end date and reviews stay locked even after early completion',async()=>{
 const f=await fixture(),w=f.browser(),e=f.browser();try{
  await tick();await register(w,'monthworker');await createProfile(w,true);await register(e,'monthhirer');await switchRole(e,'employer');await createProfile(e,false);await click(e,'[data-page="openings"]');await click(e,'[data-action="post"]');const future=new Date(Date.now()+86400000).toISOString().slice(0,10);
  fill(e,{type:'One-off task',category:'Plumbing',title:'One month of maintenance',description:'Maintain the plumbing during the agreed month.',min:15000,max:25000,basis:'Monthly',skills:'Pipe fitting',date:future,duration:'One month',accommodation:'Not applicable'});await submit(e,'opening-form');await click(e,'#account-button');await click(e,'[data-page="available"]');await click(e,'[data-action="match-accept"]');fill(e,{date:future,time:'10:00',location:'Jericho meeting place',contactName:'Hirer',phone:'08012345678',notes:'Discuss the month of work.',shareDetails:true});await submit(e,'interview-form');
  w.w.dispatchEvent(new w.w.Event('focus'));await tick();await click(w,'[data-page="notifications"]');await click(w,'[data-action="record"]');await click(w,'[data-op="accept"]');e.w.dispatchEvent(new e.w.Event('focus'));await tick();await click(e,'[data-action="terms"]');
  fill(e,{pay:20000,scope:'One month of plumbing maintenance.',schedule:'Weekdays, 9am to 5pm',start:future});await click(e,'[data-action="job-length"][data-length="month"]');const end=e.w.document.querySelector('[name="completionDate"]').value;assert.equal(end,e.w.LocHire.jobEndDate(future,'month'));assert.ok(end>future);assert.equal(e.w.document.querySelector('[name="completionDate"]').required,true);await submit(e,'terms-form');await click(e,'[data-op="confirm"]');await click(e,'[data-action="eng-final"]');
  w.w.dispatchEvent(new w.w.Event('focus'));await tick();await click(w,'[data-op="confirm"]');await click(w,'[data-action="eng-final"]');await click(w,'[data-op="complete"]');await click(w,'[data-action="eng-final"]');e.w.dispatchEvent(new e.w.Event('focus'));await tick();await click(e,'[data-op="complete"]');await click(e,'[data-action="eng-final"]');assert.equal(e.w.document.querySelector('[data-action="review"]'),null);assert.match(e.w.document.querySelector('.review-lock').textContent,/after the job end date/);assert.match(e.w.document.querySelector('.review-lock').textContent,/You can review from/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM live_reviews').get().n,0);
  assert.equal(e.w.LocHire.jobEndDate('2027-01-31','month'),'2027-02-28');assert.equal(e.w.LocHire.jobEndDate('2028-01-31','month'),'2028-02-29');assert.equal(f.errors.length,0);
 }finally{w.close();e.close();}
});
