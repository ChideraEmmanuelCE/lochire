import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {passwordHash,handleRequest} from '../lib/service.mjs';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...v){return {first:async()=>sqlite.prepare(sql).get(...v)||null,all:async()=>({results:sqlite.prepare(sql).all(...v)}),run:async()=>sqlite.prepare(sql).run(...v)};}};}};
 const env={DB:db,SERVICE_SECRET:'fixture-secret',APP_ORIGIN:'https://lochire.ng',APP_MODE:'production',ADMIN_EMAILS:'owner@example.test'};
 const add=(id,email,date=new Date().toISOString())=>sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)').run(id,email,id,'08012345678','both','private-password-hash','private-password-salt',date);
 db.batch=async statements=>{sqlite.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}};
 async function call(path,id,body){let cookie='';if(id){const token=Array.from(new TextEncoder().encode(id),n=>n.toString(16).padStart(2,'0')).join('').padEnd(64,'0').slice(0,64);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');sqlite.prepare('INSERT OR REPLACE INTO sessions VALUES (?,?,?)').run(hash,id,Date.now()+86400000);cookie='lh_session='+token;}const r=await handleRequest(new Request('https://service.test/api/'+path,{method:body?'POST':'GET',headers:{'x-lochire-service-key':env.SERVICE_SECRET,cookie,...(body?{'content-type':'application/json','origin':env.APP_ORIGIN}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};}
 const verify=id=>sqlite.prepare('INSERT INTO live_account_settings (user_id,email_verified_at) VALUES (?,?)').run(id,new Date().toISOString());
 return {sqlite,env,add,call,verify};
}
test('dashboard protects all user data behind a verified owner session',async()=>{
 const h=fixture();h.add('owner','owner@example.test');h.add('member','member@example.test');
 for(const id of [null,'member','owner']){const r=await h.call('admin/dashboard',id);assert.equal(r.status,id?403:401);assert.equal('users' in r.data,false);assert.equal('counts' in r.data,false);assert.equal(r.cache,'no-store');}
 h.verify('owner');const r=await h.call('admin/dashboard','owner');assert.equal(r.status,200);assert.equal(r.data.counts.accounts,2);assert.equal(r.data.counts.verified,1);assert.equal(r.data.counts.unverified,1);assert.equal(r.data.signups.length,30);assert.equal(r.data.signups.reduce((n,d)=>n+d.count,0),2);
 const raw=JSON.stringify(r.data);for(const secret of ['password_hash','password_salt','private-password','08012345678','lh_session'])assert.equal(raw.includes(secret),false,secret);
 assert.equal((await h.call('admin/unknown','owner')).status,404);
});
test('signup boundaries use Lagos days; users are paginated and filters are literal',async()=>{
 const h=fixture();const day=new Date(Date.now()+3600000).toISOString().slice(0,10);const old=new Date(Date.parse(day+'T00:00:00Z')-40*86400000).toISOString();h.add('owner','owner@example.test',old);h.verify('owner');
 const boundary=new Date(Date.parse(day+'T00:00:00Z')-30*60000).toISOString();h.add('Lagos midnight','boundary@example.test',boundary);
 for(let i=0;i<28;i++)h.add('Member '+i,'member'+i+'@example.test',old);
 h.add('Literal %','percent@example.test',old);
 const r=await h.call('admin/dashboard','owner');assert.equal(r.data.counts.accounts,31);assert.equal(r.data.counts.today,1);assert.equal(r.data.counts.week,1);assert.equal(r.data.counts.month,1);assert.equal(r.data.signups.at(-1).count,1);assert.equal(r.data.users.length,25);assert.equal(r.data.pagination.pages,2);
 const second=await h.call('admin/dashboard?page=2','owner');assert.equal(second.data.users.length,6);assert.equal(new Set([...r.data.users,...second.data.users].map(u=>u.id)).size,31);
 const verified=await h.call('admin/dashboard?verified=yes','owner');assert.equal(verified.data.pagination.total,1);assert.equal(verified.data.users[0].id,'owner');
 const literal=await h.call('admin/dashboard?q=%25','owner');assert.equal(literal.data.pagination.total,1);assert.equal(literal.data.users[0].name,'Literal %');
 const injection=await h.call("admin/dashboard?q="+encodeURIComponent("' OR 1=1 --"),'owner');assert.equal(injection.data.pagination.total,0);
 assert.equal((await h.call('admin/dashboard?page=99999','owner')).data.pagination.page,2);
 assert.equal((await h.call('admin/dashboard?page=-4','owner')).data.pagination.page,1);
});

test('admin account locks enforce sessions, login, expiry, visibility and reversible audit history',async()=>{
 const h=fixture();h.add('owner','owner@example.test');h.verify('owner');h.add('member','member@example.test');h.add('other','other@example.test');
 const salt='fixture-salt',password='member-password-123';h.sqlite.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(await passwordHash(password,salt),salt,'member');
 h.sqlite.prepare("INSERT INTO live_profiles(id,user_id,role,published,data,revision,updated_at) VALUES('worker-member','member','worker',1,'{}',1,?)").run(new Date().toISOString());
 const change=(action,extra={})=>({userId:'member',action,reason:'Safety complaint under review',...extra});
 assert.equal((await h.call('admin/account-lock','member',change('permanent'))).status,403);
 for(const userId of ['owner','missing'])assert.equal((await h.call('admin/account-lock','owner',change('permanent',{userId}))).status,userId==='owner'?400:404);
 for(const untilAt of ['bad',new Date(Date.now()-1000).toISOString()])assert.equal((await h.call('admin/account-lock','owner',change('temporary',{untilAt}))).status,400);
 assert.equal((await h.call('admin/account-lock','owner',change('permanent',{reason:''}))).status,400);
 const untilAt=new Date(Date.now()+86400000).toISOString();assert.equal((await h.call('admin/account-lock','owner',change('temporary',{untilAt}))).status,200);
 assert.equal((await h.call('hiring/state','member')).status,403);
 assert.equal((await h.call('hiring/profiles/worker','member',{})).status,403);
 const login=await h.call('auth/login',null,{email:'member@example.test',password});assert.equal(login.status,403);assert.match(JSON.stringify(login.data),/Safety complaint/);
 assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM available_live_profiles').get().n,0);
 assert.equal(h.sqlite.prepare('SELECT published FROM live_profiles').get().published,1);
 const dashboard=await h.call('admin/dashboard','owner');assert.equal(dashboard.data.users.find(u=>u.id==='member').lock_kind,'temporary');
 h.sqlite.prepare('UPDATE account_locks SET until_at=? WHERE user_id=?').run(Date.now()-2000,'member');
 assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM available_live_profiles').get().n,1);
 assert.equal((await h.call('auth/login',null,{email:'member@example.test',password})).status,200);
 assert.equal((await h.call('admin/account-lock','owner',change('permanent'))).status,200);
 assert.equal((await h.call('hiring/state','member')).status,403);
 assert.equal((await h.call('admin/account-lock','owner',change('unlocked',{reason:'Review complete'}))).status,200);
 assert.equal((await h.call('auth/login',null,{email:'member@example.test',password})).status,200);
 assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM account_lock_events').get().n,3);
 assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM live_profiles').get().n,1);
});
