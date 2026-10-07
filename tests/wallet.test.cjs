'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const source = readFileSync(require.resolve('../wallet.js'), 'utf8');
const config = { mode: 'sandbox', wema: { ready: false, environment: 'not_configured' } };
const summary = () => ({
  user: { id: 'LH-demo-worker', name: '<Worker>', role: 'both' },
  wallet: { available: 0, held: 0, currency: 'TEST-NGN', bankStatus: 'not_connected' },
  trust: { completedJobs: 0, reviews: 0, rating: null, positivePercent: null },
  transactions: [], jobs: [], bankPayments: [], reviews: []
});
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const settle = () => new Promise(resolve => setImmediate(resolve));
function component(fetch) {
  const dom = new JSDOM('<main></main><dialog><div id="dialog-content"></div></dialog>', { url: 'https://lochire.vercel.app/#wallet', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = fetch;
  w.setInterval = (callback, ms) => { w.syncWallet = callback; w.syncInterval = ms; return 1; };
  w.clearInterval = () => { w.syncStopped = true; };
  w.toast = () => {};
  w.modal = (_title, description, body) => {
    w.document.querySelector('#dialog-content').innerHTML = '<p id="dialog-description"></p>' + body;
    w.document.querySelector('#dialog-description').textContent = description;
  };
  w.document.querySelector('dialog').close = () => {};
  w.eval(source);
  return w;
}

test('wallet entry distinguishes a signed-out account from a backend outage', async () => {
  const w = component(async url => url.endsWith('/config') ? response(config) : response({ error: 'Sign in first.' }, 401));
  try {
    await w.LocHireWallet.render(w.document.querySelector('main'));
    assert.ok(w.document.querySelector('#wallet-auth'));
    assert.equal(w.document.querySelector('[name="nin"]'), null);
    assert.match(w.document.querySelector('main').textContent, /No real bank account is created/);
    w.fetch = async url => url.endsWith('/config') ? response(config) : response({ error: 'Storage unavailable.' }, 503);
    await w.LocHireWallet.render(w.document.querySelector('main'));
    assert.equal(w.document.querySelector('#wallet-auth'), null);
    assert.match(w.document.querySelector('[role="alert"]').textContent, /Storage unavailable/);
  } finally { w.close(); }
});

test('uncertain funding retries reuse the same request key and send whole kobo', async () => {
  const posts = [];
  const w = component(async (url, request) => {
    if (url.endsWith('/config')) return response(config);
    if (url.endsWith('/wallet')) return response(summary());
    if (url.endsWith('/sandbox/fund')) {
      posts.push(request);
      return posts.length === 1 ? response({ error: 'Connection interrupted. Retry.' }, 502) : response({ ...summary(), wallet: { ...summary().wallet, available: 5000000 } });
    }
    throw Error('Unexpected request ' + url);
  });
  try {
    await w.LocHireWallet.render(w.document.querySelector('main'));
    w.document.querySelector('[data-wallet-action="deposit"]').click(); await settle();
    w.document.querySelector('[data-wallet-action="fund"]').click(); await settle();
    let form = w.document.querySelector('#wallet-fund');
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle();
    assert.match(form.querySelector('[role="alert"]').textContent, /Retry/);
    assert.equal(form.querySelector('[type="submit"]').disabled, false);
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle();
    assert.equal(posts.length, 2);
    assert.equal(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
    assert.equal(JSON.parse(posts[0].body).amount, 5000000);
    assert.match(w.document.querySelector('.wallet-balance').textContent, /50,000/);
    assert.equal(w.localStorage.length, 0);
  } finally { w.close(); }
});

test('bank-confirmed completion records work without describing a second test payment', async () => {
  const account = summary();
  account.wallet.bankStatus = 'active';
  account.wallet.bankEnvironment = 'production';
  account.wallet.accountNumber = '0000000000';
  account.wallet.accountName = 'Fixture worker';
  account.jobs = [{ id: 'JOB-bank-fixture', employer_id: 'LH-other-employer', worker_id: account.user.id, employer_name: 'Fixture employer', worker_name: account.user.name, title: 'Bank-paid work', scope: 'Fixture completed work', amount: 2000000, category: 'Test fixture', rail: 'wema', status: 'bank_paid', worker_done: 0, employer_done: 0 }];
  const w = component(async url => url.endsWith('/config') ? response({ ...config, wema: { ready: true, environment: 'production' } }) : response(account));
  try {
    await w.LocHireWallet.render(w.document.querySelector('main'));
    assert.equal(w.document.querySelector('[data-wallet-action="wema-setup"]').disabled, true);
    assert.ok(w.document.querySelector('[data-wallet-action="statement-sync"]'));
    assert.equal(w.document.querySelector('script'), null);
    assert.match(w.document.querySelector('.wallet-heading').textContent, /<Worker>/);
    w.document.querySelector('[data-wallet-action="jobs-tab"]').click(); await settle();
    w.document.querySelector('[data-wallet-action="job-complete"]').click(); await settle();
    assert.match(w.document.querySelector('dialog').textContent, /Wema bank payment/);
    assert.match(w.document.querySelector('#dialog-description').textContent, /does not request another transfer/);
    // The completion form posts only the job action, never a bank debit.
    assert.equal(w.document.querySelector('#wallet-job-action').dataset.action, 'complete');
    assert.equal(w.document.querySelector('#wallet-bank-pay'), null);
  } finally { w.close(); }
});

test('deposit chooser explains Wema without displaying invented account numbers or accepting transfers before connection',async()=>{
 const w=component(async url=>url.endsWith('/config')?response(config):response(summary()));
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));
  w.document.querySelector('[data-wallet-action="deposit"]').click();await settle();
  assert.match(w.document.querySelector('dialog').textContent,/Bank transfer to Wema/);assert.ok(w.document.querySelector('dialog [data-wallet-action="fund"]'));
  w.document.querySelector('dialog [data-wallet-action="wema-deposit"]').click();await settle();
  assert.equal(w.document.querySelector('#wallet-deposit-check button[type="submit"]').disabled,true);
  assert.match(w.document.querySelector('dialog').textContent,/not connected yet/);assert.equal(w.document.querySelector('dialog .wallet-account-details'),null);
 }finally{w.close();}
});

test('Wema deposit checks send only a reference and pending checks do not display a successful amount',async()=>{
 const a=summary();Object.assign(a.wallet,{bankStatus:'active',bankEnvironment:'sandbox',accountNumber:'0000000001',accountName:'Fictional fixture'});const calls=[];
 const c={...config,wema:{ready:true,environment:'sandbox',deposits:{ready:true}}};
 const w=component(async(url,req)=>{
  if(url.endsWith('/config'))return response(c);if(url.endsWith('/wallet'))return response(a);
  if(url.endsWith('/wema/deposits/check')){calls.push(JSON.parse(req.body));return response({...a,status:'pending',message:'Awaiting confirmation',bankDeposits:[{reference:'BANK-fixture-01',status:'pending',amount:null,environment:'sandbox',created_at:'2026-10-07T00:00:00Z'}]});}throw Error('Unexpected '+url);
 });
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));
  assert.match(w.document.querySelector('.wallet-bank-balance').textContent,/Not checked/);
  w.document.querySelector('[data-wallet-action="wema-deposit"]').click();await settle();assert.match(w.document.querySelector('#dialog-description').textContent,/Do not send real money/);
  w.document.querySelector('#wallet-reference').value='BANK-fixture-01';w.document.querySelector('#wallet-deposit-check').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.deepEqual(calls,[{reference:'BANK-fixture-01'}]);assert.match(w.document.querySelector('.wallet-deposit-record').textContent,/Awaiting confirmation/);assert.equal(w.document.querySelector('.wallet-deposit-record [data-wallet-action="receipt"]'),null);
 }finally{w.close();}
});

test('test deposit validation rejects fractional kobo and changed amounts use a new retry key',async()=>{
 const posts=[],w=component(async(url,req)=>{if(url.endsWith('/config'))return response(config);if(url.endsWith('/wallet'))return response(summary());posts.push(req);return response({error:'Temporary error'},502);});
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));w.document.querySelector('[data-wallet-action="deposit"]').click();await settle();w.document.querySelector('[data-wallet-action="fund"]').click();await settle();
  const f=w.document.querySelector('#wallet-fund'),input=f.querySelector('[name="amount"]');input.value='1.001';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(posts.length,0);
  input.value='1.01';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();input.value='2.02';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(posts.length,2);assert.notEqual(posts[0].headers['Idempotency-Key'],posts[1].headers['Idempotency-Key']);assert.equal(JSON.parse(posts[1].body).amount,202);
 }finally{w.close();}
});

test('simulated Wema setup never collects a real NIN or describes an actual bank OTP',async()=>{
 const a=summary(),c={...config,wema:{ready:true,simulated:true,environment:'demo',deposits:{ready:true,simulated:true}}};let request;
 const w=component(async(url,req)=>{if(url.endsWith('/config'))return response(c);if(url.endsWith('/wallet'))return response(a);if(url.endsWith('/onboarding/request')){request=JSON.parse(req.body);a.wallet.bankStatus='otp_required';a.wallet.bankEnvironment='demo';return response({status:'otp_required',message:'Demo only'});}throw Error(url);});
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));w.document.querySelector('[data-wallet-action="wema-setup"]').click();await settle();assert.equal(w.document.querySelector('[name="nin"]'),null);assert.match(w.document.querySelector('dialog').textContent,/not Wema bank verification/);
  const form=w.document.querySelector('#wallet-wema-request');form.querySelector('[name="consent"]').checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();await settle();assert.equal(request.nin,undefined);assert.equal(request.consent,true);assert.equal(w.document.querySelector('[name="otp"]').value,'123456');assert.match(w.document.querySelector('#dialog-description').textContent,/No SMS was sent/);
 }finally{w.close();}
});

test('demo deposits offer simulated outcomes and send whole kobo with safe retry keys',async()=>{
 const a=summary();Object.assign(a.wallet,{bankStatus:'active',bankEnvironment:'demo',accountNumber:'DEMO-FIXTURE',accountName:'Fixture · Demo'});a.bankBalance={available:0,held:0,environment:'demo',account:'DEMO-FIXTURE',checkedAt:'2026-10-07T00:00:00Z'};const c={...config,wema:{ready:true,simulated:true,environment:'demo',deposits:{ready:true,simulated:true}}},calls=[];
 const w=component(async(url,req)=>{if(url.endsWith('/config'))return response(c);if(url.endsWith('/wallet'))return response(a);calls.push(req);return response({error:'Temporary demo failure'},502);});
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));w.document.querySelector('[data-wallet-action="wema-deposit"]').click();await settle();assert.match(w.document.querySelector('dialog').textContent,/cannot receive bank transfers/);assert.equal(w.document.querySelector('#wallet-deposit-check'),null);
  const form=w.document.querySelector('#wallet-demo-deposit');form.querySelector('[name="amount"]').value='500';form.querySelector('[name="scenario"]').value='pending';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.deepEqual(JSON.parse(calls[0].body),{amount:50000,scenario:'pending'});
 }finally{w.close();}
});


test('background updates refresh received funds, held funds and records without closing forms',async()=>{
 const a=summary();Object.assign(a.wallet,{bankStatus:'active',bankEnvironment:'demo',accountNumber:'DEMO-FIXTURE',accountName:'Fixture'});a.bankBalance={available:0,held:0,environment:'demo',account:'DEMO-FIXTURE',checkedAt:'2026-10-07T00:00:00Z'};
 let latest=a,fail=false;const w=component(async url=>url.endsWith('/config')?response({...config,wema:{ready:true,simulated:true,environment:'demo',deposits:{ready:true}}}):fail?response({error:'Unavailable'},503):response(latest));
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));assert.equal(w.syncInterval,30000);
  w.document.querySelector('[data-wallet-action="wema-deposit"]').click();await settle();const form=w.document.querySelector('#wallet-demo-deposit');form.querySelector('[name="amount"]').value='123';
  latest={...a,wallet:{...a.wallet,available:75000,held:10000},bankBalance:{...a.bankBalance,available:2000000,held:500000},transactions:[{id:'received',reference:'DEMO-RECEIVED',kind:'bank_received',amount:2000000,status:'successful',description:'Simulated payment',mode:'wema_demo',created_at:'2026-10-07T00:00:00Z'}]};
  await w.syncWallet();assert.match(w.document.querySelector('.wallet-balance').textContent,/750.00/);assert.match(w.document.querySelector('.wallet-held').textContent,/100.00/);assert.match(w.document.querySelector('.wallet-bank-balance').textContent,/20,000.00/);assert.match(w.document.querySelector('.wallet-bank-balance').textContent,/5,000.00/);assert.match(w.document.querySelector('#wallet-activity-content').textContent,/Simulated payment/);assert.equal(w.document.querySelector('#wallet-demo-deposit'),form);assert.equal(form.querySelector('[name="amount"]').value,'123');
  fail=true;await w.syncWallet();assert.match(w.document.querySelector('#wallet-sync-status').textContent,/Updates paused/);assert.match(w.document.querySelector('.wallet-bank-balance').textContent,/20,000.00/);
  fail=false;await w.syncWallet();assert.match(w.document.querySelector('#wallet-sync-status').textContent,/automatically/);
  w.location.hash='#home';await settle();assert.equal(w.syncStopped,true);
 }finally{w.close();}
});

test('an earlier background response cannot replace a newer deposit balance',async()=>{
 let reads=0,resolveOld;const w=component(async(url)=>{
  if(url.endsWith('/config'))return response(config);
  if(url.endsWith('/wallet')){if(++reads===1)return response(summary());return new Promise(resolve=>{resolveOld=resolve;});}
  if(url.endsWith('/sandbox/fund'))return response({...summary(),wallet:{...summary().wallet,available:5000000}});
  throw Error(url);
 });
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));const oldRefresh=w.syncWallet();await settle();
  w.document.querySelector('[data-wallet-action="deposit"]').click();await settle();w.document.querySelector('[data-wallet-action="fund"]').click();await settle();w.document.querySelector('#wallet-fund').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.match(w.document.querySelector('.wallet-balance').textContent,/50,000.00/);resolveOld(response(summary()));await oldRefresh;assert.match(w.document.querySelector('.wallet-balance').textContent,/50,000.00/);
 }finally{w.close();}
});

test('worker wallet hides deposits, enables them after hiring selection, and keeps earnings',async()=>{
 let a=summary();a.user.role='worker';a.wallet.activeRole='worker';a.wallet.available=2000000;let switches=0;
 const w=component(async(url,req)=>{if(url.endsWith('/config'))return response(config);if(url.endsWith('/wallet/role')){switches++;a={...a,user:{...a.user,role:'both'},wallet:{...a.wallet,activeRole:JSON.parse(req.body).role}};}return response(a);});
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));
  assert.equal(w.document.querySelector('[data-wallet-action="deposit"]'),null);assert.equal(w.document.querySelector('[data-wallet-action="wema-deposit"]'),null);assert.equal(w.document.querySelector('[data-wallet-action="new-job"]'),null);assert.ok(w.document.querySelector('[data-wallet-action="withdraw"]'));assert.match(w.document.querySelector('.wallet-mode').textContent,/do not need to deposit/);
  w.document.querySelector('[data-wallet-action="employer-mode"]').click();await settle();assert.equal(switches,1);assert.ok(w.document.querySelector('[data-wallet-action="deposit"]'));assert.ok(w.document.querySelector('[data-wallet-action="wema-deposit"]'));assert.ok(w.document.querySelector('[data-wallet-action="new-job"]'));assert.equal(w.document.querySelector('[data-wallet-action="withdraw"]'),null);assert.match(w.document.querySelector('.wallet-balance').textContent,/20,000.00/);
  w.document.querySelector('[data-wallet-action="worker-mode"]').click();await settle();assert.equal(w.document.querySelector('[data-wallet-action="deposit"]'),null);assert.match(w.document.querySelector('.wallet-balance').textContent,/20,000.00/);
 }finally{w.close();}
});

test('worker demo withdrawal preserves retry keys and updates the correct balance',async()=>{
 const a=summary();Object.assign(a.wallet,{activeRole:'worker',bankStatus:'active',bankEnvironment:'demo',accountNumber:'DEMO-FIXTURE',accountName:'Fixture'});a.bankBalance={available:2000000,held:0,environment:'demo',account:'DEMO-FIXTURE',checkedAt:'2026-10-07T00:00:00Z'};const calls=[];
 const w=component(async(url,req)=>{if(url.endsWith('/config'))return response({...config,wema:{ready:true,simulated:true,environment:'demo',deposits:{ready:true}}});if(url.endsWith('/wallet'))return response(a);calls.push(req);return calls.length===1?response({error:'Temporary failure'},502):response({...a,bankBalance:{...a.bankBalance,available:1500000},message:'Simulated withdrawal completed'});});
 try{
  await w.LocHireWallet.render(w.document.querySelector('main'));w.document.querySelector('[data-wallet-action="withdraw"][data-rail="wema"]').click();await settle();assert.match(w.document.querySelector('dialog').textContent,/No real money is sent/);assert.equal(w.document.querySelector('[name="accountNumber"]'),null);
  const form=w.document.querySelector('#wallet-withdraw');form.querySelector('[name="amount"]').value='5000';form.querySelector('[name="destination"]').value='My demo bank';form.querySelector('[name="password"]').value='FixturePassword123';form.querySelector('[name="consent"]').checked=true;
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(JSON.parse(calls[1].body).amount,500000);assert.match(w.document.querySelector('.wallet-bank-balance').textContent,/15,000.00/);assert.match(w.document.querySelector('.wallet-balance h2').textContent,/0.00/);
 }finally{w.close();}
});
