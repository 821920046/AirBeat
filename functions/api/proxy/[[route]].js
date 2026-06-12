const SOURCES = {
  jamendo: 'https://api.jamendo.com/v3.0',
  audius: 'https://discoveryprovider.audius.co/v1',
  itunes: 'https://itunes.apple.com',
  deezer: 'https://api.deezer.com',
  archive: 'https://archive.org',
  radio: 'https://de1.api.radio-browser.info/json',
  lrclib: 'https://lrclib.net/api',
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
    if (res.ok) {
      try {
        const toCache = new Response(res.body, res);
        toCache.headers.set('Cache-Control', 'public, max-age=' + ttl);
        await cache.put(key, toCache);
      } catch { /* 缓存写入失败不阻塞响应 */ }
    }
    return res;
  } catch (err) {
    // 上游请求失败（DNS 解析失败 / 连接超时）→ 返回 502 而不是让整个请求 500
    return new Response(JSON.stringify({ error: '上游音源不可达: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function onRequestGet({ request, env, params }) {
  const route = params.route || [];
  const url = new URL(request.url);

  // 音频/图片流式代理:/api/proxy/stream?url=...(同源化,保证可视化与混合内容可用)
  if (route[0] === 'stream') {
    const target = url.searchParams.get('url') || '';
    if (!/^https?:\/\//.test(target)) return new Response('bad url', { status: 400 });
    // 封面图片缓存 10 分钟，音频流不缓存（Range 请求兼容）
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

  // 搜索结果 / 榜单缓存 5 分钟（规避音源限流 + 加速）
  const isSearchOrChart = /\/search|\/chart|\/tracks\/\?|\/stations\/search|\/stations\/topvote/.test(url.pathname + url.search);
  const ttl = isSearchOrChart ? 300 : 60;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const upstream = await cachedFetch(cacheKey, () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // 8 秒超时
    return fetch(target.toString(), { headers: { 'User-Agent': 'airbeat/1.0' }, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }, ttl);
  return pass(upstream, ['content-type']);
}
