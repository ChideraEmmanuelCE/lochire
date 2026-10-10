const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
fs.cpSync(path.join(root,'assets'),path.join(out,'assets'),{recursive:true});
for(const file of ['index.html','style.css','live.css','postcode.css','postcode.js','live-domain.js','app.js','theme.js'])fs.copyFileSync(path.join(root,file),path.join(out,file));
console.log('Static LocHire app packaged in dist; development dependencies and private files are excluded.');
