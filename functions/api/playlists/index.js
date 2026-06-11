import { json } from '../_utils.js';

export async function onRequestGet({ env, data }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  const { results } = await env.DB.prepare(
    'SELECT p.id, p.name, p.cover, p.created_at, (SELECT COUNT(*) FROM playlist_songs s WHERE s.playlist_id = p.id) AS song_count FROM playlists p WHERE p.user_id = ? ORDER BY p.id DESC'
  ).bind(data.user.id).all();
  return json(results);
}

export async function onRequestPost({ request, env, data }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  const { name } = await request.json().catch(() => ({}));
  if (!name || !name.trim()) return json({ error: '名称不能为空' }, 400);
  const res = await env.DB.prepare('INSERT INTO playlists (user_id, name) VALUES (?, ?)')
    .bind(data.user.id, name.trim()).run();
  return json({ id: res.meta.last_row_id, name: name.trim() }, 201);
}
