export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

const enc = new TextEncoder();

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signJWT(payload, secret, expSec = 60 * 60 * 24 * 30) {
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expSec })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(header + '.' + body));
  return header + '.' + body + '.' + b64url(sig);
}

export async function verifyJWT(token, secret) {
  try {
    const [h, b, s] = token.split('.');
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(s), enc.encode(h + '.' + b));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(b)));
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/../g).map((x) => parseInt(x, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const toHex = (a) => [...new Uint8Array(a)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { hash: toHex(bits), salt: toHex(salt) };
}

export function getCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

export function authCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return 'token=' + token + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + maxAge;
}
