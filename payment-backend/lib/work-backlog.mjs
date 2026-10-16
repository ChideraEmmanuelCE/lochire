import {drainJobAlertOutbox} from './premium.mjs';
import {deliverWorkEmails} from './work-email.mjs';
// Continue fan-out and delivery after the HTTP response. The outbox and leased
// email rows survive request failures; later authenticated activity retries them.
export async function deliverWorkBacklog(env){
 if(!env.DB||env.APP_MODE!=='production')return;
 const deadline=Date.now()+24000;
 try{for(let i=0;i<50&&Date.now()<deadline;i++){
  const queued=env.PAYMENTS_PRODUCT==='legacy'?0:await drainJobAlertOutbox(env.DB);
  const {sent}=await deliverWorkEmails(env.DB,env);
  if(!queued&&!sent)break;
 }}catch{/* Do not discard durable pending work on provider failure. */}
}
