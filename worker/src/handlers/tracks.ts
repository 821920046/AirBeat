import { searchTracks } from "../lib/db";
import { jsonResponse, errorResponse } from "../lib/cors";
import type { Env } from "../types";

export async function handleTracks(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get("q") || "";
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  try {
    const result = await searchTracks(env, q, Math.min(limit, 100));
    return jsonResponse(result);
  } catch (err) {
    console.error("tracks error:", err);
    return errorResponse(String(err), 500);
  }
}
