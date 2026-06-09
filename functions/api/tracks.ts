interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }
interface Track { id: string; title: string; author: string; date: string; filename: string; subDir: string; size: number; url: string; bvid?: string; }
interface DBTrackRow { id: number; title: string; author: string; bvid: string | null; r2_key: string; duration: number | null; file_size: number | null; date_added: string; source: string; }

function rowToTrack(row: DBTrackRow): Track { return { ...row, id: String(row.id), url: `/audio/${row.r2_key.replace(/^audio\//, "")}`, filename: row.r2_key.split("/").pop() || "", bvid: row.bvid || undefined }; }

async function searchTracks(env: Env, query: string, limit = 20): Promise<{ total: number; tracks: Track[] }> {
  if (!query.trim()) { const rows = await env.DB.prepare("SELECT * FROM tracks ORDER BY date_added DESC LIMIT ?").bind(limit).all<DBTrackRow>(); return { total: rows.results.length, tracks: rows.results.map(rowToTrack) }; }
  const like = `%${query}%`;
  const countRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM tracks WHERE title LIKE ? OR author LIKE ?").bind(like, like).first<{ cnt: number }>();
  const rows = await env.DB.prepare("SELECT * FROM tracks WHERE title LIKE ? OR author LIKE ? ORDER BY date_added DESC LIMIT ?").bind(like, like, limit).all<DBTrackRow>();
  return { total: countRow?.cnt || 0, tracks: rows.results.map(rowToTrack) };
}

function jr(d: unknown, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } }); }
function er(m: string, s = 500): Response { return jr({ error: m }, s); }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url); const q = url.searchParams.get("q") || ""; const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  try { return jr(await searchTracks(env, q, Math.min(limit, 100))); }
  catch (err) { console.error("tracks error:", err); return er(String(err), 500); }
};
