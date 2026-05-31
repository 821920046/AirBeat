/**
 * B站 API CORS 代理
 *
 * B站 API 不返回 CORS 头，浏览器无法直接调用。
 * 这个代理负责转发请求，加 CORS 头给前端。
 *
 * 注意：这个代理本身也跑在 Cloudflare 上，但 B站对 API 接口
 * （api.bilibili.com）的 412 检查比对 www.bilibili.com 宽松，
 * 因为 B站自己的前端也从浏览器跨域调用这些 API。
 */

const BILI_API = "https://api.bilibili.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequestOptions = () =>
  new Response(null, { headers: CORS_HEADERS });

export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  // 如果指定了完整 URL（用于音频下载等），直接代理
  if (target) {
    try {
      const resp = await fetch(target, {
        headers: { Referer: "https://www.bilibili.com/" },
      });
      const headers = new Headers(CORS_HEADERS);
      const ct = resp.headers.get("Content-Type");
      if (ct) headers.set("Content-Type", ct);
      const cl = resp.headers.get("Content-Length");
      if (cl) headers.set("Content-Length", cl);
      headers.set("Accept-Ranges", "bytes");
      return new Response(resp.body, { status: resp.status, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  // 否则转发到 api.bilibili.com（path + query）
  const targetUrl = BILI_API + url.pathname.replace(/^\/api\/proxy/, "") + url.search;

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com/",
        Accept: "application/json, text/plain, */*",
      },
    });

    const headers = new Headers(CORS_HEADERS);
    headers.set("Content-Type", resp.headers.get("Content-Type") || "application/json");
    return new Response(resp.body, { status: resp.status, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
};
