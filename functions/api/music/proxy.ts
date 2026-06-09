/**
 * Cloudflare Pages Function — 音频流代理
 * /api/music/proxy → 透传第三方音频流（解决跨域+避免暴露源 URL）
 */
import { CORS, jr } from "./_utils";

export const onRequest: (ctx: { request: Request }) => Promise<Response> = async ({ request }) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl?.trim()) return jr({ error: "url is required" }, 400);

  try {
    const resp = await fetch(targetUrl, {
      headers: { "User-Agent": "AirBeat/1.0", Accept: "*/*" },
    });
    if (!resp.ok && resp.status !== 206) {
      return jr({ error: `Upstream returned ${resp.status}` }, 502);
    }

    const proxiedHeaders = new Headers(CORS);
    proxiedHeaders.set("Content-Type", resp.headers.get("Content-Type") || "audio/mpeg");
    const cl = resp.headers.get("Content-Length");
    if (cl) proxiedHeaders.set("Content-Length", cl);
    proxiedHeaders.set("Accept-Ranges", "bytes");

    return new Response(resp.body, { status: resp.status, headers: proxiedHeaders });
  } catch (err) {
    console.error("music proxy error:", err);
    return jr({ error: String(err) }, 502);
  }
};
