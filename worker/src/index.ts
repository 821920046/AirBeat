import { handleOptions, errorResponse } from "./lib/cors";
import { handleBiliSearch } from "./handlers/bili-search";
import { handleBiliDanmaku } from "./handlers/bili-danmaku";
import { handleBiliAudioUrl } from "./handlers/bili-audio-url";
import { handleBiliProxy } from "./handlers/bili-proxy";
import { handleMusicSearch } from "./handlers/music-search";
import { handleMusicAudioUrl } from "./handlers/music-audio-url";
import { handleMusicProxy } from "./handlers/music-proxy";
import { handleChat } from "./handlers/chat";
import { handleUpload } from "./handlers/upload";
import { handleTracks } from "./handlers/tracks";
import { handleAudio } from "./handlers/audio";
import type { Env } from "./types";

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsResponse = handleOptions(request);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // 多源音乐 API（新）
      if (method === "GET" && path === "/api/music/search") return handleMusicSearch(url, env);
      if (method === "GET" && path === "/api/music/audio-url") return handleMusicAudioUrl(url, env);
      if (method === "GET" && path === "/api/music/proxy") return handleMusicProxy(url);

      // B站相关（弹幕保留，搜索/音频降级为备用）
      if (method === "GET" && path === "/api/bili/search") return handleBiliSearch(url, env);
      if (method === "GET" && path === "/api/bili/danmaku") return handleBiliDanmaku(url, env);
      if (method === "GET" && path === "/api/bili/audio-url") return handleBiliAudioUrl(url, env);
      if (method === "GET" && path === "/api/bili/proxy") return handleBiliProxy(url);

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

export default worker;
