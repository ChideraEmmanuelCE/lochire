'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const gateway = require('../api/gateway.js');
const origin = 'https://lochire.vercel.app';
let originalFetch, originalEnv, forwarded;

beforeEach(() => {
  originalFetch = global.fetch;
  originalEnv = { ...process.env };
  process.env.APP_ORIGIN = origin;
  process.env.PAYMENT_BACKEND_URL = 'https://private-service.example.test';
  process.env.PAYMENT_SERVICE_SECRET = 'test-service-secret';
  process.env.PAYMENT_BACKEND_ACCESS_TOKEN = 'test-private-access';
  forwarded = [];
  global.fetch = async (url, options) => {
    forwarded.push({ url: String(url), options });
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', 'private_host_session=never-forward; Path=/; Secure; HttpOnly');
    headers.append('set-cookie', 'lh_session=test; Path=/; HttpOnly; Secure; SameSite=Lax');
    return new Response(JSON.stringify({ ok: true }), { headers });
  };
});
afterEach(() => { global.fetch = originalFetch; process.env = originalEnv; });

async function invoke(input) {
  const response = {
    statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.stringify(value); return this; },
    end(value) { this.body = value; }
  };
  await gateway({ method: 'GET', url: '/api/gateway', headers: {}, ...input }, response);
  return response;
}

test('nested API rewrites preserve auth, job, and receipt routes and private session cookies', async () => {
  for (const path of ['auth/register', 'jobs/JOB-demo/complete', 'receipts/LH-payment-received']) {
    const response = await invoke({ url: '/api/gateway', query: { path }, headers: { cookie: 'lh_session=opaque', 'idempotency-key': 'retry-key-123' } });
    assert.equal(response.statusCode, 200);
    const request = forwarded.at(-1);
    assert.equal(request.url, 'https://private-service.example.test/api/' + path);
    assert.equal(request.options.headers.cookie, 'lh_session=opaque');
    assert.equal(request.options.headers['idempotency-key'], 'retry-key-123');
    assert.equal(request.options.headers['x-lochire-service-key'], 'test-service-secret');
    assert.equal(request.options.headers['OAI-Sites-Authorization'], 'Bearer test-private-access');
    assert.match(response.headers['set-cookie'], /HttpOnly/);
    assert.equal(response.headers['set-cookie'].startsWith('lh_session='), true);
    assert.equal(response.headers['set-cookie'].includes('private_host_session'), false);
    assert.equal(response.body.includes('test-service-secret'), false);
  }
  await invoke({ url: '/api/gateway?path=auth%2Flogin' });
  assert.equal(forwarded.at(-1).url, 'https://private-service.example.test/api/auth/login');
  await invoke({ url: '/api/jobs/JOB-demo/accept', query: { path: 'jobs/JOB-demo/accept' } });
  assert.equal(forwarded.at(-1).url, 'https://private-service.example.test/api/jobs/JOB-demo/accept');
});

test('nested wallet mutations still require the configured app origin', async () => {
  for (const headers of [{}, { origin: 'https://unrelated.example.test' }]) {
    const response = await invoke({ method: 'POST', query: { path: 'auth/register' }, headers, body: {} });
    assert.equal(response.statusCode, 403);
  }
  assert.equal(forwarded.length, 0);
  const response = await invoke({ method: 'POST', query: { path: ['jobs', 'JOB-demo', 'reserve'] }, headers: { origin }, body: {} });
  assert.equal(response.statusCode, 200);
  assert.equal(forwarded[0].url, 'https://private-service.example.test/api/jobs/JOB-demo/reserve');
});

test('host-only cookies cannot replace an app session or pass browser cookies to the private host', async () => {
  global.fetch = async (url, options) => {
    forwarded.push({ url: String(url), options });
    return new Response('{}', { headers: { 'content-type': 'application/json', 'set-cookie': 'private_host_session=never-forward; Path=/; Secure; HttpOnly' } });
  };
  const response = await invoke({ query: { path: 'wallet' }, headers: { cookie: 'unrelated_cookie=private; lh_session=opaque; another_cookie=private' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(forwarded[0].options.headers.cookie, 'lh_session=opaque');
});

test('bank callbacks retain bank authentication through the nested rewrite', async () => {
  const response = await invoke({ method: 'POST', query: { path: 'webhooks/wema/transactions' }, headers: { 'x-wema-callback-token': 'test-bank-callback' }, body: { transactionReference: 'LH-bank-test' } });
  assert.equal(response.statusCode, 200);
  assert.equal(forwarded[0].url, 'https://private-service.example.test/api/webhooks/wema/transactions');
  assert.equal(forwarded[0].options.headers['x-wema-callback-token'], 'test-bank-callback');
  assert.deepEqual(JSON.parse(forwarded[0].options.body), { transactionReference: 'LH-bank-test' });
});

test('malformed rewrites cannot select another origin or traverse backend routes', async () => {
  for (const path of ['../admin', 'https://other.example.test', '/auth/login', 'auth//login', 'auth/login?skip=true', '']) {
    const response = await invoke({ query: { path } });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(forwarded.length, 0);
});
