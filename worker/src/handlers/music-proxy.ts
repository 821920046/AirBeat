/**
 * 音频流代理 Handler — GET /api/music/proxy
 *
 * 透传第三方音频流，解决 CORS 问题。
 * 网易云/YouTube 音频 URL 可能有跨域限制，通过 CF Worker 代理流式转发。
 *
 * 查询参数:
 *   url - 目标音频 URL
 */
import { errorResponse, CORS_HEADERS } from "../lib/cors";

export async function handleMusicProxy(url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl?.trim()) {
    return errorResponse("url is required", 400);
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "AirBeat/1.0",
        Accept: "*/*",
        Range: url.searchParams.get("_range") || "",
      },
    });

    if (!resp.ok && resp.status !== 206) {
      return errorResponse(`Upstream returned ${resp.status}`, 502);
    }

    // 流式透传
    const headers = new Headers(CORS_HEADERS);
    const ct = resp.headers.get("Content-Type");
    headers.set("Content-Type", ct || "audio/mpeg");
    const cl = resp.headers.get("Content-Length");
    if (cl) headers.set("Content-Length", cl);
    headers.set("Accept-Ranges", "bytes");

    return new Response(resp.body, {
      status: resp.status,
      headers,
    });
  } catch (err) {
    console.error("music proxy error:", err);
    return errorResponse(String(err), 502);
  }
}
