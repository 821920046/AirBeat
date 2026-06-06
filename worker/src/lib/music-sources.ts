/**
 * 音乐源统一接口 & 类型定义
 * 支持多源搜索和音频URL获取，带自动降级
 */
export interface MusicTrack {
  id: string;           // 源内唯一ID（网易云 songId / YouTube videoId）
  title: string;
  artist: string;       // 歌手/作者
  duration: string;     // mm:ss 格式
  source: MusicSource;  // 来源标识
  url: string;          // 源页面URL
  thumbnail?: string;   // 封面图URL
}

export type MusicSource = 'netease' | 'youtube' | 'bilibili';

export interface MusicSourceClient {
  readonly name: string;
  /** 搜索音乐，返回统一 MusicTrack[] */
  search(query: string, limit?: number): Promise<MusicTrack[]>;
  /** 获取音频流 URL（直接可播放的链接） */
  getAudioUrl(trackId: string): Promise<string>;
  /** 检查该源是否可用 */
  health(): Promise<boolean>;
}

/**
 * 多源搜索 — 按优先级尝试，失败自动降级
 * 优先级: 网易云 > YouTube > B站
 */
export async function searchMusic(
  query: string,
  sources: MusicSourceClient[],
  limit = 10,
): Promise<{ tracks: MusicTrack[]; usedSource: string }> {
  for (const source of sources) {
    try {
      console.log(`[music] searching "${query}" via ${source.name}...`);
      const tracks = await source.search(query, limit);
      if (tracks.length > 0) {
        console.log(`[music] ${source.name} returned ${tracks.length} results`);
        return { tracks, usedSource: source.name };
      }
      console.log(`[music] ${source.name} returned 0 results, trying next...`);
    } catch (err) {
      console.warn(`[music] ${source.name} search failed:`, err);
    }
  }
  console.warn(`[music] all sources failed for "${query}"`);
  return { tracks: [], usedSource: 'none' };
}

/**
 * 多源获取音频URL — 按指定源尝试，失败降级到下一源
 */
export async function getAudioUrl(
  trackId: string,
  trackSource: MusicSource,
  sources: MusicSourceClient[],
): Promise<string> {
  // 先找到匹配的源，从它开始尝试
  const idx = sources.findIndex(s => s.name === trackSource);
  const ordered = idx >= 0
    ? [...sources.slice(idx), ...sources.slice(0, idx)]
    : sources;

  for (const source of ordered) {
    try {
      console.log(`[music] getting audio URL for ${trackId} via ${source.name}...`);
      const url = await source.getAudioUrl(trackId);
      if (url) return url;
    } catch (err) {
      console.warn(`[music] ${source.name} audio URL failed:`, err);
    }
  }
  throw new Error(`Failed to get audio URL for ${trackId} from any source`);
}
