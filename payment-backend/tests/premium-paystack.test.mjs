import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {premiumPaystackApi,paystackCheckoutUrl,verifyPaystackPremiumEvent} from '../lib/premium-paystack.mjs';
import {harness} from './paystack-fixture.mjs';

test('Paystack signatures cover the whole exact request body, including the event type',async()=>{
 const env={PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_signature_fixture'},raw='{ "event":"charge.success", "data":{"reference":"fixture"} }';
 const signature=createHmac('sha512',env.PAYSTACK_SECRET_KEY).update(raw).digest('hex'),request=new Request('https://private.test/',{headers:{'x-paystack-signature':signature}});
 assert.equal((await verifyPaystackPremiumEvent(env,request,raw)).event,'charge.success');
 for(const altered of [JSON.stringify(JSON.parse(raw)),raw.replace('charge.success','refund.processed')])await assert.rejects(verifyPaystackPremiumEvent(env,request,altered),e=>e.status===401);
 await assert.rejects(verifyPaystackPremiumEvent({...env,PAYSTACK_SECRET_KEY:'sk_live_other'},request,raw),e=>e.status===401);
});

test('Paystack transport keeps credentials on its API origin and validates hosted checkout destinations',async()=>{
 const original=global.fetch,calls=[],env={PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_transport_fixture'};
 global.fetch=async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://untrusted.example/'}});};
 try{await assert.rejects(premiumPaystackApi(env,'/transaction/verify/LHPR-fixture'),/unexpected redirect/);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.paystack.co/transaction/verify/LHPR-fixture');}
 finally{global.fetch=original;}
 assert.equal(paystackCheckoutUrl('https://checkout.paystack.com/test'),'https://checkout.paystack.com/test');
 for(const url of ['http://checkout.paystack.com/test','https://checkout.paystack.com.evil.test/','https://user:pass@checkout.paystack.com/','https://checkout.paystack.com:8443/','javascript:alert(1)'])assert.throws(()=>paystackCheckoutUrl(url));
});

test('private key relay requires service authentication, explicit enablement and the configured mode',async()=>{
 const h=harness();delete h.env.PAYMENTS_PRODUCT;Object.assign(h.env,{PAYSTACK_MODE:'live',PAYSTACK_PREMIUM_ENABLED:'true'});
 const header={'x-lochire-paystack-key':'sk_live_relay_fixture'};
 assert.equal((await h.call('config',undefined,null,header)).data.payments.ready,false);
 h.env.PAYSTACK_ALLOW_KEY_RELAY='true';
 assert.equal((await h.call('config',undefined,null,{...header,'x-lochire-service-key':'wrong'})).status,403);
 assert.equal((await h.call('config',undefined,null,{'x-lochire-paystack-key':'sk_test_relay_fixture'})).data.payments.ready,false);
 const r=await h.call('config',undefined,null,header);assert.equal(r.data.payments.ready,true);assert.doesNotMatch(JSON.stringify(r.data),/sk_live|relay_fixture/);
 assert.equal(h.env.PAYSTACK_SECRET_KEY,undefined,'request key never persists into shared runtime state');
});
