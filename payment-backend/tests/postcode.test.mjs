import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostcode, postcodeReadiness, lookupPostcode, jobLocation } from '../lib/postcode.mjs';
const env={POSTCODE_ENABLED:'true',POSTCODE_ENVIRONMENT:'sandbox',POSTCODE_API_KEY:'nipost_test_fixture',SERVICE_SECRET:'private-test-signing-key'};
const data={postcode:'FC-01-A01-KP-27',valid:true,administrative_address:{state_name:'FCT',lga_name:'ABUJA MUNICIPAL',locality_name:'ABUJA'},recent_house_address:{recent:'Public building – Abuja'},building_use_status:'public'};

test('postcode normalization accepts documented separators without inventing validity',()=>{
  for(const input of ['FC-01-A01-KP-27','fc 01 a01 kp 27','FC01A01KP27'])assert.equal(normalizePostcode(input),'FC-01-A01-KP-27');
  for(const input of ['FC-00-A01-KP-27','FC-01-A01-KP-00','FC01A01KP270','<script>','FC/01/A01/KP/27'])assert.throws(()=>normalizePostcode(input));
  assert.equal(postcodeReadiness({}).ready,false);
});

test('resolved postcode proofs bind the address, account, code, environment and expiry',async()=>{
  let captured;
  const selection=await lookupPostcode('fc01a01kp27',env,'employer-a',async(url,options)=>{captured={url:String(url),options};return Response.json({data});});
  assert.match(captured.url,/^https:\/\/api.postcode.gov.ng\/v1\/lookup\?code=FC-01-A01-KP-27&level=2$/);
  assert.equal(captured.options.headers['X-API-Key'],env.POSTCODE_API_KEY);
  assert.equal(selection.environment,'sandbox');assert.equal(selection.address,data.recent_house_address.recent);
  assert.equal(JSON.stringify(selection).includes(env.POSTCODE_API_KEY),false);
  const body={postcode:selection.postcode,postcodeToken:selection.token};
  assert.equal((await jobLocation(body,env,'employer-a')).address,selection.address);
  await assert.rejects(jobLocation(body,env,'employer-b'),e=>e.status===400);
  await assert.rejects(jobLocation({...body,postcode:'FC-01-A01-LR-01'},env,'employer-a'),e=>e.status===400);
  await assert.rejects(jobLocation({...body,postcodeToken:selection.token.slice(0,-1)+(selection.token.endsWith('A')?'B':'A')},env,'employer-a'),e=>e.status===400);
  const now=Date.now;try{Date.now=()=>now()+1800001;await assert.rejects(jobLocation(body,env,'employer-a'),e=>e.status===400);}finally{Date.now=now;}
  const manual=await jobLocation({postcode:selection.postcode,address:'Invented private address',status:'address_resolved'},env,'employer-a');
  assert.equal(manual.status,'unconfirmed');assert.equal(manual.address,null);
});

test('postcode provider errors and configuration fail closed without exposing provider secrets',async()=>{
  let calls=0;const unreachable=async()=>{calls++;throw Error('secret upstream debug');};
  await assert.rejects(lookupPostcode(data.postcode,{},'account',unreachable),e=>e.status===503);
  await assert.rejects(lookupPostcode(data.postcode,{...env,POSTCODE_ENVIRONMENT:'production'},'account',unreachable),e=>e.status===503);
  await assert.rejects(lookupPostcode(data.postcode,{...env,POSTCODE_BASE_URL:'https://attacker.example.test'},'account',unreachable),e=>e.status===503);
  assert.equal(calls,0);
  for(const status of [401,402,403,429,500])await assert.rejects(lookupPostcode(data.postcode,env,'account',async()=>Response.json({error:{message:env.POSTCODE_API_KEY}},{status})),e=>!e.message.includes(env.POSTCODE_API_KEY)&&e.status===(status===429?429:503));
  await assert.rejects(lookupPostcode(data.postcode,env,'account',async()=>Response.json({data:{...data,postcode:'FC-01-A01-LR-01'}})),e=>e.status===502);
  await assert.rejects(lookupPostcode(data.postcode,env,'account',async()=>Response.json({data:{...data,valid:false}})),e=>e.status===404);
});
