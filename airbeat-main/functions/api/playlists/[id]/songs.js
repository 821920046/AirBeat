import { json } from '../../_utils.js';

async function owned(env, user, id) {
  return env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').bind(id, user.id).first();
}

export async function onRequestPost({ request, env, data, params }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  if (!(await owned(env, data.user, params.id))) return json({ error: '歌单不存在' }, 404);
  const t = await request.json().catch(() => ({}));
  if (!t.source || t.trackId == null) return json({ error: '参数缺失' }, 400);
  await env.DB.prepare(
    'INSERT INTO playlist_songs (playlist_id, source, track_id, title, artist, cover, audio_url, position) VALUES (?,?,?,?,?,?,?, (SELECT COALESCE(MAX(position),0)+1 FROM playlist_songs WHERE playlist_id = ?))'
  ).bind(params.id, t.source, String(t.trackId), t.title || '', t.artist || '', t.cover || '', t.audioUrl || '', params.id).run();
  return json({ ok: true }, 201);
}

export async function onRequestDelete({ request, env, data, params }) {
  if (!data.user) return json({ error: '未登录' }, 401);
  if (!(await owned(env, data.user, params.id))) return json({ error: '歌单不存在' }, 404);
  const t = await request.json().catch(() => ({}));
  await env.DB.prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND source = ? AND track_id = ?')
    .bind(params.id, t.source, String(t.trackId)).run();
  return json({ ok: true });
}
