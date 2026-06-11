import { json } from './_utils.js';

export async function onRequestGet({ env, data }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  const { results } = await env.DB.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY id DESC')
    .bind(data.user.id).all();
  return json(results);
}

export async function onRequestPost({ request, env, data }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  const t = await request.json().catch(() => ({}));
  if (!t.source || t.trackId == null) return json({ error: '参数缺失' }, 400);
  await env.DB.prepare(
    'INSERT OR IGNORE INTO favorites (user_id, source, track_id, title, artist, cover, audio_url) VALUES (?,?,?,?,?,?,?)'
  ).bind(data.user.id, t.source, String(t.trackId), t.title || '', t.artist || '', t.cover || '', t.audioUrl || '').run();
  return json({ ok: true }, 201);
}

export async function onRequestDelete({ request, env, data }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  const t = await request.json().catch(() => ({}));
  await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND source = ? AND track_id = ?')
    .bind(data.user.id, t.source, String(t.trackId)).run();
  return json({ ok: true });
}
