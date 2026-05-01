import { readdir, stat } from "fs/promises";
import path from "path";
import type { Track } from "./types";

const MUSIC_DIR = process.env.MUSIC_DIR || path.join(process.env.HOME || "", "Documents/bili");

function isYear(s: string): boolean {
  return /^\d{4}$/.test(s) && s >= "1990" && s <= "2030";
}

function isNum(s: string): boolean {
  return /^\d{1,2}$/.test(s);
}

export function parseName(name: string): { title: string; author: string; date: string } {
  const parts = name.split("-");
  const n = parts.length;

  if (n >= 4) {
    const [y, m, d] = [parts[n - 3], parts[n - 2], parts[n - 1]];
    if (isYear(y) && isNum(m) && isNum(d)) {
      const date = `${y}-${m}-${d}`;
      if (n >= 5) {
        return {
          title: parts.slice(0, n - 4).join("-").trim(),
          author: parts[n - 4].trim(),
          date,
        };
      }
      return { title: parts.slice(0, n - 3).join("-").trim(), author: "", date };
    }
  }

  return { title: name, author: "", date: "" };
}

export async function scanTracks(): Promise<Track[]> {
  const tracks: Track[] = [];

  let dirs;
  try {
    dirs = await readdir(MUSIC_DIR, { withFileTypes: true });
  } catch {
    return tracks;
  }

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const subDir = dir.name;

    let files;
    try {
      files = await readdir(path.join(MUSIC_DIR, subDir), { withFileTypes: true });
    } catch {
      continue;
    }

    for (const f of files) {
      if (f.isDirectory() || !f.name.toLowerCase().endsWith(".mp3")) continue;

      const filePath = path.join(MUSIC_DIR, subDir, f.name);
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
  }

  return tracks;
}

export function resolveMusicPath(relativePath: string): string | null {
  const full = path.resolve(MUSIC_DIR, relativePath);
  if (!full.startsWith(MUSIC_DIR)) return null;
  return full;
}

export { MUSIC_DIR };
