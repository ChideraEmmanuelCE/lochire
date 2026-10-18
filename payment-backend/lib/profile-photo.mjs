// Accept only compact square JPEG thumbnails. Original photos and metadata
// never need to be sent to the service.
export function validateProfilePhoto(value){
 if(value==null||value==='')return null;
 const bad=()=>{throw new Error('Choose a valid profile photo compressed below 5 KB.');};
 if(typeof value!=='string'||value.length>=5000||!/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))bad();
 let bytes;try{bytes=Uint8Array.from(atob(value.slice(23)),c=>c.charCodeAt(0));}catch{bad();}
 if(!bytes||bytes.length<100||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)bad();
 let i=2,dimensions=false,scan=false;
 while(i<bytes.length-2){
  if(bytes[i++]!==255)bad();while(bytes[i]===255)i++;const marker=bytes[i++];
  if(marker===217)break;
  if(i+2>bytes.length)bad();const length=(bytes[i]<<8)|bytes[i+1];
  if(length<2||i+length>bytes.length)bad();
  if(marker===225||marker===254)bad(); // no EXIF location metadata or comments
  if(marker===192||marker===194){const h=(bytes[i+3]<<8)|bytes[i+4],w=(bytes[i+5]<<8)|bytes[i+6];if(length<8||h!==w||w<48||w>128)bad();dimensions=true;}
  if(marker===218){scan=true;break;}i+=length;
 }
 if(!dimensions||!scan)bad();return value;
}
export async function getAccountPhoto(db,userId){return (await db.prepare('SELECT data_uri FROM account_photos WHERE user_id=?').bind(userId).first())?.data_uri||null;}
