'use strict';
window.LocHirePostcode = (() => {
  const safe = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let configRequest;
  const normalize = value => {
    const compact=String(value||'').toUpperCase().replace(/[\s-]/g,'');
    if(!/^[A-Z]{2}(?:0[1-9]|[1-9]\d)[A-Z]\d{2}[A-Z]{2}(?:0[1-9]|[1-9]\d)$/.test(compact))throw Error('Enter a five-part postcode such as FC-01-A01-KP-27, or clear it to continue without one.');
    return `${compact.slice(0,2)}-${compact.slice(2,4)}-${compact.slice(4,7)}-${compact.slice(7,9)}-${compact.slice(9)}`;
  };
  async function request(path,body) {
    const response=await fetch('/api/postcode/'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{Accept:'application/json'},body:body?JSON.stringify(body):undefined});
    let data;try{data=await response.json();}catch{throw Error('Postcode lookup is unavailable. You can continue without it.');}
    if(!response.ok){const error=Error(response.status===401?'Sign in to your LocHire wallet before checking a postcode. You can still save it as unconfirmed.':data.error||'Postcode lookup is unavailable.');error.status=response.status;throw error;}
    return data;
  }
  const getConfig=()=>configRequest||(configRequest=request('config').catch(()=>({ready:false,message:'Postcode lookup is unavailable. Continue with your city and general area.'})));
  const label=selection=>selection?.status==='unconfirmed'?'Postcode supplied · Not checked':selection?.environment==='sandbox'?'NIPOST sandbox location · Demo data':selection?.status==='address_resolved'?'Address resolved by NIPOST':'Postcode validity confirmed · Address not returned';
  function field(selection) {
    return `<section class="postcode-picker" data-postcode-field data-selection="${safe(JSON.stringify(selection||null))}"><h3>A clearer job location.</h3><p class="caption">Optional. The full postcode and returned address stay out of public listings. Accepted participants can see them.</p><div class="field"><label for="job-postcode">Job postcode</label><input id="job-postcode" name="postcode" value="${safe(selection?.postcode||'')}" maxlength="30" placeholder="e.g. FC-01-A01-KP-27" autocomplete="off" spellcheck="false"></div><label class="check-field"><input type="checkbox" data-postcode-consent><span>I agree to send this postcode to NIPOST to check the job location.</span></label><div class="row-actions"><button class="button secondary" type="button" data-postcode-action="lookup" disabled>Check postcode</button><button class="text-button" type="button" data-postcode-action="clear">Clear postcode</button></div><p class="postcode-status caption" role="status">Checking whether postcode lookup is available…</p><div class="postcode-preview"></div></section>`;
  }
  function selected(node) {try{return JSON.parse(node.dataset.selection||'null');}catch{return null;}}
  function markup(selection) {
    if(!selection)return '';
    const admin=selection.administrative;
    return `<div class="postcode-result"><strong>${safe(selection.postcode)}</strong><span class="caption">${safe(label(selection))}</span>${admin?`<p>${[admin.locality,admin.lga,admin.state].filter(Boolean).map(safe).join(' · ')}</p>`:''}${selection.address?`<p>${safe(selection.address)}</p>`:''}<p class="caption">Confirm this is the intended job location. A postcode does not verify anyone’s identity or reliability.</p></div>`;
  }
  async function mount(form) {
    const node=form?.querySelector('[data-postcode-field]');if(!node)return;
    const config=await getConfig();if(!node.isConnected)return;
    node.querySelector('[data-postcode-action="lookup"]').disabled=!config.ready;
    node.querySelector('.postcode-status').textContent=config.message;
    node.querySelector('.postcode-preview').innerHTML=markup(selected(node));
  }
  function collect(form) {
    const node=form?.querySelector('[data-postcode-field]');if(!node)return undefined;
    const value=node.querySelector('[name="postcode"]').value.trim();if(!value)return null;
    const postcode=normalize(value), selection=selected(node);
    return selection?.postcode===postcode?selection:{postcode,status:'unconfirmed',environment:'not_checked',administrative:null,address:null,checkedAt:null};
  }
  function payload(selection) {return selection?{postcode:selection.postcode,...(selection.token?{postcodeToken:selection.token}:{})}:{};}
  function summary(selection,canSeeExact=false) {
    if(!selection)return '';
    if(!canSeeExact||selection.privateUntilAccepted)return `<div class="postcode-summary"><strong>Job location reference</strong><p>${safe(label(selection))}. Exact postcode and address are available after worker acceptance.</p></div>`;
    return markup(selection);
  }
  document.addEventListener('input',event=>{
    if(event.target.name!=='postcode')return;
    const node=event.target.closest('[data-postcode-field]');if(!node)return;
    node.dataset.selection='null';delete node.dataset.pending;
    node.querySelector('.postcode-preview').innerHTML='';
    node.querySelector('.postcode-status').textContent='This postcode has not been checked. Check and confirm it, or continue with it as unconfirmed.';
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-postcode-action]');if(!button||button.disabled)return;
    const node=button.closest('[data-postcode-field]'),input=node.querySelector('[name="postcode"]'),status=node.querySelector('.postcode-status');
    const action=button.dataset.postcodeAction;
    try {
      if(action==='clear'){input.value='';node.dataset.selection='null';delete node.dataset.pending;node.querySelector('.postcode-preview').innerHTML='';status.textContent='No postcode attached. Continue with the general location.';return;}
      if(action==='confirm'){
        const selection=JSON.parse(node.dataset.pending||'null');
        if(!selection||selection.postcode!==normalize(input.value))throw Error('Check the current postcode again.');
        node.dataset.selection=JSON.stringify(selection);delete node.dataset.pending;
        input.value=selection.postcode;node.querySelector('.postcode-preview').innerHTML=markup(selection);status.textContent='Location selected. '+label(selection)+'.';return;
      }
      if(!node.querySelector('[data-postcode-consent]').checked)throw Error('Approve sending this postcode to NIPOST before checking it.');
      const postcode=normalize(input.value);
      button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='Checking this postcode with NIPOST…';
      const selection=await request('lookup',{code:postcode,consent:true});
      if(!node.isConnected||normalize(input.value)!==postcode)return;
      node.dataset.pending=JSON.stringify(selection);
      node.querySelector('.postcode-preview').innerHTML=markup(selection)+'<button type="button" class="button secondary" data-postcode-action="confirm">Use this job location</button>';
      status.textContent='Review the returned location, then select “Use this job location”.';
    }catch(error){if(node.isConnected)status.textContent=error.message;}
    finally{if(action==='lookup'&&button.isConnected){button.disabled=!(await getConfig()).ready;button.removeAttribute('aria-busy');}}
  });
  return {field,mount,collect,payload,summary,normalize};
})();
