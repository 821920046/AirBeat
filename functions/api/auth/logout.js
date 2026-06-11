import { json, authCookie } from '../_utils.js';

export async function onRequestPost() {
  return json({ ok: true }, 200, { 'Set-Cookie': authCookie('', 0) });
}
