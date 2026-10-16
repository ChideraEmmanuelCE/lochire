export async function activeAccountLock(db,userId){
 return db.prepare("SELECT kind,reason,until_at FROM account_locks WHERE user_id=? AND kind!='unlocked' AND (until_at IS NULL OR until_at>?)").bind(userId,Date.now()).first();
}
export function lockMessage(lock){return 'Your account is '+(lock.kind==='permanent'?'permanently locked':'temporarily locked until '+new Date(lock.until_at).toLocaleString('en-GB',{timeZone:'Africa/Lagos'})+' WAT')+'. Reason: '+lock.reason+'. Contact LocHire support for help.';}
