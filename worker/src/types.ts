export interface Track {
  id: string;
  title: string;
  author: string;
  date: string;
  filename: string;
  subDir: string;
  size: number;
  url: string;
  bvid?: string;
}

export interface BiliVideo {
  bvid: string;
  title: string;
  author: string;
  duration: string;
  play: number;
  pic: string;
}

export interface DanmakuItem {
  time: number;
  content: string;
  type: number;
  color: string;
}

export interface Env {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  CACHE: KVNamespace;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  MUSIC_API_BASE?: string;   // 网易云 API 基础 URL（自部署 NeteaseCloudMusicApi 实例）
  YOUTUBE_API_BASE?: string; // Invidious 实例 URL（可选，默认用内置列表）
}
