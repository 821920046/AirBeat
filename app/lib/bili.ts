/**
 * 前端 B站 API 客户端
 * 所有 B站 API 调用通过 CF Pages Functions 代理（/api/bili/*）
 * 代理端带 buvid3 cookie + 浏览器 UA 绕过 B站 412 封锁
 * 搜索功能已迁移至 AI web search（见 functions/api/chat.ts）
 */
import { Md5 } from "ts-md5";

// --- WBI 签名常量（前端保留用于弹性降级）---
const MIXIN_KEY_ENC_TAB = [
  46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,
  49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,
  40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,
  62,11,36,20,34,44,52,
] as const;

// 所有 B站 API 走 CF Pages Functions 代理，避免浏览器 CORS 拦截
const BILI_PROXY = "/api/bili";

// --- 导出的 API 函数（全部走代理）---

export interface DanmakuItem {
  time: number;
  content: string;
  type: number;
  color: string;
}

/** 获取视频信息（cid + title） — 通过 CF Pages Function 代理 */
export async function getVideoInfo(bvid: string): Promise<{ cid: string; title: string }> {
  const resp = await fetch(`${BILI_PROXY}/info?bvid=${encodeURIComponent(bvid)}`, { credentials: "omit" });
  if (!resp.ok) throw new Error(`获取视频信息失败: ${resp.status}`);
  const json = (await resp.json()) as { cid?: string; title?: string; error?: string };
  if (json.error || !json.cid) throw new Error(json.error || "获取视频信息失败");
  return { cid: json.cid, title: json.title ?? "" };
}

/** 获取 DASH 音频流 URL — 通过 CF Pages Function 代理 */
export async function getAudioUrl(bvid: string, cid: string): Promise<string> {
  const resp = await fetch(
    `${BILI_PROXY}/audio-url?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`,
    { credentials: "omit" }
  );
  if (!resp.ok) throw new Error(`获取音频URL失败: ${resp.status}`);
  const json = (await resp.json()) as { audioUrl?: string; error?: string };
  if (json.error || !json.audioUrl) throw new Error(json.error || "获取音频URL失败");
  return json.audioUrl;
}

/** 通过 CF Pages Function 代理下载 B站 DASH 音频字节（CDN流，不需要 cookie） */
export async function fetchAudioBuffer(audioUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/bili/proxy?url=${encodeURIComponent(audioUrl)}`);
  if (!res.ok) throw new Error(`音频下载失败: ${res.status}`);
  return res.arrayBuffer();
}

/** 获取弹幕 — 通过 CF Pages Function 代理（带 buvid3 cookie） */
export async function getDanmaku(cid: string): Promise<DanmakuItem[]> {
  const res = await fetch(`/api/bili/proxy-danmaku?cid=${encodeURIComponent(cid)}`, { credentials: "omit" });
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
