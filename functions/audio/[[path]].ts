interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length" };
function er(m: string, s = 500): Response { return new Response(JSON.stringify({ error: m }), { s, headers: { "Content-Type": "application/json", ...CORS } } as ResponseInit); }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url); const r2Key = decodeURIComponent(url.pathname.slice("/audio/".length));
  if (!r2Key || r2Key.includes("..")) return er("Invalid path", 400);
  const rangeHeader = request.headers.get("Range");
  try {
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/); if (!match) return er("Invalid Range header", 400);
      const offset = parseInt(match[1]!, 10); const endStr = match[2]; const length = endStr ? parseInt(endStr, 10) - offset + 1 : undefined;
      const object = await env.AUDIO_BUCKET.get(r2Key, { range: { offset, length } }); if (!object) return er("Not found", 404);
      const headers = new Headers(CORS); headers.set("Content-Type", "audio/mpeg"); headers.set("Accept-Ranges", "bytes");
      if (object.range) { const total = object.size; const start = object.range.offset; const end = start + (object.range.length || 0) - 1; headers.set("Content-Range", `bytes ${start}-${end}/${total}`); headers.set("Content-Length", String(object.range.length)); return new Response(object.body, { status: 206, headers }); }
      return new Response(object.body, { status: 200, headers });
    }
    const object = await env.AUDIO_BUCKET.get(r2Key); if (!object) return er("Not found", 404);
    const headers = new Headers(CORS); headers.set("Content-Type", "audio/mpeg"); headers.set("Accept-Ranges", "bytes"); headers.set("Content-Length", String(object.size));
    return new Response(object.body, { status: 200, headers });
  } catch (err) { console.error("audio streaming error:", err); return er(String(err), 500); }
};
