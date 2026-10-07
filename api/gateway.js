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
    const origin=process.env.APP_ORIGIN||'https://lochire.vercel.app';
    const webhook=url.pathname.startsWith('/api/webhooks/wema/');
    if(req.method==='POST'&&!webhook&&req.headers.origin!==origin)return res.status(403).json({error:'This request must come from LocHire.'});
    const headers={'Accept':'application/json','Content-Type':'application/json','x-lochire-service-key':service,'OAI-Sites-Authorization':'Bearer '+bypass};
    for(const name of ['idempotency-key','x-wema-callback-token','origin'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
    const sessionCookie=req.headers.cookie?.match(/(?:^|;\s*)(lh_session=[^;]+)/)?.[1];
    if(sessionCookie)headers.cookie=sessionCookie;
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
    // The private host also emits platform cookies. Never relay those to app users.
    const cookies=result.headers.getSetCookie?.()||[];
    const cookie=cookies.find(value=>value.startsWith('lh_session='));
    if(cookie)res.setHeader('Set-Cookie',cookie);
    res.end(await result.text());
  } catch {res.status(502).json({error:'The payment service could not be reached. Please try again.'});}
};
