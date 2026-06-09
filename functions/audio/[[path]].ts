interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length" };
function er(m: string, s = 500): Response { return new Response(JSON.stringify({ error: m }), { status: s, headers: { "Content-Type": "application/json", ...CORS } }); }

function audioHeaders(contentType = "audio/mpeg"): Headers {
  const headers = new Headers(CORS);
  headers.set("Content-Type", contentType);
  headers.set("Accept-Ranges", "bytes");
  return headers;
}

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  // /audio/ 去掉前缀得到纯文件名，R2 key 格式为 "audio/xxx.ext"
  const r2Key = "audio/" + decodeURIComponent(url.pathname.slice("/audio/".length));
  if (!r2Key || r2Key.includes("..")) return er("Invalid path", 400);

  const rangeHeader = request.headers.get("Range");

  try {
    if (rangeHeader) {
      const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
      if (!match) return er("Invalid Range header", 400);

      const offset = parseInt(match[1]!, 10);
      const requestedEnd = match[2] ? parseInt(match[2], 10) : undefined;
      if (!Number.isFinite(offset) || (requestedEnd !== undefined && requestedEnd < offset)) {
        return er("Invalid Range header", 400);
      }

      const head = await env.AUDIO_BUCKET.head(r2Key);
      if (!head) return er("Not found", 404);

      const total = head.size;
      const contentType = head?.httpMetadata?.contentType || "audio/mpeg";
      const headers = audioHeaders(contentType);
      if (offset >= total) {
        headers.set("Content-Range", `bytes */${total}`);
        return new Response(null, { status: 416, headers });
      }

      const end = requestedEnd === undefined ? total - 1 : Math.min(requestedEnd, total - 1);
      const length = end - offset + 1;
      const object = await env.AUDIO_BUCKET.get(r2Key, { range: { offset, length } });
      if (!object) return er("Not found", 404);

      headers.set("Content-Range", `bytes ${offset}-${end}/${total}`);
      headers.set("Content-Length", String(length));
      return new Response(object.body, { status: 206, headers });
    }

    const object = await env.AUDIO_BUCKET.get(r2Key);
    if (!object) return er("Not found", 404);

    const contentType = object.httpMetadata?.contentType || "audio/mpeg";
    const headers = audioHeaders(contentType);
    headers.set("Content-Length", String(object.size));
    return new Response(object.body, { status: 200, headers });
  } catch (err) { console.error("audio streaming error:", err); return er(String(err), 500); }
};
