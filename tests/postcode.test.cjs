'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const source=readFileSync(require.resolve('../postcode.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function component(handler) {
  const w=new JSDOM('<form></form>',{url:'https://lochire.vercel.app/',runScripts:'outside-only'}).window;
  w.fetch=handler;w.eval(source);const form=w.document.querySelector('form');form.innerHTML=w.LocHirePostcode.field();return {w,form};
}
const reply=data=>({ok:true,status:200,json:async()=>data});
const selection={postcode:'FC-01-A01-KP-27',status:'address_resolved',environment:'sandbox',address:'<img src=x onerror=alert(1)>',administrative:{state:'FCT',lga:'ABUJA'},token:'signed-fixture-token'};

test('optional postcode works without keys, normalizes manual input, and never calls a disabled lookup',async()=>{
  const calls=[];const {w,form}=component(async url=>{calls.push(url);return reply({ready:false,message:'Not connected. Continue without it.'});});
  try {
    await w.LocHirePostcode.mount(form);assert.equal(w.LocHirePostcode.collect(form),null);
    const input=form.querySelector('[name="postcode"]');input.value='fc 01 a01 kp 27';input.dispatchEvent(new w.Event('input',{bubbles:true}));
    const manual=w.LocHirePostcode.collect(form);assert.equal(manual.postcode,selection.postcode);assert.equal(manual.status,'unconfirmed');assert.equal(manual.address,null);
    assert.equal(form.querySelector('[data-postcode-action="lookup"]').disabled,true);
    form.querySelector('[data-postcode-action="lookup"]').click();await settle();assert.equal(calls.length,1);
    form.querySelector('[data-postcode-action="clear"]').click();assert.equal(w.LocHirePostcode.collect(form),null);
  }finally{w.close();}
});

test('lookup requires consent and explicit location selection; edits clear the previous confirmation',async()=>{
  const posts=[];const {w,form}=component(async(url,request)=>{if(url.endsWith('/config'))return reply({ready:true,message:'Available.'});posts.push(JSON.parse(request.body));return reply(selection);});
  try {
    await w.LocHirePostcode.mount(form);const input=form.querySelector('[name="postcode"]');input.value=selection.postcode;
    form.querySelector('[data-postcode-action="lookup"]').click();await settle();assert.equal(posts.length,0);assert.match(form.textContent,/Approve sending/);
    form.querySelector('[data-postcode-consent]').checked=true;form.querySelector('[data-postcode-action="lookup"]').click();await settle();
    assert.equal(posts.length,1);assert.equal(posts[0].consent,true);assert.equal(w.LocHirePostcode.collect(form).status,'unconfirmed');
    assert.equal(form.querySelector('img'),null);assert.match(form.textContent,/<img src=x/);
    form.querySelector('[data-postcode-action="confirm"]').click();const confirmed=w.LocHirePostcode.collect(form);assert.equal(confirmed.token,selection.token);
    assert.equal(w.LocHirePostcode.summary(confirmed,false).includes(selection.postcode),false);assert.equal(w.LocHirePostcode.summary(confirmed,false).includes('onerror'),false);
    input.value='FC-01-A01-LR-01';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.LocHirePostcode.collect(form).status,'unconfirmed');assert.equal(w.LocHirePostcode.collect(form).token,undefined);
  }finally{w.close();}
});

test('a late lookup response cannot attach the address of a postcode the user changed',async()=>{
  let finish;const {w,form}=component(async url=>url.endsWith('/config')?reply({ready:true,message:'Available.'}):new Promise(resolve=>{finish=()=>resolve(reply(selection));}));
  try {
    await w.LocHirePostcode.mount(form);const input=form.querySelector('[name="postcode"]');input.value=selection.postcode;
    form.querySelector('[data-postcode-consent]').checked=true;form.querySelector('[data-postcode-action="lookup"]').click();await settle();
    input.value='FC-01-A01-LR-01';input.dispatchEvent(new w.Event('input',{bubbles:true}));finish();await settle();
    assert.equal(form.querySelector('[data-postcode-action="confirm"]'),null);assert.equal(w.LocHirePostcode.collect(form).postcode,'FC-01-A01-LR-01');assert.equal(w.LocHirePostcode.collect(form).address,null);
  }finally{w.close();}
});
