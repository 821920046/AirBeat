/**
 * Cloudflare Pages Function — 多源音乐搜索
 * /api/music/search → 搜索歌曲（网易云>B站降级）
 *
 * audio-url 和 proxy 由 Worker 唯一处理，不在此实现。
 */
import { CORS, jr } from "./_utils";

interface Env {
  MUSIC_API_BASE?: string;
}

export const onRequest: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

  if (!query?.trim()) return jr({ error: "q is required" }, 400);

  try {
    // 优先网易云
    if (env.MUSIC_API_BASE) {
      try {
        const tracks = await neteaseSearch(env.MUSIC_API_BASE, query, limit);
        if (tracks.length > 0) return jr({ tracks, usedSource: "netease", query });
      } catch (err) {
        console.warn("[music] netease search failed:", err);
      }
    }

    // 降级：Google + B站
    try {
      const tracks = await biliGoogleSearch(query, limit);
      return jr({ tracks, usedSource: "bilibili", query });
    } catch (err) {
      console.warn("[music] bili search failed:", err);
      return jr({ tracks: [], usedSource: "none", query, error: String(err) });
    }
  } catch (err) {
    console.error("music search error:", err);
    return jr({ error: String(err) }, 502);
  }
};

// --- 网易云搜索 ---
async function neteaseSearch(apiBase: string, query: string, limit: number) {
  const u = `${apiBase}/search?${new URLSearchParams({ keywords: query, type: "1", limit: String(limit) })}`;
  const resp = await fetch(u, { headers: { "User-Agent": "AirBeat/1.0" } });
  if (!resp.ok) throw new Error(`Netease HTTP ${resp.status}`);
  const json = (await resp.json()) as {
    code: number;
    result?: { songs?: Array<{ id: number; name: string; ar?: Array<{ name: string }>; dt?: number; al?: { picUrl?: string } }> };
  };
  if (json.code !== 200 || !json.result?.songs?.length) return [];
  return json.result.songs.map(s => {
    const sec = Math.floor((s.dt || 0) / 1000);
    return {
      id: String(s.id),
      title: s.name,
      artist: s.ar?.map(a => a.name).join("/") || "未知",
      duration: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`,
      source: "netease",
      url: `https://music.163.com/song?id=${s.id}`,
      thumbnail: s.al?.picUrl || undefined,
    };
  });
}

// --- B站 Google 搜索降级 ---
async function biliGoogleSearch(query: string, limit: number) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent("site:bilibili.com " + query)}&num=${limit}`;
  const resp = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
  });
  if (!resp.ok) throw new Error(`Google HTTP ${resp.status}`);
  const html = await resp.text();

  const bvRe = /bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/g;
  const bvMatches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = bvRe.exec(html)) !== null) bvMatches.add(m[1]!);

  const titleRe = /<h3[^>]*>([^<]+(?:<[^/][^>]*>[^<]*)*?)<\/h3>/gi;
  const titles: string[] = [];
  let tm: RegExpExecArray | null;
  while ((tm = titleRe.exec(html)) !== null) {
    const clean = tm[1]!.replace(/<[^>]*>/g, "").trim();
    if (clean && !clean.includes("Google") && !clean.includes("Search")) titles.push(clean);
  }

  const bvids = [...bvMatches].slice(0, limit);
  return bvids.map((bv, i) => ({
    id: bv,
    title: titles[i] || "(搜索结果)",
    artist: "",
    duration: "",
    source: "bilibili",
    url: `https://www.bilibili.com/video/${bv}`,
  }));
}
