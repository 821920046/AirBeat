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

  // Test 3: B站 nav API (with buvid3)
  try {
    const cookies = (await fetch("https://www.bilibili.com", { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" })).headers.getSetCookie?.() ?? [];
    const buvid3Cookie = cookies.map(c => c.match(/buvid3=([^;]+)/)).filter(Boolean).map(m => m![1])[0] || "";
    results.buvid3_value = buvid3Cookie.slice(0, 30) + "...";

    const navRes = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Referer: "https://www.bilibili.com/", Cookie: `buvid3=${buvid3Cookie}` },
    });
    results.nav_status = navRes.status;
    const navText = await navRes.text();
    results.nav_body = navText.slice(0, 300);
  } catch (e) { results.nav_error = String(e); }

  return new Response(JSON.stringify(results, null, 2), { headers: { "Content-Type": "application/json" } });
};
