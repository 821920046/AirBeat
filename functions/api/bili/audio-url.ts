import { getVideoInfo, getAudioUrl } from "../../_lib/bili";
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
    const { cid, title } = await getVideoInfo(env, bvid);
    const audioUrl = await getAudioUrl(env, bvid, cid);
    return jsonResponse({ bvid, cid, title, audioUrl });
  } catch (err) {
    console.error("bili audio-url error:", err);
    return errorResponse(String(err), 502);
  }
};
