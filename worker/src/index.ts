import { handleOptions, errorResponse } from "./lib/cors";
import { handleBiliSearch } from "./handlers/bili-search";
import { handleBiliDanmaku } from "./handlers/bili-danmaku";
import { handleBiliAudioUrl } from "./handlers/bili-audio-url";
import { handleBiliProxy } from "./handlers/bili-proxy";
import { handleChat } from "./handlers/chat";
import { handleUpload } from "./handlers/upload";
import { handleTracks } from "./handlers/tracks";
import { handleAudio } from "./handlers/audio";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsResponse = handleOptions(request);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // B站相关
      if (method === "GET" && path === "/api/bili/search") return handleBiliSearch(url, env);
      if (method === "GET" && path === "/api/bili/danmaku") return handleBiliDanmaku(url, env);
      if (method === "GET" && path === "/api/bili/audio-url") return handleBiliAudioUrl(url, env);
      if (method === "GET" && path === "/api/bili/proxy") return handleBiliProxy(url, env);

      // AI 对话
      if (method === "POST" && path === "/api/chat") return handleChat(request, env);

      // 曲目管理
      if (method === "GET" && path === "/api/tracks") return handleTracks(url, env);
      if (method === "POST" && path === "/api/upload") return handleUpload(request, env);

      // R2 音频流
      if (method === "GET" && path.startsWith("/audio/")) return handleAudio(request, env);

      return errorResponse("Not Found", 404);
    } catch (err) {
      console.error("Worker error:", err);
      return errorResponse(String(err));
    }
  },
};
