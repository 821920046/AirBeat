interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const bvid = url.searchParams.get("bvid") || "BV1GJ411x7h7";
  const keyword = url.searchParams.get("q") || "千里之外";

  const results: Record<string, unknown> = {};

  // Test 1: KV
  try { await env.CACHE.put("_test", "ok"); const v = await env.CACHE.get("_test"); results.kv = v === "ok" ? "OK" : `FAIL: got ${v}`; await env.CACHE.delete("_test"); } catch (e) { results.kv = `ERROR: ${e}`; }

  // Test 2: buvid3 - 多种方式
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const FULL_HEADERS = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", "Accept-Encoding": "gzip, deflate, br", "Cache-Control": "no-cache", "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none", "Sec-Fetch-User": "?1", "Upgrade-Insecure-Requests": "1" };

  try { const r = await fetch("https://www.bilibili.com", { headers: FULL_HEADERS, redirect: "follow" }); results.main_status = r.status; results.main_cookies = r.headers.getSetCookie?.().length ?? 0; } catch (e) { results.main_error = String(e); }

  // 尝试用 SPI 接口获取 buvid3
  try { const r = await fetch("https://api.bilibili.com/x/frontend/finger/spi", { headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" } }); const j = await r.json() as Record<string, unknown>; results.spi_status = r.status; results.spi = JSON.stringify(j).slice(0, 200); } catch (e) { results.spi_error = String(e); }

  // 尝试直接用 WBI（不带 buvid3）
  try { const r = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/", Origin: "https://www.bilibili.com" } }); results.nav2_status = r.status; const t = await r.text(); results.nav2_body = t.slice(0, 200); } catch (e) { results.nav2_error = String(e); }

  return new Response(JSON.stringify(results, null, 2), { headers: { "Content-Type": "application/json" } });
};
