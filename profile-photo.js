'use strict';
(function(root){
const MAX_STORED=5000;
function encode(image,makeCanvas){
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 if(!width||!height||width*height>60000000)throw Error('Choose a smaller photo, up to 60 megapixels.');
 const side=Math.min(width,height),x=(width-side)/2,y=(height-side)/2;
 for(const size of [128,112,96,80,64,48]){
  const canvas=makeCanvas();canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo processing is unavailable in this browser. Try Safari or Chrome.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,x,y,side,side,0,0,size,size);
  for(const quality of [.78,.64,.5]){const data=canvas.toDataURL('image/jpeg',quality);if(data.startsWith('data:image/jpeg;base64,')&&data.length<MAX_STORED)return {data,width:size,bytes:Math.floor((data.length-23)*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0),storedBytes:data.length};}
 }
 throw Error('This photo could not be made small enough. Choose a simpler, clear face photo.');
}
async function compress(file){
 if(!file||!file.size||file.size>20*1024*1024)throw Error('Choose a photo smaller than 20 MB.');
 if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type))throw Error('Choose a JPG, PNG or WebP photo. For an iPhone HEIC photo, export it as JPEG first.');
 const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read that photo. Please choose it again.'));reader.readAsDataURL(file);});
 const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This photo format could not be opened. Save it as JPEG or PNG and try again.'));img.src=source;});
 return encode(image,()=>document.createElement('canvas'));
}
const api={compress,encode,MAX_STORED};if(typeof module==='object'&&module.exports)module.exports=api;else root.LocHirePhoto=api;
})(typeof window!=='undefined'?window:globalThis);
