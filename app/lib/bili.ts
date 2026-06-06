/**
 * 前端 B站 API 客户端
 * B站封了 Cloudflare 数据中心 IP（HTTP 412），所以所有 B站 API 调用必须从用户浏览器发起。
 */
import { Md5 } from "ts-md5";

// --- WBI 签名常量 ---
const MIXIN_KEY_ENC_TAB = [
  46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,
  49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,
  40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,
  62,11,36,20,34,44,52,
] as const;

// B站 API 通过自己的 Cloudflare Pages Function 代理
// 走 /api/bili/* catch-all，内带 buvid3 cookie + 浏览器 UA 绕过 B站 412
const BILI_API = "/api/bili";

// --- localStorage 缓存（替代 Cloudflare KV） ---
function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { value, expires } = JSON.parse(raw) as { value: T; expires: number };
    if (Date.now() > expires) { localStorage.removeItem(key); return null; }
    return value;
  } catch { return null; }
}

function setCache(key: string, value: unknown, ttlMs: number): void {
  try {
    localStorage.setItem(key, JSON.stringify({ value, expires: Date.now() + ttlMs }));
  } catch { /* localStorage full, ignore */ }
}

// --- WBI 签名 ---
function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

function signParams(params: Record<string, string | number>, mixinKey: string): Record<string, string> {
  const wts = Math.floor(Date.now() / 1000);
  const signed: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) signed[k] = String(v);
  signed.wts = String(wts);
  const sorted = Object.keys(signed).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(signed[k])}`).join("&");
  signed.w_rid = Md5.hashStr(sorted + mixinKey) as string;
  return signed;
}

// --- WBI Keys ---
async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  const cached = getCached<{ imgKey: string; subKey: string }>("bili_wbi");
  if (cached) return cached;

  const res = await fetch(`${BILI_API}/x/web-interface/nav`, {
    credentials: "omit",
  });
  const json = (await res.json()) as {
    data?: { wbi_img?: { img_url?: string; sub_url?: string } };
  };
  const imgKey = json.data?.wbi_img?.img_url?.split("/").pop()?.replace(".png", "") ?? "";
  const subKey = json.data?.wbi_img?.sub_url?.split("/").pop()?.replace(".png", "") ?? "";

  if (imgKey && subKey) {
    setCache("bili_wbi", { imgKey, subKey }, 43200_000); // 12 小时
  }
  return { imgKey, subKey };
}

function stripHtml(s: string): string { return s.replace(/<[^>]*>/g, ""); }

// --- 导出的 API 函数 ---

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

/** 搜索 B站视频 */
export async function searchVideos(keyword: string, page = 1): Promise<{ total: number; videos: BiliVideo[] }> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey, subKey);
  const params = signParams({ search_type: "video", keyword, page, order: "totalrank" }, mixinKey);
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(`${BILI_API}/x/web-interface/search/type?${qs}`, { credentials: "omit" });
  const json = (await res.json()) as {
    code?: number;
    data?: {
      numResults?: number;
      result?: Array<{ bvid?: string; title?: string; author?: string; duration?: string; play?: number; pic?: string }>;
    };
  };

  if (json.code !== 0 || !json.data?.result) return { total: 0, videos: [] };

  const videos: BiliVideo[] = json.data.result
    .filter((v) => v.bvid)
    .map((v) => ({
      bvid: v.bvid!,
      title: stripHtml(v.title ?? ""),
      author: v.author ?? "",
      duration: v.duration ?? "",
      play: v.play ?? 0,
      pic: v.pic?.startsWith("//") ? `https:${v.pic}` : (v.pic ?? ""),
    }));

  return { total: json.data.numResults ?? videos.length, videos };
}

/** 获取视频信息（cid + title） */
export async function getVideoInfo(bvid: string): Promise<{ cid: string; title: string }> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey, subKey);
  const params = signParams({ bvid }, mixinKey);
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(`${BILI_API}/x/web-interface/view?${qs}`, { credentials: "omit" });
  const json = (await res.json()) as {
    code?: number;
    data?: { cid?: number; title?: string };
  };

  if (json.code !== 0 || !json.data?.cid) {
    throw new Error(`获取视频信息失败: ${bvid} (code: ${json.code})`);
  }
  return { cid: String(json.data.cid), title: json.data.title ?? "" };
}

/** 获取 DASH 音频流 URL */
export async function getAudioUrl(bvid: string, cid: string): Promise<string> {
  const res = await fetch(
    `${BILI_API}/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}&fnval=16&qn=64`,
    { credentials: "omit" }
  );
  const json = (await res.json()) as {
    code?: number;
    data?: { dash?: { audio?: Array<{ baseUrl?: string; base_url?: string }> } };
  };

  if (json.code !== 0 || !json.data?.dash?.audio?.length) {
    throw new Error(`获取音频 URL 失败: ${bvid} (code: ${json.code})`);
  }
  const audio = json.data.dash.audio[0];
  return audio!.baseUrl || audio!.base_url || "";
}

/** 通过代理下载 B站 DASH 音频的原始 AAC/M4A 字节（不解码，直接返回 ArrayBuffer） */
export async function fetchAudioBuffer(audioUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/bili/proxy?url=${encodeURIComponent(audioUrl)}`);
  if (!res.ok) throw new Error(`音频下载失败: ${res.status}`);
  return res.arrayBuffer();
}

/** 获取弹幕 */
export async function getDanmaku(cid: string): Promise<DanmakuItem[]> {
  const res = await fetch(`${BILI_API}/x/v1/dm/list.so?oid=${cid}`, { credentials: "omit" });
  const xml = await res.text();

  const items: DanmakuItem[] = [];
  const dRegex = /<d p="([^"]*)"[^>]*>([^<]*)<\/d>/g;
  let match: RegExpExecArray | null;
  while ((match = dRegex.exec(xml)) !== null) {
    const attrs = match[1]!.split(",");
    const time = parseFloat(attrs[0] ?? "0");
    const type = parseInt(attrs[1] ?? "0", 10);
    const color = attrs[3] ? `#${parseInt(attrs[3]).toString(16).padStart(6, "0")}` : "#ffffff";
    const content = match[2]!;
    if (content.trim()) items.push({ time, content, type, color });
  }
  items.sort((a, b) => a.time - b.time);
  return items;
}
