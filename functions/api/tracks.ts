import { searchTracks } from "../../_lib/db";
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
  const q = url.searchParams.get("q") || "";
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  try {
    const result = await searchTracks(env, q, Math.min(limit, 100));
    return jsonResponse(result);
  } catch (err) {
    console.error("tracks error:", err);
    return errorResponse(String(err), 500);
  }
};
