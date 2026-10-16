export const MESSAGE_LIFETIME=2*60*60*1000;
export async function messageViews(db,g){
 return (await db.prepare('SELECT message_id,viewed_at,expires_at FROM message_views WHERE engagement_id=?').bind(g.id).all()).results;
}
export function visibleMessages(messages,views,time=Date.now()){
 const byId=new Map(views.map(v=>[v.message_id,v]));
 return (messages||[]).flatMap(m=>{const v=byId.get(m.id);return v&&v.expires_at<=time?[]:[{...m,viewedAt:v?new Date(v.viewed_at).toISOString():null,expiresAt:v?new Date(v.expires_at).toISOString():null}];});
}
// Purge text in a bounded, atomic batch. Receipts contain only IDs and times.
// Incrementing the revision prevents concurrent edits from resurrecting text.
export async function purgeExpiredMessages(db,time=Date.now()){
 const rows=(await db.prepare('SELECT DISTINCT engagement_id FROM message_views WHERE purged=0 AND expires_at<=? LIMIT 50').bind(time).all()).results;
 for(const row of rows)await db.batch([
  db.prepare(`UPDATE live_engagements SET data=json_set(data,'$.messages',json(COALESCE((SELECT json_group_array(json(m.value)) FROM json_each(data,'$.messages') m WHERE NOT EXISTS(SELECT 1 FROM message_views v WHERE v.message_id=json_extract(m.value,'$.id') AND v.engagement_id=live_engagements.id AND v.expires_at<=?)),'[]'))),revision=revision+1 WHERE id=?`).bind(time,row.engagement_id),
  db.prepare('UPDATE message_views SET purged=1 WHERE engagement_id=? AND expires_at<=?').bind(row.engagement_id,time)
 ]);
}
export async function markMessagesViewed(db,g,user,actor,ids,time=Date.now()){
 const selected=(g.messages||[]).filter(m=>ids.includes(m.id)&&m.actor!==actor);
 if(selected.length)await db.batch(selected.map(m=>db.prepare('INSERT OR IGNORE INTO message_views(message_id,engagement_id,viewer_id,viewed_at,expires_at) VALUES(?,?,?,?,?)').bind(m.id,g.id,user.id,time,time+MESSAGE_LIFETIME)));
 return messageViews(db,g);
}
