// Public UI helpers. No sample accounts, example listings or local hiring store.
window.LocHire = Object.freeze({
  adultBirthCutoff:()=>{const d=new Date(Date.now()+3600000),y=d.getUTCFullYear()-18,m=d.getUTCMonth(),day=Math.min(d.getUTCDate(),new Date(Date.UTC(y,m+1,0)).getUTCDate());return y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');},
  isAdult:birth=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(birth||''))return false;const d=new Date(birth+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==birth)return false;const now=new Date(Date.now()+3600000);let age=now.getUTCFullYear()-d.getUTCFullYear();if(now.getUTCMonth()<d.getUTCMonth()||now.getUTCMonth()===d.getUTCMonth()&&now.getUTCDate()<d.getUTCDate())age--;return age>=18&&d.getUTCFullYear()>=1900;},
  friendlyDate:value=>{const d=new Date(value.length===10?value+'T12:00:00Z':value);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-NG',{timeZone:'Africa/Lagos',day:'numeric',month:'short',year:'numeric'}):value;},
  jobEndDate:(start,length)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(start||''))return null;const d=new Date(start+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==start)return null;if(length==='month'){const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}else if(length==='week')d.setUTCDate(d.getUTCDate()+6);else if(length!=='day')return null;return d.toISOString().slice(0,10);},
  categories:['Domestic help','Cooking','Driving','Cleaning','Plumbing','Electrical work','Painting','Carpentry','Appliance repairs','Gate attendant','Shop assistant'],
  days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  bases:['Hourly','Daily','Monthly','Per task'],
  list:value=>Array.isArray(value)?value:String(value||'').split(',').map(v=>v.trim()).filter(Boolean),
  norm:value=>String(value||'').trim().toLowerCase(),
  today:()=>new Date(Date.now()+3600000).toISOString().slice(0,10),
});
