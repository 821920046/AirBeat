/**
 * 音乐源工厂 — 根据 Env 配置创建 MusicSourceClient 实例
 * 被各个 Handler 共享使用，按优先级排序
 */
import { NeteaseClient } from "../lib/netease";
import { YoutubeClient } from "../lib/youtube";
import { BiliClient } from "../lib/bili-client";
import type { MusicSourceClient } from "../lib/music-sources";
import type { Env } from "../types";

export function createSources(env: Env, forceSource?: string): MusicSourceClient[] {
  const sources: MusicSourceClient[] = [];

  const neteaseApiBase = env.MUSIC_API_BASE || '';
  const youtubeApiBase = env.YOUTUBE_API_BASE;

  if (forceSource === 'netease') {
    if (neteaseApiBase) sources.push(new NeteaseClient(neteaseApiBase));
  } else if (forceSource === 'youtube') {
    const instances = youtubeApiBase ? [youtubeApiBase] : undefined;
    sources.push(new YoutubeClient(instances));
  } else if (forceSource === 'bilibili') {
    sources.push(new BiliClient(env));
  } else {
    // 默认优先级: 网易云 > YouTube > B站
    if (neteaseApiBase) {
      sources.push(new NeteaseClient(neteaseApiBase));
    }
    const instances = youtubeApiBase ? [youtubeApiBase] : undefined;
    sources.push(new YoutubeClient(instances));
    sources.push(new BiliClient(env));
  }

  return sources;
}
