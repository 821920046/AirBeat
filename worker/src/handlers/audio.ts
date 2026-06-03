import { CORS_HEADERS, errorResponse } from "../lib/cors";
import type { Env } from "../types";

export async function handleAudio(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // /audio/ 去掉前缀得到 R2 key
  const r2Key = decodeURIComponent(url.pathname.slice("/audio/".length));

  if (!r2Key || r2Key.includes("..")) {
    return errorResponse("Invalid path", 400);
  }

  const rangeHeader = request.headers.get("Range");

  try {
    if (rangeHeader) {
      const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
      if (!match) return errorResponse("Invalid Range header", 400);

      const offset = parseInt(match[1]!, 10);
      const requestedEnd = match[2] ? parseInt(match[2], 10) : undefined;
      if (!Number.isFinite(offset) || (requestedEnd !== undefined && requestedEnd < offset)) {
        return errorResponse("Invalid Range header", 400);
      }

      const head = await env.AUDIO_BUCKET.head(r2Key);
      if (!head) return errorResponse("Not found", 404);

      const headers = new Headers(CORS_HEADERS);
      headers.set("Content-Type", "audio/mpeg");
      headers.set("Accept-Ranges", "bytes");

      const total = head.size;
      if (offset >= total) {
        headers.set("Content-Range", `bytes */${total}`);
        return new Response(null, { status: 416, headers });
      }

      const end = requestedEnd === undefined ? total - 1 : Math.min(requestedEnd, total - 1);
      const length = end - offset + 1;
      const object = await env.AUDIO_BUCKET.get(r2Key, {
        range: { offset, length },
      });

      if (!object) return errorResponse("Not found", 404);

      headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
      headers.set("Content-Length", String(length));

      return new Response(object.body, { status: 206, headers });
    }

    // 无 Range 请求
    const object = await env.AUDIO_BUCKET.get(r2Key);
    if (!object) return errorResponse("Not found", 404);

    const headers = new Headers(CORS_HEADERS);
    headers.set("Content-Type", "audio/mpeg");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", String(object.size));

    return new Response(object.body, { status: 200, headers });
  } catch (err) {
    console.error("audio streaming error:", err);
    return errorResponse(String(err), 500);
  }
}
