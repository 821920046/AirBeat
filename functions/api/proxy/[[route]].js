const SOURCES = {
  jamendo: 'https://api.jamendo.com/v3.0',
  audius: 'https://discoveryprovider.audius.co/v1',
  deezer: 'https://api.deezer.com',
  archive: 'https://archive.org',
  radio: 'https://de1.api.radio-browser.info/json',
  lrclib: 'https://lrclib.net/api',
  spotify: 'https://api.spotify.com/v1',
  lastfm: 'https://ws.audioscrobbler.com/2.0',
  musicbrainz: 'https://musicbrainz.org/ws/2',
  jiosaavn: 'https://saavn.dev/api',
};

function pass(upstream, keys) {
  const h = new Headers();
  for (const k of keys) {
    const v = upstream.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set('Access-Control-Allow-Origin', '*');
  return new Response(upstream.body, { status: upstream.status, headers: h });
}

/** 边缘缓存：Cache API 命中直接返回，miss 则 fetch 后存入 */
async function cachedFetch(key, fetcher, ttl = 300) {
  const cache = caches.default;
  try {
    const hit = await cache.match(key);
    if (hit) return hit;
  } catch { /* 缓存读取失败，继续请求 */ }
  try {
    const res = await fetcher();
    try {
      // 缓存所有响应：200 用长 TTL，429/403 短 TTL 防重复撞墙，5xx 更短
      const cacheTtl = res.ok ? ttl : (res.status === 429 || res.status === 403 ? 120 : 30);
      const toCache = res.clone();
      const cachedHeaders = new Headers(toCache.headers);
      cachedHeaders.set('Cache-Control', 'public, max-age=' + cacheTtl);
      await cache.put(key, new Response(toCache.body, { status: toCache.status, headers: cachedHeaders }));
    } catch { /* 缓存写入失败不阻塞响应 */ }
    return res;
  } catch (err) {
    // 上游请求失败（DNS 解析失败 / 连接超时）→ 返回 502 而不是让整个请求 500
    return new Response(JSON.stringify({ error: '上游音源不可达: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

/** Spotify Client Credentials Token 管理，缓存于 Cache API */
async function getSpotifyToken(env) {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  const cache = caches.default;
  const cacheKey = new Request('https://airbeat-spotify-token.internal/token');
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const { token } = await hit.json();
      return token;
    }
  } catch {}

  try {
    const creds = btoa(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET);
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + creds,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const { access_token, expires_in } = await res.json();
    // 提前 100 秒过期，避免边缘情况
    const ttl = (expires_in || 3600) - 100;
    await cache.put(cacheKey, new Response(JSON.stringify({ token: access_token }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + ttl },
    }));
    return access_token;
  } catch {
    return null;
  }
}

/** 通用 fetch 带超时 */
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export async function onRequestGet({ request, env, params }) {
  const route = params.route || [];
  const url = new URL(request.url);

  // ─── 流式代理 /api/proxy/stream?url=... ───
  if (route[0] === 'stream') {
    const target = url.searchParams.get('url') || '';
    if (!/^https?:\/\//.test(target)) return new Response('bad url', { status: 400 });
    const isImage = /\.(png|jpe?g|webp|gif|svg|bmp)(\?|$)/i.test(target) ||
      /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(target.split('?')[0]);
    const cacheKey = new Request(request.url, { method: 'GET' });
    if (isImage) {
      return cachedFetch(cacheKey, async () => {
        const upstream = await fetch(target, { redirect: 'follow' });
        return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
      }, 600);
    }
    const headers = {};
    const range = request.headers.get('Range');
    if (range) headers.Range = range;
    const upstream = await fetch(target, { headers, redirect: 'follow' });
    return pass(upstream, ['content-type', 'content-length', 'content-range', 'accept-ranges']);
  }

  // ─── 网易云音乐搜索（特殊处理，GET 转 POST）───
  if (route[0] === 'netease') {
    const action = route[1] || '';
    return handleNetease(action, url);
  }

  // ─── QQ 音乐（特殊处理）───
  if (route[0] === 'qqmusic') {
    const action = route[1] || '';
    return handleQQMusic(action, url);
  }

  // ─── Spotify（注入 Token）───
  if (route[0] === 'spotify') {
    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: '未配置 SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const token = await getSpotifyToken(env);
    if (!token) {
      return new Response(JSON.stringify({ error: 'Spotify Token 获取失败，请检查 Client ID/Secret' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const target = new URL('https://api.spotify.com/v1/' + route.slice(1).join('/'));
    url.searchParams.forEach((v, k) => target.searchParams.append(k, v));
    const cacheKey = new Request(request.url, { method: 'GET' });
    const upstream = await cachedFetch(cacheKey, () =>
      fetchWithTimeout(target.toString(), {
        headers: {
          'Authorization': 'Bearer ' + token,
          'User-Agent': 'airbeat/1.0',
        },
      })
    , 300);
    return pass(upstream, ['content-type']);
  }

  // ─── Last.fm（注入 api_key + format=json）───
  if (route[0] === 'lastfm') {
    if (!env.LASTFM_API_KEY) {
      return new Response(JSON.stringify({ error: '未配置 LASTFM_API_KEY' }), {
        status: 501,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const target = new URL('https://ws.audioscrobbler.com/2.0/');
    url.searchParams.forEach((v, k) => target.searchParams.append(k, v));
    target.searchParams.set('api_key', env.LASTFM_API_KEY);
    target.searchParams.set('format', 'json');
    const cacheKey = new Request(request.url, { method: 'GET' });
    const upstream = await cachedFetch(cacheKey, () =>
      fetchWithTimeout(target.toString(), { headers: { 'User-Agent': 'airbeat/1.0' } })
    , 300);
    return pass(upstream, ['content-type']);
  }

  // ─── MusicBrainz（注入 User-Agent + fmt=json）───
  if (route[0] === 'musicbrainz') {
    const target = new URL('https://musicbrainz.org/ws/2/' + route.slice(1).join('/'));
    url.searchParams.forEach((v, k) => target.searchParams.append(k, v));
    target.searchParams.set('fmt', 'json');
    const cacheKey = new Request(request.url, { method: 'GET' });
    const upstream = await cachedFetch(cacheKey, () =>
      fetchWithTimeout(target.toString(), {
        headers: { 'User-Agent': 'AirBeat/1.0 (https://github.com/821920046/AirBeat)' },
      })
    , 300);
    return pass(upstream, ['content-type']);
  }

  // ─── JioSaavn（无需 Key，直连）───
  if (route[0] === 'jiosaavn') {
    const target = new URL('https://saavn.dev/api/' + route.slice(1).join('/'));
    url.searchParams.forEach((v, k) => target.searchParams.append(k, v));
    const cacheKey = new Request(request.url, { method: 'GET' });
    const upstream = await cachedFetch(cacheKey, () =>
      fetchWithTimeout(target.toString(), { headers: { 'User-Agent': 'airbeat/1.0' } })
    , 300);
    return pass(upstream, ['content-type']);
  }

  // ─── 通用路由（jamendo / audius / deezer / archive / radio / lrclib）───
  const base = SOURCES[route[0]];
  if (!base) return new Response('unknown source', { status: 404 });
  if (route[0] === 'jamendo' && !env.JAMENDO_CLIENT_ID) {
    return new Response(JSON.stringify({ error: '未配置 JAMENDO_CLIENT_ID' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const target = new URL(base + '/' + route.slice(1).join('/'));
  url.searchParams.forEach((v, k) => target.searchParams.append(k, v));
  if (route[0] === 'jamendo') target.searchParams.set('client_id', env.JAMENDO_CLIENT_ID);
  if (route[0] === 'audius') target.searchParams.set('app_name', 'airbeat');

  // 搜索结果 / 榜单缓存 5 分钟
  const isSearchOrChart = /\/search|\/chart|\/tracks\/\?|\/stations\/search|\/stations\/topvote/.test(url.pathname + url.search);
  const ttl = isSearchOrChart ? 300 : 60;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const upstream = await cachedFetch(cacheKey, () => fetchWithTimeout(target.toString(), {
    headers: { 'User-Agent': 'airbeat/1.0' },
  }), ttl);
  return pass(upstream, ['content-type']);
}

/** 网易云音乐搜索代理 */
async function handleNetease(action, url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://music.163.com/',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json, text/plain, */*',
  };

  if (action === 'search') {
    const q = url.searchParams.get('q') || '';
    const limit = url.searchParams.get('limit') || '20';
    const body = new URLSearchParams({
      s: q,
      type: '1', // 1=单曲
      limit,
      offset: '0',
    });
    try {
      const upstream = await fetchWithTimeout('https://music.163.com/api/search/pc', {
        method: 'POST',
        headers,
        body: body.toString(),
      }, 8000);
      const data = await upstream.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '网易云音乐不可达: ' + err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  if (action === 'trending') {
    // 网易云飙升榜 id=19723756
    try {
      const upstream = await fetchWithTimeout('https://music.163.com/api/playlist/detail?id=19723756', {
        headers,
      }, 8000);
      const data = await upstream.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '网易云热榜不可达: ' + err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  return new Response('unknown netease action', { status: 404 });
}

/** QQ 音乐搜索代理 */
async function handleQQMusic(action, url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://y.qq.com/',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://y.qq.com',
  };

  if (action === 'search') {
    const q = url.searchParams.get('q') || '';
    const num = url.searchParams.get('num') || '20';
    // 使用 QQ 音乐 CGI 搜索接口
    const searchUrl = new URL('https://u.y.qq.com/cgi-bin/musicu.fcg');
    const reqBody = JSON.stringify({
      req_1: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          search_type: 0,
          query: q,
          num_per_page: Number(num),
          page_num: 1,
        },
      },
    });
    searchUrl.searchParams.set('sign', '');
    searchUrl.searchParams.set('data', reqBody);
    try {
      const upstream = await fetchWithTimeout(searchUrl.toString(), { headers }, 8000);
      const data = await upstream.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'QQ音乐不可达: ' + err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  if (action === 'trending') {
    // QQ 音乐热歌榜 id=4
    const rankUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify({
      req_1: {
        module: 'music.musicHall.MusicHallSongList',
        method: 'GetShortVideoOfSongList',
        param: { songListId: 4, IsQueryFromCDN: 0, offset: 0, size: 20 },
      },
    }));
    // 改用稳定的榜单接口
    const chartUrl = `https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?tpl=3&page=detail&date=&ul=1&uin=0&vip=0&topid=4&type=top&platform=h5page&needNewCode=1&format=json`;
    try {
      const upstream = await fetchWithTimeout(chartUrl, { headers }, 8000);
      const data = await upstream.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'QQ音乐热榜不可达: ' + err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  return new Response('unknown qqmusic action', { status: 404 });
}
