import { getVideoInfo, getDanmaku } from "../lib/bili";
import { jsonResponse, errorResponse } from "../lib/cors";
import type { Env } from "../types";

export async function handleBiliDanmaku(url: URL, env: Env): Promise<Response> {
  const bvid = url.searchParams.get("bvid");

  if (!bvid?.trim()) {
    return errorResponse("bvid is required", 400);
  }

  try {
    const { cid } = await getVideoInfo(env, bvid);
    const danmaku = await getDanmaku(env, cid);
    return jsonResponse({ bvid, cid, danmaku });
  } catch (err) {
    console.error("bili danmaku error:", err);
    return errorResponse(String(err), 502);
  }
}
