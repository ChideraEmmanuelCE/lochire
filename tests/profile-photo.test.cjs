const test=require('node:test'),assert=require('node:assert/strict');
const {encode,MAX_STORED}=require('../profile-photo.js');
test('photo compressor crops centrally and reduces resolution until the whole stored value is below 5 KB',()=>{
 const crops=[],tries=[];
 const r=encode({naturalWidth:1600,naturalHeight:1200},()=>{const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(...a){crops.push(a.slice(1));}}),toDataURL(type,quality){tries.push([this.width,quality]);return 'data:image/jpeg;base64,'+'A'.repeat(this.width>=96?6000:3200);}};return canvas;});
 assert.equal(r.width,80);assert.ok(r.storedBytes<MAX_STORED);assert.deepEqual(crops[0],[200,0,1200,1200,0,0,128,128]);assert.ok(tries.some(([size,q])=>size===128&&q===.5));
});
test('photo compressor fails safely instead of keeping originals or oversized images',()=>{
 const make=()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>'data:image/jpeg;base64,'+'a'.repeat(6000)});
 assert.throws(()=>encode({width:100,height:100},make),/small enough/);assert.throws(()=>encode({width:0,height:0},make));assert.throws(()=>encode({width:10000,height:10000},make),/smaller photo/);
});
