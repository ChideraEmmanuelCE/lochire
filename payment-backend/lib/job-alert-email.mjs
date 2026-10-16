// Email-safe markup: inline styles and presentation tables work without scripts,
// remote images or a downloaded font. The plain-text version has the same links.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact=value=>String(value??'').replace(/\s+/g,' ').trim();
const naira=value=>'₦'+Number(value).toLocaleString('en-NG',{maximumFractionDigits:2});
const basis={Hourly:'per hour',Daily:'per day',Monthly:'per month','Per task':'per task'};
const dateLabel=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
 const d=new Date(value+'T12:00:00Z');
 return Number.isFinite(d.getTime())?d.toLocaleDateString('en-NG',{timeZone:'Africa/Lagos',day:'numeric',month:'long',year:'numeric'}):null;
};
export function nearbyJobEmail(opening,link,env){
 const title=compact(opening.title),location=[opening.area,opening.city].filter(Boolean).map(compact).join(', ');
 const pay=opening.quote?'Discuss pay with the hirer':(Number(opening.min)===Number(opening.max)?naira(opening.min):naira(opening.min)+' – '+naira(opening.max))+' '+(basis[opening.basis]||'as agreed');
 const start=dateLabel(opening.type==='One-off task'?opening.date:opening.start);
 const summary=compact(opening.description),excerpt=summary.length>240?summary.slice(0,237).trimEnd()+'…':summary;
 const details=[['Service',opening.category],['Location',location],['Work type',opening.type],['Pay / budget',pay],...(start?[[opening.type==='One-off task'?'Job date':'Starts',start]]:[]),...(opening.duration?[['Duration',opening.duration]]:[])];
 const preferences=new URL('/?manage_job_alerts=1#premium',env.APP_ORIGIN).href;
 const home=new URL('/',env.APP_ORIGIN).href;
 const intro='A new job matches your saved location and service preferences.';
 const notice='Review the details and agree pay directly with the hirer. Premium Plus alerts do not guarantee a job or priority over other applicants.';
 const reason='You received this email because you have an active Premium Plus pass and nearby job alerts are on.';
 const subject='New nearby job: '+title;
 const text=[subject,intro,...details.map(([name,value])=>name+': '+compact(value)),...(excerpt?[excerpt]:[]),'View job & express interest: '+link,notice,reason,'Change your location, service or turn off nearby job emails: '+preferences,'Invitation emails and account-security emails have separate settings.'].join('\n\n');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(subject)+'</title></head><body style="margin:0;padding:0;background:#f3f7f3;color:#172e25;font-family:Arial,Helvetica,sans-serif">'+
 '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">'+esc(location+' · '+pay+' · '+intro)+'</div>'+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f7f3"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fff;border:1px solid #dce6dd;border-radius:16px"><tr><td style="padding:24px 24px 18px;border-bottom:1px solid #e5ece6"><a href="'+esc(home)+'" style="color:#153d35;text-decoration:none;font-size:25px;font-weight:bold">LocHire</a><p style="margin:8px 0 0;color:#587060;font-size:13px">Premium Plus · Nearby job alert</p></td></tr><tr><td style="padding:24px;overflow-wrap:anywhere;word-break:break-word"><p style="margin:0 0 12px;font-size:15px;line-height:1.6">'+esc(intro)+'</p><h1 style="margin:0 0 20px;font-size:25px;line-height:1.3;color:#153d35">'+esc(title)+'</h1><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5ece6">'+
 details.map(([name,value])=>'<tr><td style="padding:11px 10px 11px 0;border-bottom:1px solid #e5ece6;font-size:14px;line-height:1.5;color:#587060;vertical-align:top;width:32%">'+esc(name)+'</td><td style="padding:11px 0;border-bottom:1px solid #e5ece6;font-size:14px;line-height:1.5;font-weight:bold;vertical-align:top">'+esc(compact(value))+'</td></tr>').join('')+'</table>'+
 (excerpt?'<p style="font-size:15px;line-height:1.7;margin:20px 0">'+esc(excerpt)+'</p>':'')+'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#205b42;border-radius:10px;text-align:center"><a href="'+esc(link)+'" style="display:inline-block;padding:15px 20px;border:1px solid #205b42;border-radius:10px;font-size:16px;font-weight:bold;color:#fff;text-decoration:none">View job &amp; express interest</a></td></tr></table><p style="margin:0;font-size:13px;line-height:1.7;color:#587060">'+esc(notice)+'</p><p style="font-size:12px;line-height:1.6;color:#587060;overflow-wrap:anywhere">Button not opening? <a href="'+esc(link)+'" style="color:#205b42">Open this job on LocHire</a>.</p></td></tr><tr><td style="padding:20px 24px;background:#edf4ed;border-radius:0 0 16px 16px"><p style="margin:0 0 12px;font-size:12px;line-height:1.7;color:#476151">'+esc(reason)+'</p><a href="'+esc(preferences)+'" style="font-size:13px;color:#205b42;text-decoration:underline">Manage or turn off nearby job emails</a><p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#476151">Invitation emails and account-security emails have separate settings.</p></td></tr></table></td></tr></table></body></html>';
 return {subject,text,html};
}
