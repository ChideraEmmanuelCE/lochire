// Paystack Starter: collect LocHire's own one-time premium fees only.
import {PaystackError, safeEqual} from './paystack.mjs';
const fail=(status,message)=>{throw new PaystackError(status,message);};
export const paystackMode=env=>env.PAYSTACK_MODE==='test'?'test':'live';
export const paystackConfigured=env=>typeof env.PAYSTACK_SECRET_KEY==='string'&&env.PAYSTACK_SECRET_KEY.startsWith(paystackMode(env)==='live'?'sk_live_':'sk_test_');

// Called only after the private service has authenticated the gateway.
export function paystackRequestEnvironment(env,request){
  if(paystackConfigured(env)||env.PAYSTACK_ALLOW_KEY_RELAY!=='true')return env;
  const key=request.headers.get('x-lochire-paystack-key');
  return key?.startsWith(paystackMode(env)==='live'?'sk_live_':'sk_test_')?{...env,PAYSTACK_SECRET_KEY:key}:env;
}

export async function premiumPaystackApi(env,path,body){
  if(!paystackConfigured(env))fail(503,'Paystack checkout is awaiting secure configuration.');
  let response;
  try{response=await fetch('https://api.paystack.co'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.PAYSTACK_SECRET_KEY,Accept:'application/json','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(15000)});}
  catch{fail(503,'Paystack could not be reached. Check your saved purchase before trying again.');}
  if(response.status>=300&&response.status<400)fail(503,'Paystack returned an unexpected redirect.');
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!==true||!result.data)fail(503,'Paystack could not confirm this request. Check your saved purchase before trying again.');
  return result.data;
}

export function paystackCheckoutUrl(value){
  let url;try{url=new URL(value);}catch{fail(503,'The Paystack checkout could not be validated.');}
  if(url.protocol!=='https:'||url.hostname!=='checkout.paystack.com'||url.username||url.password||url.port)fail(503,'The Paystack checkout could not be validated.');
  return url.href;
}

export async function verifyPaystackPremium(env,row){
  const d=await premiumPaystackApi(env,'/transaction/verify/'+encodeURIComponent(row.reference));
  let metadata=d.metadata;if(typeof metadata==='string')try{metadata=JSON.parse(metadata);}catch{metadata=null;}
  if(d.domain!==row.mode||d.reference!==row.reference||d.currency!=='NGN'||!Number.isSafeInteger(d.amount)||d.amount!==row.amount||metadata?.['lochire-user']!==row.user_id||metadata?.['lochire-tier']!==row.tier)fail(409,'Paystack verification does not match this saved purchase.');
  if(d.fees!=null&&(!Number.isSafeInteger(d.fees)||d.fees<0||d.fees>d.amount))fail(409,'Paystack returned invalid processing fees.');
  // Normalize the provider response for the existing atomic entitlement logic.
  return {reference:d.reference,currency:d.currency,amount:d.amount/100,amount_paid:d.amount/100,status:d.status,customer:d.customer,fee:(d.fees||0)/100};
}

export async function verifyPaystackPremiumEvent(env,request,raw){
  if(!paystackConfigured(env))fail(503,'Paystack webhooks are awaiting secure configuration.');
  const signature=request.headers.get('x-paystack-signature');
  if(!/^[a-f0-9]{128}$/.test(signature||''))fail(401,'Invalid Paystack signature.');
  const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(env.PAYSTACK_SECRET_KEY),{name:'HMAC',hash:'SHA-512'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,encoder.encode(raw));
  const expected=Array.from(new Uint8Array(signed),b=>b.toString(16).padStart(2,'0')).join('');
  if(!safeEqual(signature,expected))fail(401,'Invalid Paystack signature.');
  let event;try{event=JSON.parse(raw);}catch{fail(400,'Invalid Paystack event.');}
  if(!event||typeof event.event!=='string'||!event.data||typeof event.data!=='object')fail(400,'Invalid Paystack event.');
  return event;
}
