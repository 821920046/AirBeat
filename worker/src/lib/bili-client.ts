/**
 * B站客户端 — 适配为 MusicSourceClient 接口，用作降级源
 * 封装现有 worker/src/lib/bili.ts 的搜索和音频URL函数
 */
import { searchVideos, getAudioUrl as biliGetAudioUrl, getVideoInfo } from './bili';
import type { MusicTrack, MusicSourceClient } from './music-sources';
import type { Env } from '../types';

export class BiliClient implements MusicSourceClient {
  readonly name = 'bilibili';

  constructor(private env: Env) {}

  async health(): Promise<boolean> {
    // 用热门 BV 号测试连通性
    try {
      await getVideoInfo(this.env, 'BV1GJ411x7h7');
      return true;
    } catch {
      return false;
    }
  }

  async search(query: string, limit = 10): Promise<MusicTrack[]> {
    try {
      const { videos } = await searchVideos(this.env, query, 1);
      return videos.slice(0, limit).map(v => {
        // 解析 duration 字符串如 "04:32"
        const parts = (v.duration || '0:00').split(':');
        let sec = 0;
        if (parts.length === 3) {
          sec = parseInt(parts[0]!) * 3600 + parseInt(parts[1]!) * 60 + parseInt(parts[2]!);
        } else if (parts.length === 2) {
          sec = parseInt(parts[0]!) * 60 + parseInt(parts[1]!);
        }
        const mm = Math.floor(sec / 60);
        const ss = String(sec % 60).padStart(2, '0');

        return {
          id: v.bvid,
          title: v.title,
          artist: v.author || 'B站UP主',
          duration: `${mm}:${ss}`,
          source: 'bilibili' as const,
          url: `https://www.bilibili.com/video/${v.bvid}`,
          thumbnail: v.pic || undefined,
        };
      });
    } catch (err) {
      console.warn('[bili-client] search failed:', err);
      return [];
    }
  }

  async getAudioUrl(trackId: string): Promise<string> {
    // trackId 对 B站 来说就是 bvid
    const { cid } = await getVideoInfo(this.env, trackId);
    return biliGetAudioUrl(this.env, trackId, cid);
  }
}
