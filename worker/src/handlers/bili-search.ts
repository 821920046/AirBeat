import { searchVideos } from "../lib/bili";
import { jsonResponse, errorResponse } from "../lib/cors";
import type { Env } from "../types";

export async function handleBiliSearch(url: URL, env: Env): Promise<Response> {
  const keyword = url.searchParams.get("keyword");
  const page = parseInt(url.searchParams.get("page") || "1", 10);

  if (!keyword?.trim()) {
    return errorResponse("keyword is required", 400);
  }

  try {
    const result = await searchVideos(env, keyword, page);
    return jsonResponse(result);
  } catch (err) {
    console.error("bili search error:", err);
    return jsonResponse({ total: 0, videos: [] }, 502);
  }
}
