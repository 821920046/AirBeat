import { CORS_HEADERS, errorResponse, handleOptions } from "../../_lib/cors";
import type { Env } from "../../_lib/types";

export const onRequestOptions = ({ request }: { request: Request }) => handleOptions(request);

// 捕获 /audio/ 下所有路径，如 /audio/audio/123_title.mp3
export const onRequestGet = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => {
  const url = new URL(request.url);
  // 从完整路径中提取 R2 key（去掉 /audio/ 前缀）
  const r2Key = decodeURIComponent(url.pathname.slice("/audio/".length));

  if (!r2Key || r2Key.includes("..")) {
    return errorResponse("Invalid path", 400);
  }

  const rangeHeader = request.headers.get("Range");

  try {
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) return errorResponse("Invalid Range header", 400);

      const offset = parseInt(match[1]!, 10);
      const endStr = match[2];
      const length = endStr ? parseInt(endStr, 10) - offset + 1 : undefined;

      const object = await env.AUDIO_BUCKET.get(r2Key, {
        range: { offset, length },
      });

      if (!object) return errorResponse("Not found", 404);

      const headers = new Headers(CORS_HEADERS);
      headers.set("Content-Type", "audio/mpeg");
      headers.set("Accept-Ranges", "bytes");

      if (object.range) {
        const total = object.size;
        const start = object.range.offset;
        const end = start + (object.range.length || 0) - 1;
        headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
        headers.set("Content-Length", String(object.range.length));
        return new Response(object.body, { status: 206, headers });
      }

      return new Response(object.body, { status: 200, headers });
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
};
