/**
 * Cloudflare Pages Function — B站 弹幕代理
 * CF 数据中心 IP 被 B站 API 412，但弹幕接口 (list.so) 是 CDN，不会被封
 * 以防万一，带上完整的浏览器 UA
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface Env {
  CACHE: KVNamespace;
}

async function ensureBuvid3(env: Env): Promise<string> {
  const cached = await env.CACHE.get("buvid3");
  if (cached) return cached;
  try {
    const res = await fetch("https://www.bilibili.com", {
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    const cookies = (res.headers as any).getSetCookie?.() ?? [];
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) cookies.push(setCookie);
    for (const c of cookies) {
      const m = (c as string).match(/buvid3=([^;]+)/);
      if (m) { await env.CACHE.put("buvid3", m[1]!, { expirationTtl: 86400 }); return m[1]!; }
    }
  } catch {}
  const fallback = `${crypto.randomUUID()}infoc`;
  await env.CACHE.put("buvid3", fallback, { expirationTtl: 86400 });
  return fallback;
}

export const onRequestOptions = () => new Response(null, { headers: CORS });

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const cid = url.searchParams.get("cid");
  if (!cid) return new Response(JSON.stringify({ error: "cid required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const buvid3 = await ensureBuvid3(env);
    const resp = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${encodeURIComponent(cid)}`, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.bilibili.com/",
        Cookie: `buvid3=${buvid3}`,
      },
    });
    if (!resp.ok) return new Response(JSON.stringify({ error: `B站 returned ${resp.status}` }), { status: resp.status, headers: { ...CORS, "Content-Type": "application/json" } });

    const xml = await resp.text();
    return new Response(xml, {
      headers: { ...CORS, "Content-Type": "application/xml" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  }
};
