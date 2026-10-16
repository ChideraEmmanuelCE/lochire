// Calendar rules use Nigerian time on the server. Dates submitted by a browser
// never decide eligibility without independent validation here.
export const lagosDay=(time=Date.now())=>new Date(time+3600000).toISOString().slice(0,10);
export function calendarDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export function adultRegistrationError(birthDate,consent,time=Date.now()){
 if(!calendarDate(birthDate)||birthDate<'1900-01-01'||birthDate>lagosDay(time))return 'Enter your real date of birth.';
 const [year,month,day]=birthDate.split('-').map(Number),[y,m,d]=lagosDay(time).split('-').map(Number);
 const age=y-year-(m<month||m===month&&d<day?1:0);
 if(age<18)return 'You must be 18 or older to create a LocHire account.';
 if(consent!==true)return 'Confirm that you are 18 or older.';
 return null;
}
export function reviewEligibility(g,time=Date.now()){
 const end=g.terms?.completionDate,start=g.terms?.start;
 if(!calendarDate(end)||!calendarDate(start)||end<start)return {allowed:false,reason:'Agree a job end date before leaving a review.',opensAt:null};
 const opensAt=new Date(Date.parse(end+'T00:00:00+01:00')+86400000).toISOString();
 if(lagosDay(time)<=end)return {allowed:false,reason:'Reviews open after the job end date.',endDate:end,opensAt};
 if(g.status!=='Completed')return {allowed:false,reason:'Both people must mark the job finished before leaving a review.',endDate:end,opensAt};
 if(g.confirmations?.[g.workerId]!==g.version||g.confirmations?.[g.employerId]!==g.version)return {allowed:false,reason:'Both people must agree the job dates before leaving a review.',endDate:end,opensAt};
 return {allowed:true,reason:null,endDate:end,opensAt};
}
