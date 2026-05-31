import { getVideoInfo, getDanmaku } from "../../_lib/bili";
import { jsonResponse, errorResponse, handleOptions } from "../../_lib/cors";
import type { Env } from "../../_lib/types";

export const onRequestOptions = ({ request }: { request: Request }) => handleOptions(request);

export const onRequestGet = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => {
  const url = new URL(request.url);
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
};
