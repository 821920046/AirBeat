/**
 * 网易云音乐 API 客户端
 * 依赖自部署的 NeteaseCloudMusicApiEnhanced 实例
 * API 文档: https://docs-neteasecloudmusicapi.vercel.app/
 */
import type { MusicTrack, MusicSourceClient } from './music-sources';

export class NeteaseClient implements MusicSourceClient {
  readonly name = 'netease';

  constructor(private baseUrl: string) {}

  // 对外暴露的 source 类型
  get source(): 'netease' { return 'netease'; }

  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/search/defaultkeyword`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** 搜索歌曲 — type=1 表示单曲 */
  async search(query: string, limit = 10): Promise<MusicTrack[]> {
    const url = `${this.baseUrl}/search?${new URLSearchParams({
      keywords: query,
      type: '1',
      limit: String(limit),
    })}`;

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'AirBeat/1.0',
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      throw new Error(`Netease search HTTP ${resp.status}`);
    }

    const json = (await resp.json()) as {
      code: number;
      result?: {
        songs?: Array<{
          id: number;
          name: string;
          ar?: Array<{ name: string }>;
          dt?: number;
          al?: { picUrl?: string };
        }>;
      };
    };

    if (json.code !== 200 || !json.result?.songs?.length) {
      return [];
    }

    return json.result.songs.map(song => {
      const durationSec = Math.floor((song.dt || 0) / 1000);
      const mm = Math.floor(durationSec / 60);
      const ss = String(durationSec % 60).padStart(2, '0');
      return {
        id: String(song.id),
        title: song.name,
        artist: song.ar?.map(a => a.name).join('/') || '未知歌手',
        duration: `${mm}:${ss}`,
        source: 'netease' as const,
        url: `https://music.163.com/song?id=${song.id}`,
        thumbnail: song.al?.picUrl || undefined,
      };
    });
  }

  /** 获取音频流 URL — 返回可直接播放的链接 */
  async getAudioUrl(trackId: string): Promise<string> {
    const url = `${this.baseUrl}/song/url?${new URLSearchParams({
      id: trackId,
      br: '320000', // 320kbps
    })}`;

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'AirBeat/1.0',
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      throw new Error(`Netease song/url HTTP ${resp.status}`);
    }

    const json = (await resp.json()) as {
      code: number;
      data?: Array<{ url?: string; br?: number; type?: string }>;
    };

    if (json.code !== 200 || !json.data?.[0]?.url) {
      // 尝试更低的码率
      return this.getAudioUrlFallback(trackId);
    }

    const audioUrl = json.data[0].url;
    console.log(`[netease] got audio URL: ${audioUrl.slice(0, 80)}...`);
    return audioUrl;
  }

  /** 降级尝试低码率 */
  private async getAudioUrlFallback(trackId: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/song/url?id=${trackId}&br=128000`, {
      headers: { 'User-Agent': 'AirBeat/1.0' },
    });
    if (!resp.ok) throw new Error(`Netease song/url fallback HTTP ${resp.status}`);
    const json = (await resp.json()) as {
      code: number;
      data?: Array<{ url?: string }>;
    };
    if (json.code === 200 && json.data?.[0]?.url) {
      return json.data[0].url;
    }
    throw new Error(`Netease: no playable URL for ${trackId}`);
  }

  /** 获取歌词 */
  async getLyrics(trackId: string): Promise<string | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/lyric?id=${trackId}`, {
        headers: { 'User-Agent': 'AirBeat/1.0' },
      });
      if (!resp.ok) return null;
      const json = (await resp.json()) as {
        code: number;
        lrc?: { lyric?: string };
      };
      return json.lrc?.lyric || null;
    } catch {
      return null;
    }
  }
}
