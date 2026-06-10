/**
 * Cloudflare Pages Function — 获取音频流 URL
 * /api/music/audio-url → 直接调用音乐源 API 获取可播放链接
 *
 * 网易云：调用自部署的 NeteaseCloudMusicApiEnhanced
 * YouTube：调用 YouTube API（需要 YOUTUBE_API_BASE 环境变量）
 * B站：降级到 /api/bili/audio-url
 */
import { CORS, jr } from "./_utils";

interface Env {
  MUSIC_API_BASE?: string;
  YOUTUBE_API_BASE?: string;
}

export const onRequest: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(request.url);
  const trackId = url.searchParams.get("id");
  const source = url.searchParams.get("source") || "netease";

  if (!trackId?.trim()) return jr({ error: "id (track ID) is required" }, 400);

  try {
    // 网易云：直接调用自部署 API
    if (source === "netease") {
      if (!env.MUSIC_API_BASE) {
        return jr({ error: "Netease source 未配置: 请在 Cloudflare Pages 环境变量中设置 MUSIC_API_BASE", source }, 503);
      }
      const ncmResp = await fetch(`${env.MUSIC_API_BASE}/song/url?id=${encodeURIComponent(trackId)}&br=320000`, {
        headers: { "User-Agent": "AirBeat/1.0" },
      });
      if (!ncmResp.ok) return jr({ error: `Netease upstream HTTP ${ncmResp.status}` }, 502);
      const json = (await ncmResp.json()) as {
        code: number;
        data?: Array<{ url?: string; br?: number }>;
      };
      if (json.code === 200 && json.data?.[0]?.url) {
        return jr({ audioUrl: json.data[0].url, source: "netease" });
      }
      // 降级到 128kbps 码率
      const fbResp = await fetch(`${env.MUSIC_API_BASE}/song/url?id=${encodeURIComponent(trackId)}&br=128000`, {
        headers: { "User-Agent": "AirBeat/1.0" },
      });
      if (fbResp.ok) {
        const fbJson = (await fbResp.json()) as { code: number; data?: Array<{ url?: string }> };
        if (fbJson.code === 200 && fbJson.data?.[0]?.url) {
          return jr({ audioUrl: fbJson.data[0].url, source: "netease" });
        }
      }
      return jr({ error: `No playable URL for track ${trackId}`, source }, 502);
    }

    // YouTube：调用 YouTube 音频提取 API
    if (source === "youtube") {
      if (!env.YOUTUBE_API_BASE) {
        return jr({ error: "YouTube source 未配置: 请在 Cloudflare Pages 环境变量中设置 YOUTUBE_API_BASE", source }, 503);
      }
      const ytResp = await fetch(`${env.YOUTUBE_API_BASE}/audio-url?id=${encodeURIComponent(trackId)}`, {
        headers: { "User-Agent": "AirBeat/1.0" },
      });
      if (!ytResp.ok) return jr({ error: `YouTube upstream HTTP ${ytResp.status}` }, 502);
      const ytJson = (await ytResp.json()) as { audioUrl?: string };
      if (ytJson.audioUrl) {
        return jr({ audioUrl: ytJson.audioUrl, source: "youtube" });
      }
      return jr({ error: `No audio URL from YouTube for ${trackId}`, source }, 502);
    }

    // B站：降级到 /api/bili/audio-url（Worker 端有 WBI 签名逻辑）
    if (source === "bilibili") {
      return jr({ error: "B站音频请使用 /api/bili/audio-url 端点", source }, 400);
    }

    return jr({ error: `Unsupported source: ${source}` }, 400);
  } catch (err) {
    console.error("[music] audio-url error:", err);
    return jr({ error: String(err) }, 502);
  }
};
