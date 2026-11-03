// Verify Google Identity Services ID tokens in the private Cloudflare runtime.
// Never trust browser-supplied profile/email fields as identity.
const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const decoder = new TextDecoder();
let cachedKeys = null;
let expiresAt = 0;

export class GoogleIdentityError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function invalid() { throw new GoogleIdentityError(401, 'Google could not verify this sign-in. Please try again.'); }
function b64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4-value.length%4)%4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function jsonPart(value) {
  try { return JSON.parse(decoder.decode(b64url(value))); } catch { invalid(); }
}
async function keys(force=false) {
  if (!force && cachedKeys && Date.now() < expiresAt) return cachedKeys;
  let response;
  try { response = await fetch(KEYS_URL, {redirect:'error',signal:AbortSignal.timeout(8000)}); }
  catch { throw new GoogleIdentityError(503, 'Google sign-in is temporarily unavailable.'); }
  if (!response.ok) throw new GoogleIdentityError(503, 'Google sign-in is temporarily unavailable.');
  const result = await response.json().catch(() => null);
  if (!Array.isArray(result?.keys)) throw new GoogleIdentityError(503, 'Google sign-in is temporarily unavailable.');
  cachedKeys = result.keys.filter(k => k.kty === 'RSA' && k.use === 'sig' && (k.alg === 'RS256' || !k.alg));
  const seconds = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 300);
  expiresAt = Date.now() + Math.min(Math.max(seconds, 60), 3600)*1000;
  return cachedKeys;
}

export async function verifyGoogleIdToken(credential, clientId) {
  if (!clientId || typeof credential !== 'string' || credential.length > 8192) invalid();
  const parts = credential.split('.');
  if (parts.length !== 3) invalid();
  const header = jsonPart(parts[0]), claims = jsonPart(parts[1]);
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid)) invalid();
  let candidates = await keys();
  let jwk = candidates.find(k => k.kid === header.kid);
  if (!jwk) { candidates = await keys(true); jwk = candidates.find(k => k.kid === header.kid); }
  if (!jwk) invalid();
  let verified = false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
    verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0]+'.'+parts[1]));
  } catch { invalid(); }
  if (!verified) invalid();
  const now = Math.floor(Date.now()/1000);
  if (!['accounts.google.com','https://accounts.google.com'].includes(claims.iss) ||
      claims.aud !== clientId || !Number.isInteger(claims.exp) || claims.exp <= now ||
      !Number.isInteger(claims.iat) || claims.iat > now+60 ||
      !claims.sub || typeof claims.sub !== 'string' || claims.sub.length > 255 ||
      claims.email_verified !== true || typeof claims.email !== 'string') invalid();
  const email = claims.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid();
  return {sub:claims.sub, email, name:typeof claims.name==='string'?claims.name.trim().slice(0,70):''};
}
