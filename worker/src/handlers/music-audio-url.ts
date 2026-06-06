/**
 * 多源音频 URL 获取 Handler — GET /api/music/audio-url
 *
 * 查询参数:
 *   id      - 歌曲ID（网易云 songId / YouTube videoId / B站 bvid）
 *   source  - 来源标识 (netease | youtube | bilibili)，用于优先匹配
 */
import { getAudioUrl } from "../lib/music-sources";
import { createSources } from "./_sources";
import { jsonResponse, errorResponse } from "../lib/cors";
import type { Env } from "../types";

export async function handleMusicAudioUrl(url: URL, env: Env): Promise<Response> {
  const trackId = url.searchParams.get("id");
  const trackSource = (url.searchParams.get("source") || "netease") as "netease" | "youtube" | "bilibili";

  if (!trackId?.trim()) {
    return errorResponse("id (track ID) is required", 400);
  }

  try {
    const sources = createSources(env);
    const audioUrl = await getAudioUrl(trackId, trackSource, sources);
    return jsonResponse({ audioUrl, source: trackSource });
  } catch (err) {
    console.error("music audio-url error:", err);
    return errorResponse(String(err), 502);
  }
}
