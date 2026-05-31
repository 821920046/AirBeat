interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const bvid = url.searchParams.get("bvid") || "BV1GJ411x7h7";
  const keyword = url.searchParams.get("q") || "千里之外";

  const results: Record<string, unknown> = {};

  // Test 1: KV
  try { await env.CACHE.put("_test", "ok"); const v = await env.CACHE.get("_test"); results.kv = v === "ok" ? "OK" : `FAIL: got ${v}`; await env.CACHE.delete("_test"); } catch (e) { results.kv = `ERROR: ${e}`; }

  // Test 2: buvid3
  try {
    const res = await fetch("https://www.bilibili.com", { method: "GET", headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    results.buvid3_status = res.status;
    const cookies = res.headers.getSetCookie?.() ?? [];
    results.buvid3_cookies = cookies.length;
  } catch (e) { results.buvid3_error = String(e); }

  // Test 3: B站 nav API
  try {
    const res = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" } });
    const json = await res.json() as Record<string, unknown>;
    results.nav_status = res.status;
    results.nav_code = json.code;
    results.nav_has_wbi = !!(json.data as Record<string, unknown>)?.wbi_img;
  } catch (e) { results.nav_error = String(e); }

  return new Response(JSON.stringify(results, null, 2), { headers: { "Content-Type": "application/json" } });
};
