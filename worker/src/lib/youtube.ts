/**
 * YouTube 音乐客户端 — 通过 Invidious API 获取搜索和音频流
 *
 * Invidious 是 YouTube 的开源前端代理，提供 JSON API，无需 API Key
 * 公共实例列表: https://docs.invidious.io/instances/
 *
 * 作为网易云音乐的降级源。
 */
import type { MusicTrack, MusicSourceClient } from './music-sources';

// 预置公共 Invidious 实例，优先用响应快的
const DEFAULT_INSTANCES = [
  'https://invidious.fdn.fr',
  'https://invidious.privacydev.net',
  'https://vid.puffyan.us',
  'https://inv.nadeko.net',
];

export class YoutubeClient implements MusicSourceClient {
  readonly name = 'youtube';
  private instanceUrl: string | null = null;
  private lastInstanceCheck = 0;

  constructor(private instances: string[] = DEFAULT_INSTANCES) {}

  async health(): Promise<boolean> {
    try {
      const inst = await this.resolveInstance();
      if (!inst) return false;
      const resp = await fetch(`${inst}/api/v1/stats`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** 找到可用实例，缓存 10 分钟 */
  private async resolveInstance(): Promise<string | null> {
    const now = Date.now();
    if (this.instanceUrl && (now - this.lastInstanceCheck) < 600_000) {
      return this.instanceUrl;
    }

    for (const inst of this.instances) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const resp = await fetch(`${inst}/api/v1/stats`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (resp.ok) {
          this.instanceUrl = inst;
          this.lastInstanceCheck = now;
          console.log(`[youtube] using Invidious instance: ${inst}`);
          return inst;
        }
      } catch {
        // 这个实例不可用，试下一个
      }
    }
    console.warn('[youtube] no Invidious instance available');
    return null;
  }

  /** 对结果去重（以 videoId 为键） */
  private dedupe(tracks: MusicTrack[]): MusicTrack[] {
    const seen = new Set<string>();
    return tracks.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }

  async search(query: string, limit = 10): Promise<MusicTrack[]> {
    const inst = await this.resolveInstance();
    if (!inst) throw new Error('No Invidious instance available');

    // Invidious 搜索 API
    const params = new URLSearchParams({
      q: `${query} audio`,
      type: 'video',
      sort: 'relevance',
    });

    const resp = await fetch(`${inst}/api/v1/search?${params}`, {
      headers: { 'User-Agent': 'AirBeat/1.0' },
    });

    if (!resp.ok) {
      throw new Error(`YouTube search HTTP ${resp.status}`);
    }

    const results = (await resp.json()) as Array<{
      videoId?: string;
      title?: string;
      author?: string;
      lengthSeconds?: number;
      videoThumbnails?: Array<{ url: string; quality: string }>;
    }>;

    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }

    const tracks: MusicTrack[] = [];
    for (const item of results) {
      if (!item.videoId || !item.title) continue;
      const sec = item.lengthSeconds || 0;
      const mm = Math.floor(sec / 60);
      const ss = String(sec % 60).padStart(2, '0');
      const thumb = item.videoThumbnails?.find(t => t.quality === 'medium')?.url
        || item.videoThumbnails?.[0]?.url
        || undefined;

      tracks.push({
        id: item.videoId,
        title: item.title.replace(/&#\d{2,4};/g, ''),
        artist: item.author || 'YouTube',
        duration: `${mm}:${ss}`,
        source: 'youtube' as const,
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
        thumbnail: thumb,
      });

      if (tracks.length >= limit) break;
    }

    return this.dedupe(tracks);
  }

  /**
   * 获取音频流 URL
   *
   * YouTube 没有直接MP3链接，通过 Invidious 的 /latest_version 端点
   * 或 yewtu.be 的音频提取功能获取。
   *
   * 策略：尝试 Invidious 自带的 video+audio 合并流，
   * 优先只取 audio-only 的 adaptive format
   */
  async getAudioUrl(trackId: string): Promise<string> {
    const inst = await this.resolveInstance();
    if (!inst) throw new Error('No Invidious instance available');

    const resp = await fetch(`${inst}/api/v1/videos/${trackId}`, {
      headers: { 'User-Agent': 'AirBeat/1.0' },
    });

    if (!resp.ok) {
      throw new Error(`YouTube video info HTTP ${resp.status}`);
    }

    const video = (await resp.json()) as {
      adaptiveFormats?: Array<{
        itag?: string;
        url?: string;
        type?: string;         // e.g. "audio/webm; codecs=\"opus\""
        bitrate?: string;
        container?: string;
        audioChannels?: number;
      }>;
      streamingData?: {
        adaptiveFormats?: Array<{
          itag?: string;
          url?: string;
          mimeType?: string;
          bitrate?: number;
        }>;
      };
    };

    // 优先从 adaptiveFormats 找音频流
    const formats: Array<{
      itag?: string;
      url?: string;
      type?: string;
      mimeType?: string;
      bitrate?: string;
      container?: string;
      audioChannels?: number;
    }> = (video.adaptiveFormats || video.streamingData?.adaptiveFormats || []) as Array<{
      itag?: string;
      url?: string;
      type?: string;
      mimeType?: string;
      bitrate?: string;
      container?: string;
      audioChannels?: number;
    }>;
    const audioFormats = formats.filter(f => {
      const mime = (f.type || f.mimeType || '').toLowerCase();
      return mime.startsWith('audio/') || mime.includes('audio');
    });

    if (audioFormats.length > 0) {
      // 选码率最高的
      const sorted = audioFormats.sort((a, b) => {
        const ba = parseInt(a.bitrate || '0', 10);
        const bb = parseInt(b.bitrate || '0', 10);
        return bb - ba;
      });
      const best = sorted[0]!;
      console.log(`[youtube] selected audio format: itag=${best.itag} type=${best.type || best.mimeType} bitrate=${best.bitrate}`);
      return best.url!;
    }

    throw new Error(`No audio format found for video ${trackId}`);
  }
}
