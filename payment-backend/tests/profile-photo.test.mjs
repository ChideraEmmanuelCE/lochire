import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProfilePhoto} from '../lib/profile-photo.mjs';
const photo=JSON.parse(readFileSync(new URL('./fixtures/profile-photo.json',import.meta.url),'utf8')).data;
test('avatar validation enforces tiny square JPEGs without location metadata',()=>{
 assert.equal(validateProfilePhoto(photo),photo);assert.equal(validateProfilePhoto(null),null);
 const bytes=Buffer.from(photo.slice(23),'base64'),index=bytes.findIndex((v,i)=>v===255&&[192,194].includes(bytes[i+1]));assert.ok(index>0);
 const big=Buffer.from(bytes);big[index+7]=2;big[index+8]=0;assert.throws(()=>validateProfilePhoto('data:image/jpeg;base64,'+big.toString('base64')));
 const exif=Buffer.concat([bytes.subarray(0,2),Buffer.from([255,225,0,4,0,0]),bytes.subarray(2)]);assert.throws(()=>validateProfilePhoto('data:image/jpeg;base64,'+exif.toString('base64')));
 assert.throws(()=>validateProfilePhoto('data:image/jpeg;base64,'+bytes.subarray(0,-2).toString('base64')));
 assert.throws(()=>validateProfilePhoto('data:image/jpeg;base64,'+'a'.repeat(5000)));
});
