// Apply appearance before styles load so the first paint matches the device.
(() => {
  const key='lochire-theme';
  const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
  let preference='system';
  try{const saved=localStorage.getItem(key);if(['light','dark','system'].includes(saved))preference=saved;}catch{}
  function apply(){const theme=preference==='system'?(media?.matches?'dark':'light'):preference;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111c18':'#f6f8f5');}
  window.LocHireTheme={get preference(){return preference;},set(value){if(!['light','dark','system'].includes(value))return;preference=value;try{localStorage.setItem(key,value);}catch{}apply();window.dispatchEvent(new Event('lochire-theme-change'));}};
  media?.addEventListener?.('change',()=>{if(preference==='system')apply();});
  window.addEventListener('storage',e=>{if(e.key===key){preference=['light','dark','system'].includes(e.newValue)?e.newValue:'system';apply();window.dispatchEvent(new Event('lochire-theme-change'));}});
  apply();
})();
