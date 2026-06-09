import type { Env, Track } from "../types";

interface DBTrackRow {
  id: number;
  title: string;
  author: string;
  bvid: string | null;
  r2_key: string;
  duration: number | null;
  file_size: number | null;
  date_added: string;
  source: string;
}

function rowToTrack(row: DBTrackRow): Track {
  const sec = row.duration || 0;
  const durStr = sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : "";
  return {
    id: String(row.id),
    title: row.title,
    author: row.author || "",
    date: row.date_added || "",
    filename: row.r2_key.split("/").pop() || "",
    subDir: "",
    size: row.file_size || 0,
    // r2_key 格式为 "audio/ts_title.ext"，去掉前缀的 "audio/" 避免 /audio/audio/ 双重路由
    url: `/audio/${row.r2_key.replace(/^audio\//, "")}`,
    bvid: row.bvid || undefined,
    duration: sec,
    source: "local",
    artist: row.author || "",
  };
}

export async function insertTrack(
  env: Env,
  track: { title: string; author: string; bvid?: string; r2_key: string; file_size: number; duration?: number }
): Promise<Track> {
  const result = await env.DB.prepare(
    "INSERT INTO tracks (title, author, bvid, r2_key, file_size, duration, source) VALUES (?, ?, ?, ?, ?, ?, 'bili')"
  )
    .bind(track.title, track.author || "", track.bvid || null, track.r2_key, track.file_size, track.duration || null)
    .run();

  const id = result.meta.last_row_id as number;
  const row = await env.DB.prepare("SELECT * FROM tracks WHERE id = ?").bind(id).first<DBTrackRow>();
  if (!row) throw new Error("Failed to insert track");
  return rowToTrack(row);
}

export async function searchTracks(env: Env, query: string, limit = 20): Promise<{ total: number; tracks: Track[] }> {
  if (!query.trim()) {
    const rows = await env.DB.prepare("SELECT * FROM tracks ORDER BY date_added DESC LIMIT ?")
      .bind(limit)
      .all<DBTrackRow>();
    return { total: rows.results.length, tracks: rows.results.map(rowToTrack) };
  }

  const like = `%${query}%`;
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM tracks WHERE title LIKE ? OR author LIKE ?"
  )
    .bind(like, like)
    .first<{ cnt: number }>();

  const rows = await env.DB.prepare(
    "SELECT * FROM tracks WHERE title LIKE ? OR author LIKE ? ORDER BY date_added DESC LIMIT ?"
  )
    .bind(like, like, limit)
    .all<DBTrackRow>();

  return {
    total: countRow?.cnt || 0,
    tracks: rows.results.map(rowToTrack),
  };
}

export async function getTrack(env: Env, id: number): Promise<Track | null> {
  const row = await env.DB.prepare("SELECT * FROM tracks WHERE id = ?").bind(id).first<DBTrackRow>();
  return row ? rowToTrack(row) : null;
}

export async function getTrackByBvid(env: Env, bvid: string): Promise<Track | null> {
  const row = await env.DB.prepare("SELECT * FROM tracks WHERE bvid = ?").bind(bvid).first<DBTrackRow>();
  return row ? rowToTrack(row) : null;
}
