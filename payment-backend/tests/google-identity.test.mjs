import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleRequest} from '../lib/service.mjs';
import {verifyGoogleIdToken,GoogleIdentityError} from '../lib/google-identity.mjs';

const clientId='lochire-test.apps.googleusercontent.com';
const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');

async function googleFixture(){
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const kid='fixture-'+crypto.randomUUID().replaceAll('-','');
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({keys:[{...publicJwk,alg:'RS256',use:'sig',kid}]},{headers:{'Cache-Control':'public, max-age=300'}});
  };
  async function token(fields={}){
    const now=Math.floor(Date.now()/1000);
    const claims={iss:'https://accounts.google.com',aud:clientId,iat:now,exp:now+1800,sub:'google-user-123',email:'worker@gmail.com',email_verified:true,name:'Google Worker',...fields};
    const header=encode({alg:'RS256',typ:'JWT',kid}),payload=encode(claims),data=header+'.'+payload;
    const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data));
    return data+'.'+Buffer.from(sig).toString('base64url');
  }
  return {token,publicKeys:JSON.stringify([{...publicJwk,kid,alg:'RS256',use:'sig'}]),restore(){globalThis.fetch=original;}};
}

function harness(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  const db={prepare(sql){return {bind(...values){return {
    sql,values,
    first:async()=>sqlite.prepare(sql).get(...values)||null,
    all:async()=>({results:sqlite.prepare(sql).all(...values)}),
    run:async()=>({meta:sqlite.prepare(sql).run(...values)}),
  };}};},async batch(statements){
    sqlite.exec('BEGIN IMMEDIATE');
    try{
      const result=statements.map(s=>({meta:sqlite.prepare(s.sql).run(...s.values)}));
      sqlite.exec('COMMIT');return result;
    }catch(e){sqlite.exec('ROLLBACK');throw e;}
  }};
  const env={DB:db,SERVICE_SECRET:'test-service-key',GOOGLE_CLIENT_ID:clientId,APP_ORIGIN:'https://lochire.ng',APP_MODE:'production',PAYMENTS_PRODUCT:'legacy',PAYMENT_MODE:'live',WEMA_MODE:'live',WEMA_ENVIRONMENT:'production',WEMA_ENABLED:'false'};
  let count=0;
  async function call(path,body,cookie){
    const r=await handleRequest(new Request('https://private.test/api/'+path,{
      method:body===undefined?'GET':'POST',
      headers:{origin:env.APP_ORIGIN,'x-lochire-service-key':env.SERVICE_SECRET,'x-lochire-client-ip':'fixture-'+(++count),...(cookie?{cookie}:{})},
      body:body===undefined?undefined:JSON.stringify(body),
    }),env);
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  return {call,env,sqlite};
}

test('Google-signed ID token is checked for signature, audience, issuer and expiry',async()=>{
  const g=await googleFixture();
  try{
    const valid=await g.token();
    const profile=await verifyGoogleIdToken(valid,clientId);
    assert.deepEqual(profile,{sub:'google-user-123',email:'worker@gmail.com',name:'Google Worker'});
    await assert.rejects(()=>verifyGoogleIdToken(valid,'wrong-client.apps.googleusercontent.com'),GoogleIdentityError);
    const expired=await g.token({exp:1}),unverified=await g.token({email_verified:false});
    await assert.rejects(()=>verifyGoogleIdToken(expired,clientId),GoogleIdentityError);
    await assert.rejects(()=>verifyGoogleIdToken(unverified,clientId),GoogleIdentityError);
    await assert.rejects(()=>verifyGoogleIdToken(valid.slice(0,-3)+'abc',clientId),GoogleIdentityError);
  }finally{g.restore();}
});

test('Google creates an adult, verified account and returns the same user on the next login',async()=>{
  const g=await googleFixture(),h=harness();
  try{
    const credential=await g.token();
    let r=await h.call('config');assert.equal(r.data.googleClientId,clientId);
    r=await h.call('auth/google',{credential});assert.equal(r.status,200);assert.equal(r.data.needsRegistration,true);
    r=await h.call('auth/google',{credential,profile:{name:'Google Worker',dateOfBirth:'2014-01-01',phone:'08012345678',termsConsent:true,adultConsent:true}});
    assert.equal(r.status,400);
    r=await h.call('auth/google',{credential,profile:{name:'Google Worker',dateOfBirth:'1995-05-01',phone:'08012345678',termsConsent:true,adultConsent:true,activeRole:'worker'}});
    assert.equal(r.status,201,JSON.stringify(r.data));
    assert.equal(r.data.user.emailVerified,true);
    assert.equal(r.data.user.googleLinked,true);
    const firstId=r.data.user.id;
    assert.match(r.cookie,/^lh_session=/);
    r=await h.call('auth/google',{credential});
    assert.equal(r.status,200);
    assert.equal(r.data.user.id,firstId);
    assert.equal(r.data.created,false);
    const count=h.sqlite.prepare('SELECT COUNT(*) AS total FROM users').get();
    assert.equal(count.total,1);
  }finally{g.restore();}
});

test('Existing password account requires authenticated, matching-email Google link',async()=>{
  const g=await googleFixture(),h=harness();
  try{
    let r=await h.call('auth/register',{name:'Existing Worker',email:'worker@gmail.com',phone:'08012345678',password:'SecurePassword123!',dateOfBirth:'1995-01-01',adultConsent:true,termsConsent:true,role:'both'});
    assert.equal(r.status,201,JSON.stringify(r.data));
    const cookie=r.cookie,id=r.data.user.id,credential=await g.token();
    r=await h.call('auth/google',{credential});
    assert.equal(r.status,409);
    r=await h.call('auth/google/link',{credential});
    assert.equal(r.status,401);
    r=await h.call('auth/google/link',{credential:await g.token({email:'other@gmail.com'})},cookie);
    assert.equal(r.status,409);
    r=await h.call('auth/google/link',{credential},cookie);
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.user.googleLinked,true);
    r=await h.call('auth/google',{credential});
    assert.equal(r.status,200);
    assert.equal(r.data.user.id,id);
    assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS total FROM users').get().total,1);
  }finally{g.restore();}
});

test('gateway keys verify the signature when Sites cannot fetch Google certificates',async()=>{
  const g=await googleFixture();
  try {
    globalThis.fetch=async()=>{throw Error('unreachable');};
    const token=await g.token();
    assert.equal((await verifyGoogleIdToken(token,clientId,g.publicKeys)).sub,'google-user-123');
    await assert.rejects(()=>verifyGoogleIdToken(token.slice(0,token.lastIndexOf('.')+1)+'AA',clientId,g.publicKeys),GoogleIdentityError);
    await assert.rejects(()=>verifyGoogleIdToken(token,'wrong-audience',g.publicKeys),GoogleIdentityError);
  } finally {g.restore();}
});
