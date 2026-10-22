'use strict';

// Same-origin gateway: private service credentials never reach the browser.
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
  const base=process.env.PAYMENT_BACKEND_URL;
  const service=process.env.PAYMENT_SERVICE_SECRET;
  const bypass=process.env.PAYMENT_BACKEND_ACCESS_TOKEN;
  if(!base||!service||!bypass)return res.status(503).json({error:'The payment backend is being configured. Please try again shortly.'});
  try {
    const url=new URL(req.url,'https://lochire.vercel.app');
    // Plain Vercel Functions need an explicit rewrite for nested API paths.
    // Named rewrite parameters may be supplied in req.query or req.url.
    if(url.pathname==='/api/gateway') {
      const captured=req.query?.path??url.searchParams.get('path');
      const path=Array.isArray(captured)?captured.join('/'):captured;
      if(typeof path!=='string'||!/^[-A-Za-z0-9_]+(?:\/[-A-Za-z0-9_]+)*$/.test(path))return res.status(400).json({error:'Invalid API route.'});
      url.pathname='/api/'+path;
    }
    url.searchParams.delete('path');
    if(!url.pathname.startsWith('/api/')||url.pathname.includes('..'))return res.status(400).json({error:'Invalid API route.'});
    // Backend-only test transport. The saved secret is sent only to Kora.
    // Browsers cannot choose an API URL, override a key, or call this operation.
    if(url.pathname==='/api/internal/kora'){
      const {timingSafeEqual}=require('node:crypto'),supplied=req.headers['x-lochire-provider-key'];
      if(req.method!=='POST'||typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(service)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(service)))return res.status(403).json({error:'Private service access required.'});
      const key=process.env.KORAPAY_TEST_SECRET_KEY;
      if(typeof key!=='string'||!key.startsWith('sk_test_'))return res.status(503).json({error:'Kora test credentials are not configured.'});
      let raw=req.body;
      if(raw===undefined){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>16000)return res.status(413).json({error:'Request too large.'});chunks.push(Buffer.from(chunk));}raw=Buffer.concat(chunks).toString('utf8');}
      let input;try{input=typeof raw==='string'?JSON.parse(raw):raw;}catch{return res.status(400).json({error:'Invalid request.'});}
      if(!input||Buffer.byteLength(JSON.stringify(input))>16000)return res.status(400).json({error:'Invalid request.'});
      let path,body;
      if(input.operation==='connection')path='/misc/banks?countryCode=NG';
      else if(input.operation==='verify'&&/^LHPR-[a-f0-9]{32}$/.test(input.reference||''))path='/charges/'+input.reference;
      else if(input.operation==='refund'&&/^[-A-Za-z0-9_]{1,50}$/.test(input.reference||''))path='/refunds/'+input.reference;
      else if(input.operation==='initialize'){
        const p=input.payload;
        if(!p||!/^LHPR-[a-f0-9]{32}$/.test(p.reference||'')||![900,1200].includes(p.amount)||p.currency!=='NGN'||p.merchant_bears_cost!==true||!p.customer?.email)return res.status(400).json({error:'Invalid premium purchase.'});
        const appOrigin=process.env.APP_ORIGIN||'https://lochire.ng';
        if(p.notification_url!==new URL('/api/webhooks/korapay',appOrigin).href||p.redirect_url!==new URL('/?premium_reference='+p.reference+'#premium',appOrigin).href)return res.status(400).json({error:'Invalid callback destination.'});
        path='/charges/initialize';body=JSON.stringify(p);
      }else return res.status(400).json({error:'Unsupported premium operation.'});
      const result=await fetch('https://api.korapay.com/merchant/api/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(15000)});
      const data=await result.json().catch(()=>null);
      if(!result.ok||data?.status!==true)return res.status([401,403,404,422,429].includes(result.status)?result.status:503).json({status:false,error:'Kora could not confirm this operation.'});
      return res.status(200).json(data);
    }
    const origin=process.env.APP_ORIGIN||'https://lochire.vercel.app',allowedOrigins=new Set([origin,...String(process.env.ALLOWED_APP_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean)]);
    if(url.pathname.startsWith('/api/webhooks/wema/'))return res.status(410).json({error:'This payment integration has been retired.'});
    const paystackWebhook=url.pathname==='/api/webhooks/paystack';
    const koraWebhook=url.pathname==='/api/webhooks/korapay';
    const webhook=paystackWebhook||koraWebhook||url.pathname.startsWith('/api/webhooks/wema/');
    if(req.method==='POST'&&!webhook&&!allowedOrigins.has(req.headers.origin))return res.status(403).json({error:'This request must come from LocHire.'});
    const headers={'Accept':'application/json','Content-Type':'application/json','x-lochire-service-key':service,'OAI-Sites-Authorization':'Bearer '+bypass};
    for(const name of ['idempotency-key','x-wema-callback-token','x-paystack-signature','x-korapay-signature','origin'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
    // Server-only test-key relay to the authenticated private service. Never
    // copy an incoming client key or send it to any other API route.
    const koraTestKey=process.env.KORAPAY_TEST_SECRET_KEY;
    if((koraWebhook||url.pathname.startsWith('/api/payments/premium/')||url.pathname==='/api/hiring/state'||url.pathname==='/api/config')&&typeof koraTestKey==='string'&&koraTestKey.startsWith('sk_test_'))headers['x-lochire-kora-test-key']=koraTestKey;
    // Ignore client-supplied keys. Only the server's saved Paystack key may
    // reach LocHire's authenticated private backend, never the response body.
    const paystackKey=process.env.PAYSTACK_SECRET_KEY;
    const paystackRoute=paystackWebhook||url.pathname.startsWith('/api/payments/premium/')||url.pathname.startsWith('/api/hiring/')||['/api/config','/api/auth/login','/api/auth/register','/api/wallet/role'].includes(url.pathname);
    if(paystackRoute&&typeof paystackKey==='string'&&/^sk_(live|test)_/.test(paystackKey))headers['x-lochire-paystack-key']=paystackKey;
    const sessionCookie=req.headers.cookie?.match(/(?:^|;\s*)(lh_session=[^;]+)/)?.[1];
    if(sessionCookie)headers.cookie=sessionCookie;
    // Vercel sets the forwarded address. Do not trust an arbitrary browser ID.
    headers['x-lochire-client-ip']=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
    let body;
    if(req.method==='POST') {
      if(paystackWebhook||koraWebhook){const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>16000)return res.status(413).json({error:'Request too large.'});chunks.push(Buffer.from(chunk));}body=Buffer.concat(chunks).toString('utf8');}
      else if(typeof req.body==='string')body=req.body;
      else if(req.body&&typeof req.body==='object')body=JSON.stringify(req.body);
      else {const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16000)return res.status(413).json({error:'Request too large.'});chunks.push(chunk);}body=Buffer.concat(chunks).toString('utf8');}
      if(Buffer.byteLength(body)>16000)return res.status(413).json({error:'Request too large.'});
    }
    const endpoint=new URL(base);
    if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(endpoint.hostname))throw Error('Invalid backend origin');
    endpoint.pathname=url.pathname;endpoint.search=url.search;
    const result=await fetch(endpoint,{method:req.method,headers,body,redirect:'error',signal:AbortSignal.timeout(30000)});
    const type=result.headers.get('content-type');
    if(!type?.includes('application/json'))return res.status(503).json({error:'The private payment service is unavailable. Please try again.'});
    res.statusCode=result.status;res.setHeader('Content-Type','application/json; charset=utf-8');
    // The private host also emits platform cookies. Never relay those to app users.
    const cookies=result.headers.getSetCookie?.()||[];
    const cookie=cookies.find(value=>value.startsWith('lh_session='));
    if(cookie)res.setHeader('Set-Cookie',cookie);
    res.end(await result.text());
  } catch {res.status(502).json({error:'The payment service could not be reached. Please try again.'});}
};
