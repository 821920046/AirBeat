let user = null;
export function setUser(u) { user = u; }
export function getUser() { return user; }

const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const key = (t) => t.source + ':' + t.trackId;
const rowToTrack = (r) => ({ source: r.source, trackId: r.track_id, title: r.title, artist: r.artist, cover: r.cover, audioUrl: r.audio_url });

async function call(path, method = 'GET', body) {
  const r = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || '请求失败');
  return d;
}

export async function getFavorites() {
  if (user) return (await call('/api/favorites')).map(rowToTrack);
  return LS.get('airbeat:favs', []);
}

export async function toggleFavorite(t) {
  const favs = await getFavorites();
  const exists = favs.some((f) => key(f) === key(t));
  if (user) await call('/api/favorites', exists ? 'DELETE' : 'POST', t);
  else LS.set('airbeat:favs', exists ? favs.filter((f) => key(f) !== key(t)) : [t, ...favs]);
  return !exists;
}

export async function getPlaylists() {
  if (user) return call('/api/playlists');
  return LS.get('airbeat:pls', []).map((p) => ({ id: p.id, name: p.name, song_count: p.songs.length }));
}

export async function createPlaylist(name) {
  if (user) return call('/api/playlists', 'POST', { name });
  const pls = LS.get('airbeat:pls', []);
  const pl = { id: 'l' + Date.now(), name, songs: [] };
  LS.set('airbeat:pls', [pl, ...pls]);
  return pl;
}

export async function renamePlaylist(id, name) {
  if (user) return call('/api/playlists/' + id, 'PATCH', { name });
  const pls = LS.get('airbeat:pls', []);
  const pl = pls.find((p) => String(p.id) === String(id));
  if (pl) { pl.name = name; LS.set('airbeat:pls', pls); }
}

export async function deletePlaylist(id) {
  if (user) return call('/api/playlists/' + id, 'DELETE');
  LS.set('airbeat:pls', LS.get('airbeat:pls', []).filter((p) => String(p.id) !== String(id)));
}

export async function getPlaylist(id) {
  if (user) {
    const pl = await call('/api/playlists/' + id);
    return { ...pl, songs: (pl.songs || []).map(rowToTrack) };
  }
  return LS.get('airbeat:pls', []).find((p) => String(p.id) === String(id)) || null;
}

export async function addToPlaylist(id, t) {
  if (user) return call('/api/playlists/' + id + '/songs', 'POST', t);
  const pls = LS.get('airbeat:pls', []);
  const pl = pls.find((p) => String(p.id) === String(id));
  if (pl && !pl.songs.some((s) => key(s) === key(t))) { pl.songs.push(t); LS.set('airbeat:pls', pls); }
}

export async function removeFromPlaylist(id, t) {
  if (user) return call('/api/playlists/' + id + '/songs', 'DELETE', t);
  const pls = LS.get('airbeat:pls', []);
  const pl = pls.find((p) => String(p.id) === String(id));
  if (pl) { pl.songs = pl.songs.filter((s) => key(s) !== key(t)); LS.set('airbeat:pls', pls); }
}

export async function mergeLocal() {
  if (!user) return;
  for (const t of LS.get('airbeat:favs', [])) await call('/api/favorites', 'POST', t).catch(() => {});
  for (const p of LS.get('airbeat:pls', [])) {
    const created = await call('/api/playlists', 'POST', { name: p.name }).catch(() => null);
    if (created) {
      for (const s of p.songs) await call('/api/playlists/' + created.id + '/songs', 'POST', s).catch(() => {});
    }
  }
  localStorage.removeItem('airbeat:favs');
  localStorage.removeItem('airbeat:pls');
}
