/**
 * 多源音乐搜索 Handler — GET /api/music/search
 *
 * 查询参数:
 *   q        - 搜索关键词
 *   limit    - 返回数量（默认 10）
 *   source   - 强制使用某个源（可选，默认自动降级）
 */
import { searchMusic } from "../lib/music-sources";
import { createSources } from "./_sources";
import { jsonResponse, errorResponse } from "../lib/cors";
import type { Env } from "../types";

export async function handleMusicSearch(url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get("q");
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const forceSource = url.searchParams.get("source") || undefined;

  if (!query?.trim()) {
    return errorResponse("q (search query) is required", 400);
  }

  try {
    const sources = createSources(env, forceSource);
    const { tracks, usedSource } = await searchMusic(query, sources, limit);
    return jsonResponse({ tracks, usedSource, query });
  } catch (err) {
    console.error("music search error:", err);
    return jsonResponse({ tracks: [], usedSource: "none", error: String(err) }, 502);
  }
}
