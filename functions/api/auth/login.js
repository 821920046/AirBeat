import { json, hashPassword, signJWT, authCookie } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  if (!env.JWT_SECRET) return json({ error: '服务未配置 JWT_SECRET' }, 500);
  const { email, password } = await request.json().catch(() => ({}));
  if (!email || !password) return json({ error: '请输入邮箱和密码' }, 400);
  const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!u) return json({ error: '邮箱或密码错误' }, 401);
  const { hash } = await hashPassword(password, u.salt);
  if (hash !== u.password_hash) return json({ error: '邮箱或密码错误' }, 401);
  const token = await signJWT({ id: u.id, email: u.email }, env.JWT_SECRET);
  return json({ id: u.id, email: u.email }, 200, { 'Set-Cookie': authCookie(token) });
}
