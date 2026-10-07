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
    if(!url.pathname.startsWith('/api/')||url.pathname.includes('..'))return res.status(400).json({error:'Invalid API route.'});
    const origin=process.env.APP_ORIGIN||'https://lochire.vercel.app';
    const webhook=url.pathname.startsWith('/api/webhooks/wema/');
    if(req.method==='POST'&&!webhook&&req.headers.origin!==origin)return res.status(403).json({error:'This request must come from LocHire.'});
    const headers={'Accept':'application/json','Content-Type':'application/json','x-lochire-service-key':service,'OAI-Sites-Authorization':'Bearer '+bypass};
    for(const name of ['cookie','idempotency-key','x-wema-callback-token','origin'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
    // Vercel sets the forwarded address. Do not trust an arbitrary browser ID.
    headers['x-lochire-client-ip']=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
    let body;
    if(req.method==='POST') {
      if(typeof req.body==='string')body=req.body;
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
    const cookie=result.headers.get('set-cookie');if(cookie)res.setHeader('Set-Cookie',cookie);
    res.end(await result.text());
  } catch {res.status(502).json({error:'The payment service could not be reached. Please try again.'});}
};
