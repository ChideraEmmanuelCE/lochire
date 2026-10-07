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
