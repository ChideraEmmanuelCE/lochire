// NIPOST keys remain on the server. Address resolution is not identity verification.
export class PostcodeError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new PostcodeError(status, message); };
const encoder = new TextEncoder();
const clean = value => typeof value === 'string' ? value.trim().slice(0, 500) : null;

export function normalizePostcode(value) {
  if (typeof value !== 'string' || value.length > 30) fail(400, 'Enter a postcode such as FC-01-A01-KP-27, or leave it blank.');
  const code = value.toUpperCase().replace(/[\s-]/g, '');
  // Five documented segments contain 11 alphanumeric characters, excluding separators.
  if (!/^[A-Z]{2}(?:0[1-9]|[1-9]\d)[A-Z]\d{2}[A-Z]{2}(?:0[1-9]|[1-9]\d)$/.test(code)) fail(400, 'Enter a valid five-part postcode, or leave it blank.');
  return `${code.slice(0,2)}-${code.slice(2,4)}-${code.slice(4,7)}-${code.slice(7,9)}-${code.slice(9)}`;
}

export function postcodeReadiness(env) {
  const missing = [];
  if (!env.POSTCODE_API_KEY) missing.push('POSTCODE_API_KEY');
  if (!['sandbox','production'].includes(env.POSTCODE_ENVIRONMENT)) missing.push('POSTCODE_ENVIRONMENT');
  const enabled = env.POSTCODE_ENABLED === 'true';
  const ready = enabled && missing.length === 0;
  return { ready, environment: env.POSTCODE_ENVIRONMENT || 'not_configured', provider: 'NIPOST', missing,
    lookupLevel: Number(env.POSTCODE_LOOKUP_LEVEL || 2),
    message: ready ? 'Confirm the returned location before using it for your job.' : 'NIPOST lookup is not connected yet. You can continue without it or save a postcode as unconfirmed.' };
}

const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const encode = text => base64(encoder.encode(text));
const decode = text => new TextDecoder().decode(Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0)));
async function signature(payload, secret) {
  if (!secret) fail(503, 'Postcode confirmation is temporarily unavailable.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}
const equal = (a,b) => { if(typeof a!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; };

export async function lookupPostcode(code, env, userId, fetcher = fetch) {
  const postcode = normalizePostcode(code), config = postcodeReadiness(env);
  if (!config.ready) fail(503, config.message);
  const expectedPrefix = config.environment === 'sandbox' ? 'nipost_test_' : 'nipost_live_';
  if (!env.POSTCODE_API_KEY.startsWith(expectedPrefix)) fail(503, 'The postcode key does not match the configured environment.');
  const url = new URL(env.POSTCODE_BASE_URL || 'https://api.postcode.gov.ng');
  if (url.protocol !== 'https:' || !(url.hostname === 'postcode.gov.ng' || url.hostname.endsWith('.postcode.gov.ng')) || url.username || url.password || url.search || url.hash) fail(503, 'The postcode service endpoint needs configuration.');
  if (!Number.isInteger(config.lookupLevel) || config.lookupLevel < 1 || config.lookupLevel > 3) fail(503, 'The postcode lookup access level needs configuration.');
  url.pathname = '/v1/lookup';
  url.searchParams.set('code', postcode);
  url.searchParams.set('level', String(config.lookupLevel));
  let result;
  try { result = await fetcher(url, { headers: { Accept:'application/json', 'X-API-Key':env.POSTCODE_API_KEY }, redirect:'error', signal:AbortSignal.timeout(12000) }); }
  catch { fail(503, 'NIPOST could not be reached. Retry or continue without a checked postcode.'); }
  if (result.status === 429) fail(429, 'Postcode lookup is busy. Try again shortly.');
  if (result.status === 404) fail(404, 'NIPOST did not find this postcode in the selected environment.');
  if (!result.ok) fail(503, 'Postcode lookup is unavailable. The key, access level or credits may need attention.');
  let data;
  try { data = (await result.json()).data; } catch { fail(502, 'NIPOST returned an unreadable response.'); }
  if (data?.valid !== true) fail(404, 'NIPOST did not confirm this postcode. Check the code or continue without it.');
  let returned;
  try { returned = normalizePostcode(data.postcode); } catch { fail(502, 'NIPOST returned an unexpected postcode.'); }
  if (returned !== postcode) fail(502, 'NIPOST returned a different postcode. Please retry.');
  const raw = data.administrative_address;
  const administrative = raw && typeof raw === 'object' ? {
    state:clean(raw.state_name), lga:clean(raw.lga_name), locality:clean(raw.locality_name), zone:clean(raw.zone)
  } : null;
  const address = clean(data.recent_house_address?.recent);
  const selection = { postcode, status:address ? 'address_resolved' : 'validity_confirmed', environment:config.environment,
    administrative, address, checkedAt:new Date().toISOString() };
  // Bind the confirmation to the account, code, environment, and a short expiry.
  const payload = encode(JSON.stringify({ selection, userId, expiresAt:Date.now()+1800000 }));
  return { ...selection, token:payload+'.'+await signature(payload, env.SERVICE_SECRET) };
}

export async function jobLocation(body, env, userId) {
  if (body.postcode !== undefined && typeof body.postcode !== 'string') fail(400, 'Enter a valid postcode, or leave it blank.');
  if (!body.postcode?.trim()) {
    if (body.postcodeToken) fail(400, 'Choose the postcode matching this confirmation.');
    return null;
  }
  const postcode = normalizePostcode(body.postcode);
  if (!body.postcodeToken) return { postcode, status:'unconfirmed', environment:'not_checked', administrative:null, address:null, checkedAt:null };
  if (typeof body.postcodeToken !== 'string' || body.postcodeToken.length > 8000) fail(400, 'Check this postcode again before attaching it.');
  const [payload, supplied, extra] = body.postcodeToken.split('.');
  if (!payload || !supplied || extra || !equal(supplied, await signature(payload, env.SERVICE_SECRET))) fail(400, 'Check this postcode again before attaching it.');
  let decoded;
  try { decoded = JSON.parse(decode(payload)); } catch { fail(400, 'Check this postcode again before attaching it.'); }
  if (decoded.userId !== userId || decoded.expiresAt < Date.now() || decoded.selection?.postcode !== postcode) fail(400, 'This postcode confirmation expired or belongs to another account. Check it again.');
  return decoded.selection;
}

export function locationForParticipant(row, job, userId) {
  if (!row) return null;
  if (job.employer_id !== userId && job.status === 'invited') return { status:row.status, environment:row.environment, privateUntilAccepted:true };
  // Declining an invitation does not grant address access.
  if (job.employer_id !== userId && !row.accepted_at) return { status:row.status, environment:row.environment, privateUntilAccepted:true };
  return { postcode:row.postcode, status:row.status, environment:row.environment, address:row.address,
    administrative:row.administrative ? JSON.parse(row.administrative) : null, checkedAt:row.checked_at };
}
