/**
 * 前端多源音乐 API 客户端
 *
 * 统一接口，前端不关心音乐来自网易云/YouTube/B站
 * 搜索、获取音频 URL 都通过 CF Pages Functions 代理（/api/music/*）
 *
 * B站弹幕功能保持不变，仍走 /api/bili/*
 */
import { apiUrl } from "./config";

// --- 类型 ---

export type MusicSource = "netease" | "youtube" | "bilibili";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  source: MusicSource;   // 来源标识
  url: string;           // 源页面URL（网易云播放页 / YouTube链接）
  thumbnail?: string;
}

export interface SearchResult {
  tracks: MusicTrack[];
  usedSource: string;
  query: string;
  error?: string;
}

// --- API 函数 ---

/** 多源音乐搜索 — 通过 CF Pages Function 代理 */
export async function searchMusic(query: string, limit = 10): Promise<SearchResult> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const resp = await fetch(apiUrl(`/api/music/search?${params}`), { credentials: "omit" });

  if (!resp.ok) {
    console.error(`[music] search HTTP ${resp.status}`);
    return { tracks: [], usedSource: "none", query, error: `HTTP ${resp.status}` };
  }

  const json = (await resp.json()) as SearchResult;
  return json;
}

/** 获取音频流 URL — 通过 CF Pages Function 代理 */
export async function getAudioUrl(trackId: string, source: MusicSource): Promise<string> {
  const params = new URLSearchParams({ id: trackId, source });
  const resp = await fetch(apiUrl(`/api/music/audio-url?${params}`), { credentials: "omit" });

  if (!resp.ok) throw new Error(`获取音频URL失败: ${resp.status}`);

  const json = (await resp.json()) as { audioUrl?: string; error?: string };
  if (json.error || !json.audioUrl) throw new Error(json.error || "获取音频URL失败");
  return json.audioUrl;
}

/** 通过代理下载音频数据（解决跨域） */
export async function fetchAudioBuffer(audioUrl: string): Promise<ArrayBuffer> {
  const proxyUrl = apiUrl(`/api/music/proxy?${new URLSearchParams({ url: audioUrl })}`);
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`音频下载失败: ${res.status}`);
  return res.arrayBuffer();
}
