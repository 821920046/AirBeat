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

export async function uploadWebDAV(url, userCred, passCred) {
  const favs = await getFavorites();
  const rawPls = await getPlaylists();
  const pls = [];
  for (const p of rawPls) {
    const detail = await getPlaylist(p.id).catch(() => null);
    if (detail) pls.push(detail);
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    favorites: favs,
    playlists: pls
  };
  const targetUrl = url.replace(/\/+$/, '') + '/airbeat_backup.json';
  const authHeader = 'Basic ' + btoa(unescape(encodeURIComponent(userCred + ':' + passCred)));
  
  const r = await fetch(targetUrl, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload, null, 2)
  });
  if (!r.ok) throw new Error('WebDAV 备份失败: HTTP ' + r.status);
  localStorage.setItem('airbeat:webdav', JSON.stringify({ url, user: userCred, pass: passCred }));
}

export async function downloadWebDAV(url, userCred, passCred) {
  const targetUrl = url.replace(/\/+$/, '') + '/airbeat_backup.json';
  const authHeader = 'Basic ' + btoa(unescape(encodeURIComponent(userCred + ':' + passCred)));
  
  const r = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader
    }
  });
  if (r.status === 404) throw new Error('云端未找到备份文件 (airbeat_backup.json)');
  if (!r.ok) throw new Error('下载备份失败: HTTP ' + r.status);
  
  const data = await r.json();
  if (!data.favorites && !data.playlists) throw new Error('备份文件格式不正确');
  
  // 合并逻辑
  let importCount = 0;
  if (data.favorites) {
    for (const f of data.favorites) {
      const currentFavs = await getFavorites();
      if (!currentFavs.some((cur) => cur.source === f.source && cur.trackId === f.trackId)) {
        await toggleFavorite(f).catch(() => {});
      }
    }
  }
  
  if (data.playlists) {
    for (const pl of data.playlists) {
      const created = await createPlaylist(pl.name).catch(() => null);
      if (created && pl.songs) {
        for (const s of pl.songs) {
          await addToPlaylist(created.id, s).catch(() => {});
        }
        importCount++;
      }
    }
  }
  localStorage.setItem('airbeat:webdav', JSON.stringify({ url, user: userCred, pass: passCred }));
  return importCount;
}

export function getWebDAVConfig() {
  try {
    return JSON.parse(localStorage.getItem('airbeat:webdav')) || null;
  } catch { return null; }
}
