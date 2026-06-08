/**
 * Cloudflare Pages Function — 多源音乐 API 代理
 * /api/music/search    → 搜索歌曲（网易云>B站降级）
 * /api/music/audio-url → 获取音频流 URL
 * /api/music/proxy     → 音频流代理（透传）
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

interface Env {
  MUSIC_API_BASE?: string;
}

export const onRequestOptions = () => new Response(null, { headers: CORS });

function jr(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// --- 网易云搜索 ---
async function neteaseSearch(apiBase: string, query: string, limit: number) {
  const url = `${apiBase}/search?${new URLSearchParams({ keywords: query, type: "1", limit: String(limit) })}`;
  const resp = await fetch(url, { headers: { "User-Agent": "AirBeat/1.0" } });
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

// --- 主路由 ---
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // --- /api/music/search ---
    if (path === "/api/music/search") {
      const query = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "10", 10);
      if (!query?.trim()) return jr({ error: "q is required" }, 400);

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
    }

    // --- /api/music/audio-url ---
    if (path === "/api/music/audio-url") {
      const trackId = url.searchParams.get("id");
      const source = url.searchParams.get("source") || "netease";
      if (!trackId?.trim()) return jr({ error: "id is required" }, 400);

      if (source === "netease") {
        if (!env.MUSIC_API_BASE) {
          return jr({ error: "Netease source 未配置: 请在 Cloudflare Pages 环境变量中设置 MUSIC_API_BASE", source }, 503);
        }
        const ncmResp = await fetch(`${env.MUSIC_API_BASE}/song/url?id=${trackId}&br=320000`, {
          headers: { "User-Agent": "AirBeat/1.0" },
        });
        if (!ncmResp.ok) return jr({ error: `Netease HTTP ${ncmResp.status}` }, 502);
        const json = (await ncmResp.json()) as {
          code: number;
          data?: Array<{ url?: string }>;
        };
        if (json.code === 200 && json.data?.[0]?.url) {
          return jr({ audioUrl: json.data[0].url, source: "netease" });
        }
        return jr({ error: `No playable URL for track ${trackId}` }, 502);
      }

      if (source === "bilibili") {
        // B站音频URL需要在Worker层获取（需要WBI签名+buvid3）
        // 这里简单返回错误，实际应由前端走旧的 /api/bili/audio-url
        return jr({ error: "B站音频请使用 /api/bili/audio-url" }, 400);
      }

      return jr({ error: `Unsupported source: ${source}` }, 400);
    }

    // --- /api/music/proxy ---
    if (path === "/api/music/proxy") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl?.trim()) return jr({ error: "url is required" }, 400);

      const resp = await fetch(targetUrl, {
        headers: { "User-Agent": "AirBeat/1.0", Accept: "*/*" },
      });
      if (!resp.ok && resp.status !== 206) {
        return jr({ error: `Upstream returned ${resp.status}` }, 502);
      }

      const proxiedHeaders = new Headers(CORS);
      proxiedHeaders.set("Content-Type", resp.headers.get("Content-Type") || "audio/mpeg");
      const cl = resp.headers.get("Content-Length");
      if (cl) proxiedHeaders.set("Content-Length", cl);
      proxiedHeaders.set("Accept-Ranges", "bytes");

      return new Response(resp.body, { status: resp.status, headers: proxiedHeaders });
    }

    return jr({ error: "Unknown music endpoint" }, 404);
  } catch (err) {
    console.error("music proxy error:", err);
    return jr({ error: String(err) }, 502);
  }
};
