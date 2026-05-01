import { NextRequest } from "next/server";
import { readdir, stat } from "fs/promises";
import path from "path";
import { MUSIC_DIR, parseName } from "@/app/lib/tracks";
import type { Track } from "@/app/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const subDir = req.nextUrl.searchParams.get("subDir")?.trim();
  if (!subDir) {
    return Response.json({ error: "subDir is required" }, { status: 400 });
  }

  const dirPath = path.resolve(MUSIC_DIR, subDir);
  if (!dirPath.startsWith(MUSIC_DIR)) {
    return Response.json({ error: "invalid subDir" }, { status: 403 });
  }

  const tracks: Track[] = [];
  let files;
  try {
    files = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return Response.json({ tracks });
  }

  for (const f of files) {
    if (f.isDirectory() || !f.name.toLowerCase().endsWith(".mp3")) continue;

    const filePath = path.join(dirPath, f.name);
    let size = 0;
    try {
      const s = await stat(filePath);
      size = s.size;
    } catch { /* ignore */ }

    const baseName = f.name.replace(/\.mp3$/i, "");
    const { title, author, date } = parseName(baseName);

    tracks.push({
      id: `${subDir}/${f.name}`,
      title,
      author,
      date,
      filename: f.name,
      subDir,
      size,
      url: `/api/tracks/${encodeURIComponent(subDir)}/${encodeURIComponent(f.name)}`,
    });
  }

  return Response.json({ tracks });
}
