/**
 * Cloudflare Pages Function — 多源音乐 API 代理
 * /api/music/search    → 搜索歌曲（网易云>YouTube>B站降级）
 * /api/music/audio-url → 获取音频流 URL
 * /api/music/proxy     → 音频流代理
 *
 * 这些路由在 CF Pages Functions 层做 CORS 包装，
 * 实际逻辑由 backend Worker 处理。
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

export const onRequestOptions = () => new Response(null, { headers: CORS });

export const onRequestGet = async ({ request, env }: { request: Request; env: any }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // 构造 Worker 端 URL
    const workerUrl = new URL(`https://airbeat-api.example.com${url.pathname}${url.search}`);

    let resp: Response;

    if (path === "/api/music/search" || path === "/api/music/audio-url") {
      // JSON API — 直接转发
      resp = await fetch(workerUrl.toString(), {
        headers: {
          "User-Agent": "CF-Pages-Function/1.0",
        },
      });
    } else if (path === "/api/music/proxy") {
      // 音频流代理 — 流式透传
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "url is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }

      resp = await fetch(targetUrl, {
        headers: {
          "User-Agent": "AirBeat/1.0",
          Accept: "*/*",
        },
      });

      if (!resp.ok && resp.status !== 206) {
        return new Response(JSON.stringify({ error: `Upstream returned ${resp.status}` }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }

      const proxiedHeaders = new Headers(CORS);
      proxiedHeaders.set("Content-Type", resp.headers.get("Content-Type") || "audio/mpeg");
      const cl = resp.headers.get("Content-Length");
      if (cl) proxiedHeaders.set("Content-Length", cl);
      proxiedHeaders.set("Accept-Ranges", "bytes");

      return new Response(resp.body, { status: resp.status, headers: proxiedHeaders });
    } else {
      return new Response(JSON.stringify({ error: "Unknown music endpoint" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // 对 JSON 响应加 CORS
    const json = (await resp.json()) as any;
    return new Response(JSON.stringify(json), {
      status: resp.status,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    console.error("music proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
};
