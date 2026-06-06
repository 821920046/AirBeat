/**
 * 前端 B站 API 客户端
 * 仅用于音频下载链路（getVideoInfo / getAudioUrl / fetchAudioBuffer）
 * 这些从用户浏览器发起，不会被 B站 412 封锁
 * 搜索功能已迁移至 AI web search（见 functions/api/chat.ts 的 web_search tool）
 */
import { Md5 } from "ts-md5";

// --- WBI 签名常量 ---
const MIXIN_KEY_ENC_TAB = [
  46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,
  49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,
  40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,
  62,11,36,20,34,44,52,
] as const;

// B站 API 直连（浏览器 IP, 不走代理）
const BILI_ORIGIN = "https://api.bilibili.com";

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

  const res = await fetch(`${BILI_ORIGIN}/x/web-interface/nav`, {
    credentials: "omit",
  });
  const json = (await res.json()) as {
    data?: { wbi_img?: { img_url?: string; sub_url?: string } };
  };
  const imgKey = json.data?.wbi_img?.img_url?.split("/").pop()?.replace(".png", "") ?? "";
  const subKey = json.data?.wbi_img?.sub_url?.split("/").pop()?.replace(".png", "") ?? "";

  if (imgKey && subKey) {
    setCache("bili_wbi", { imgKey, subKey }, 43200_000);
  }
  return { imgKey, subKey };
}

// --- 导出的 API 函数（仅音频下载链路）---

export interface DanmakuItem {
  time: number;
  content: string;
  type: number;
  color: string;
}

/** 获取视频信息（cid + title） — 浏览器直连 */
export async function getVideoInfo(bvid: string): Promise<{ cid: string; title: string }> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey, subKey);
  const params = signParams({ bvid }, mixinKey);
  const qs = new URLSearchParams(params).toString();

  const res = await fetch(`${BILI_ORIGIN}/x/web-interface/view?${qs}`, { credentials: "omit" });
  const json = (await res.json()) as {
    code?: number;
    data?: { cid?: number; title?: string };
  };

  if (json.code !== 0 || !json.data?.cid) {
    throw new Error(`获取视频信息失败: ${bvid} (code: ${json.code})`);
  }
  return { cid: String(json.data.cid), title: json.data.title ?? "" };
}

/** 获取 DASH 音频流 URL — 浏览器直连 */
export async function getAudioUrl(bvid: string, cid: string): Promise<string> {
  const res = await fetch(
    `${BILI_ORIGIN}/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}&fnval=16&qn=64`,
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

/** 通过 CF Pages Function 代理下载 B站 DASH 音频字节 */
export async function fetchAudioBuffer(audioUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/bili/proxy?url=${encodeURIComponent(audioUrl)}`);
  if (!res.ok) throw new Error(`音频下载失败: ${res.status}`);
  return res.arrayBuffer();
}

/** 获取弹幕 — 通过 CF Pages Function 代理（带 buvid3 cookie） */
export async function getDanmaku(cid: string): Promise<DanmakuItem[]> {
  const res = await fetch(`/api/bili/proxy/danmaku?cid=${encodeURIComponent(cid)}`, { credentials: "omit" });
  if (!res.ok) throw new Error(`弹幕获取失败: ${res.status}`);
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
