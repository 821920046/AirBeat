interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }
interface Track { id: string; title: string; author: string; date: string; filename: string; subDir: string; size: number; url: string; bvid?: string; }
interface DBTrackRow { id: number; title: string; author: string; bvid: string | null; r2_key: string; duration: number | null; file_size: number | null; date_added: string; source: string; }

function rowToTrack(row: DBTrackRow): Track { return { id: String(row.id), title: row.title, author: row.author || "", date: row.date_added || "", filename: row.r2_key.split("/").pop() || "", subDir: "", size: row.file_size || 0, url: `/audio/${row.r2_key}`, bvid: row.bvid || undefined }; }

async function insertTrack(env: Env, track: { title: string; author: string; bvid?: string; r2_key: string; file_size: number; duration?: number }): Promise<Track> {
  const result = await env.DB.prepare("INSERT INTO tracks (title, author, bvid, r2_key, file_size, duration, source) VALUES (?, ?, ?, ?, ?, ?, 'bili')").bind(track.title, track.author || "", track.bvid || null, track.r2_key, track.file_size, track.duration || null).run();
  const id = result.meta.last_row_id as number;
  const row = await env.DB.prepare("SELECT * FROM tracks WHERE id = ?").bind(id).first<DBTrackRow>();
  if (!row) throw new Error("Failed to insert track");
  return rowToTrack(row);
}

function sanitizeFilename(s: string): string { return s.replace(/[-|]/g, "_").replace(/[【】「」:\/\\*?"<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 120); }

function jr(d: unknown, s = 200): Response { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } }); }
function er(m: string, s = 500): Response { return jr({ error: m }, s); }

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    const formData = await request.formData(); const file = formData.get("file"); const title = (formData.get("title") as string) || "untitled"; const author = (formData.get("author") as string) || ""; const bvid = (formData.get("bvid") as string) || undefined;
    if (!file || !(file instanceof File)) return er("file is required", 400);
    const r2Key = `audio/${Date.now()}_${sanitizeFilename(title)}.mp3`;
    const arrayBuffer = await file.arrayBuffer();
    await env.AUDIO_BUCKET.put(r2Key, arrayBuffer, { httpMetadata: { contentType: "audio/mpeg" } });
    return jr(await insertTrack(env, { title, author, bvid, r2_key: r2Key, file_size: arrayBuffer.byteLength }));
  } catch (err) { console.error("upload error:", err); return er(String(err), 500); }
};
