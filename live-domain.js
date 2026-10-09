// Public UI helpers. No sample accounts, example listings or local hiring store.
window.LocHire = Object.freeze({
  categories:['Domestic help','Cooking','Driving','Cleaning','Plumbing','Electrical work','Painting','Carpentry','Appliance repairs','Gate attendant','Shop assistant'],
  days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  bases:['Hourly','Daily','Monthly','Per task'],
  list:value=>Array.isArray(value)?value:String(value||'').split(',').map(v=>v.trim()).filter(Boolean),
  norm:value=>String(value||'').trim().toLowerCase(),
  today:()=>new Date(Date.now()+3600000).toISOString().slice(0,10),
});
