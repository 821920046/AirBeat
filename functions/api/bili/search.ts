import { searchVideos } from "../../_lib/bili";
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
};
