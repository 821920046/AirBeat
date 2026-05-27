import { getVideoInfo, getAudioUrl } from "../lib/bili";
import { jsonResponse, errorResponse } from "../lib/cors";
import type { Env } from "../types";

export async function handleBiliAudioUrl(url: URL, env: Env): Promise<Response> {
  const bvid = url.searchParams.get("bvid");

  if (!bvid?.trim()) {
    return errorResponse("bvid is required", 400);
  }

  try {
    const { cid, title } = await getVideoInfo(env, bvid);
    const audioUrl = await getAudioUrl(env, bvid, cid);
    return jsonResponse({ bvid, cid, title, audioUrl });
  } catch (err) {
    console.error("bili audio-url error:", err);
    return errorResponse(String(err), 502);
  }
}
