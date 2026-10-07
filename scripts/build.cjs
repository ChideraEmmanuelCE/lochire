const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(path.join(out,'tests'),{recursive:true});
fs.cpSync(path.join(root,'assets'),path.join(out,'assets'),{recursive:true});
for(const file of ['index.html','style.css','wallet.css','domain.js','app.js','wallet.js','tests/responsive.html'])fs.copyFileSync(path.join(root,file),path.join(out,file));
console.log('Static LocHire app packaged in dist; development dependencies and private files are excluded.');
