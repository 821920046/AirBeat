import { json } from '../_utils.js';

export async function onRequestGet({ env, data, params }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  const pl = await env.DB.prepare('SELECT * FROM playlists WHERE id = ? AND user_id = ?')
    .bind(params.id, data.user.id).first();
  if (!pl) return json({ error: '歌单不存在' }, 404);
  const { results } = await env.DB.prepare('SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY position, id')
    .bind(pl.id).all();
  return json({ ...pl, songs: results });
}

export async function onRequestPatch({ request, env, data, params }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  const { name } = await request.json().catch(() => ({}));
  if (!name || !name.trim()) return json({ error: '名称不能为空' }, 400);
  await env.DB.prepare('UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?')
    .bind(name.trim(), params.id, data.user.id).run();
  return json({ ok: true });
}

export async function onRequestDelete({ env, data, params }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  await env.DB.prepare('DELETE FROM playlist_songs WHERE playlist_id IN (SELECT id FROM playlists WHERE id = ? AND user_id = ?)')
    .bind(params.id, data.user.id).run();
  await env.DB.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?')
    .bind(params.id, data.user.id).run();
  return json({ ok: true });
}
