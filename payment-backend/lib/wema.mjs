// Public Wema documentation is linked in docs/WEMA-INTEGRATION.md. Some
// product contracts are subscription-only. Live mode fails closed until Wema
// confirms those fields, endpoints, callback transport and securityInfo format.
const encoder=new TextEncoder();
const bytesToHex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const fromHex=s=>new Uint8Array(s.match(/.{2}/g).map(x=>parseInt(x,16)));
const base64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
const required=['WEMA_BASE_URL','WEMA_API_KEY','WEMA_CHANNEL_ID','WEMA_CALLBACK_TOKEN','WEMA_MANDATE_KEY','WEMA_WALLET_VERIFY_PATH','WEMA_TRANSFER_STATUS_PATH','WEMA_CONTRACT_CONFIRMED','WEMA_ENVIRONMENT'];
export function bankReadiness(env) {
  const missing=required.filter(k=>!env[k]||(k==='WEMA_CONTRACT_CONFIRMED'&&env[k]!=='true'));
  if(env.WEMA_ENVIRONMENT&&!['sandbox','production'].includes(env.WEMA_ENVIRONMENT))missing.push('WEMA_ENVIRONMENT');
  return {ready:env.WEMA_ENABLED==='true'&&missing.length===0,status:env.WEMA_ENABLED==='true'&&missing.length===0?'configured':'awaiting_credentials',environment:env.WEMA_ENVIRONMENT||'not_configured',missing,provider:'Wema / ALAT',message:'Wema accounts and transfers become available after bank credentials and the product contract are confirmed.'};
}
export class WemaProvider {
  constructor(env,fetcher=fetch) { this.env=env;this.fetcher=fetcher; }
  async request(path,body,method='POST',authHeader='x-api-key') {
    const base=new URL(this.env.WEMA_BASE_URL);
    authHeader=this.env.WEMA_AUTH_HEADER||authHeader;
    if(!['x-api-key','Ocp-Apim-Subscription-Key'].includes(authHeader))throw Error('Unsupported Wema authentication header.');
    const allowed=base.protocol==='https:'&&(['alat.ng','wemabank.com','azure-api.net'].some(h=>base.hostname===h||base.hostname.endsWith('.'+h)));
    if(!allowed)throw Error('Wema must provide a verified HTTPS API base URL.');
    if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.includes('://')||path.includes('..'))throw Error('Invalid bank endpoint path.');
    const url=new URL(base.href.replace(/\/$/,'')+path);
    const response=await this.fetcher(url,{method,headers:{'Content-Type':'application/json',[authHeader]:this.env.WEMA_API_KEY},body:method==='GET'?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw Error('Bank request could not be completed.');
    const value=await response.json();if(value.hasError===true)throw Error('Bank returned an error.');return value;
  }
  requestWallet({email,phoneNumber,nin}) {
    return this.request('/wallet-creation/api/CustomerAccount/GenerateWalletAccountForPartnerships/Request',{email,phoneNumber,nin});
  }
  verifyWallet({otp,trackingId,phoneNumber}) {
    return this.request('/wallet-creation/api/CustomerAccount/GenerateWalletAccountForPartnershipsV2/otp',{otp,trackingId,phoneNumber});
  }
  trackingId(response) {return response.trackingId||response.data?.trackingId||response.result?.trackingId;}
  async verifyCreatedWallet(trackingId) {
    if(!this.env.WEMA_WALLET_VERIFY_PATH)throw Error('Bank wallet read-back endpoint is required.');
    const response=await this.request(this.env.WEMA_WALLET_VERIFY_PATH.replace('{trackingId}',encodeURIComponent(trackingId)),undefined,'GET');
    // Confirm this projection against the bank's subscribed response model.
    const d=response.data||response.result||response;
    if(d.nubanStatus!=='Active')throw Error('Bank has not confirmed an active wallet.');
    return {email:String(d.email||'').toLowerCase(),accountNumber:d.nuban,accountName:d.nubanName};
  }
  sourceNameEnquiry(accountNumber) {return this.request(`/debit-wallet/api/Shared/AccountNameEnquiry/Wallet/${encodeURIComponent(accountNumber)}`,{});}
  destinationNameEnquiry(bankCode,accountNumber) {return this.request(`/debit-wallet/api/Shared/AccountNameEnquiry/${encodeURIComponent(bankCode)}/${encodeURIComponent(accountNumber)}?channelId=${encodeURIComponent(this.env.WEMA_CHANNEL_ID)}`,undefined,'GET');}
  matchesAccountName(response,expected) {const d=response.data||response.result||response;return typeof d.accountName==='string'&&d.accountName.trim().toLowerCase()===String(expected||'').trim().toLowerCase();}
  bankList() {return this.request('/debit-wallet/api/Shared/GetAllBanks',undefined,'GET');}
  async initiateTransfer(payment) {
    const securityInfo=await createMandate(payment,this.env);
    // Wema must confirm bankCode and channelId requirements for this product.
    return this.request('/debit-wallet/api/Shared/ProcessClientTransfer',{
      sourceAccountNumber:payment.source,destinationAccountNumber:payment.destination,
      destinationBankCode:this.env.WEMA_BANK_CODE||'035',channelId:this.env.WEMA_CHANNEL_ID,
      amount:payment.amount/100,transactionReference:payment.reference,
      narration:'LocHire job payment',useCustomNarration:true,securityInfo,
    });
  }
  payWithAlatAccount({accountNumber,amountKobo,reference}) {
    return this.request('/pay-with-bank-account/api/EcommerceTransfer/v2/transfer-fund-request',{sourceAccountNumber:accountNumber,amount:amountKobo/100,channelId:this.env.WEMA_CHANNEL_ID,narration:'LocHire payment',transactionReference:reference});
  }
  checkAlatPayment(reference) {return this.request(`/pay-with-bank-account/api/EcommerceTransfer/CheckTransactionStatus/${encodeURIComponent(this.env.WEMA_CHANNEL_ID)}/${encodeURIComponent(reference)}`,undefined,'GET');}
  async verifyPayment(payment) {
    if(!this.env.WEMA_TRANSFER_STATUS_PATH)throw Error('A bank payment status endpoint is required.');
    const response=await this.request(this.env.WEMA_TRANSFER_STATUS_PATH.replace('{reference}',encodeURIComponent(payment.reference)).replace('{channelId}',encodeURIComponent(this.env.WEMA_CHANNEL_ID)),undefined,'GET');
    const data=response.data||response.result||response;
    const mapped={SUCCESSFUL:'successful',SUCCESS:'successful',PENDING:'pending',FAILED:'failed'};
    const status=mapped[String(data.status||'').toUpperCase()];if(!status)throw Error('Unknown bank status.');
    if(status==='successful') {
      const n=this.env.WEMA_AMOUNT_UNIT==='kobo'?Number(data.amount):Math.round(Number(data.amount)*100);
      if(data.transactionReference!==payment.reference||n!==payment.amount||data.currency!=='NGN'||data.sourceAccountNumber!==payment.source||data.destinationAccountNumber!==payment.destination)throw Error('The bank response does not match the requested payment.');
    }
    return {status};
  }
  requestStatement(accountNumber,fromDate,toDate) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate||'')||!/^\d{4}-\d{2}-\d{2}$/.test(toDate||'')||fromDate>toDate)throw Error('Use a valid statement date range.');
    // Confirm accountNumber/startDate/endDate against the subscription schema.
    return this.request('/get-statement-service/api/AccountMaintenance/GetCustomerTransactions',{accountNumber,startDate:fromDate,endDate:toDate,channelId:this.env.WEMA_CHANNEL_ID});
  }
  statementReference(response) {return response.referenceId||response.data?.referenceId||response.result?.referenceId;}
  getStatement(referenceId) {return this.request('/get-statement-service/api/AccountMaintenance/GetCustomerTransactions',{referenceId});}
  locHireRecords(response) {
    const records=response.data?.transactions||response.result?.transactions||response.transactions;
    if(!Array.isArray(records))return [];
    return records.filter(x=>String(x.transactionReference||'').startsWith('LH-')).map(x=>({reference:x.transactionReference,date:x.transactionDate,amount:x.amount,currency:'NGN',status:x.status}));
  }
}
async function mandateKey(env) {
  if(!/^[a-f0-9]{64}$/.test(env.WEMA_MANDATE_KEY||''))throw Error('A 32-byte mandate key is required.');
  return crypto.subtle.importKey('raw',fromHex(env.WEMA_MANDATE_KEY),'AES-GCM',false,['encrypt','decrypt']);
}
export async function createMandate(payment,env) {
  const iv=crypto.getRandomValues(new Uint8Array(12)),payload={reference:payment.reference,source:payment.source,destination:payment.destination,amount:payment.amount,expires:Date.now()+900000};
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await mandateKey(env),encoder.encode(JSON.stringify(payload)));
  return `${base64(iv)}.${base64(encrypted)}`;
}
export async function authorizeMandate(db,body,env) {
  const reference=String(body.transactionReference||''),answer={transactionReference:reference,authorized:false};
  if(!bankReadiness(env).ready)return answer;
  try {
    const [iv,data,extra]=String(body.securityInfo||'').split('.');if(!iv||!data||extra)return answer;
    const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},await mandateKey(env),unbase64(data));
    const mandate=JSON.parse(new TextDecoder().decode(bytes));
    const row=await db.prepare("SELECT * FROM bank_requests WHERE reference=? AND kind='payment' AND status IN ('created','pending','unknown')").bind(reference).first();
    if(row&&mandate.expires>Date.now()&&mandate.reference===reference&&mandate.amount===row.amount&&mandate.source===row.source&&mandate.destination===row.destination)answer.authorized=true;
  } catch { /* A failed mandate is a declined authorization, never a retry. */ }
  return answer;
}
