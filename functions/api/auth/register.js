import { json, hashPassword, signJWT, authCookie } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  if (!env.JWT_SECRET) return json({ error: '服务未配置 JWT_SECRET' }, 500);
  const { email, password } = await request.json().catch(() => ({}));
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400);
  if (!password || password.length < 6) return json({ error: '密码至少 6 位' }, 400);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return json({ error: '该邮箱已注册' }, 409);
  const { hash, salt } = await hashPassword(password);
  const res = await env.DB.prepare('INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)')
    .bind(email, hash, salt).run();
  const id = res.meta.last_row_id;
  const token = await signJWT({ id, email }, env.JWT_SECRET);
  return json({ id, email }, 201, { 'Set-Cookie': authCookie(token) });
}
