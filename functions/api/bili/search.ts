/**
 * Cloudflare Pages Function — B站视频搜索
 * 内联 WBI 签名 + buvid3 cookie 管理，避免前端暴露用户 IP 给 B站。
 * 当 B站 封锁 Cloudflare IP 时回退到前端直连。
 */
import { Md5 } from "ts-md5";

interface Env {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  CACHE: KVNamespace;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
}

// --- WBI 签名（与 worker/src/lib/bili.ts 保持一致）---
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
  49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
  40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
  62, 11, 36, 20, 34, 44, 52,
] as const;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const COMMON_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Origin: "https://www.bilibili.com",
  Referer: "https://www.bilibili.com/",
};

function getMixinKey(imgKey: string, subKey: string): string {
  return MIXIN_KEY_ENC_TAB.map((i) => (imgKey + subKey)[i]).join("").slice(0, 32);
}

function signParams(params: Record<string, string | number>, mixinKey: string): Record<string, string> {
  const wts = Math.floor(Date.now() / 1000);
  const signed: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) signed[k] = String(v);
  signed.wts = String(wts);
  const sorted = Object.keys(signed).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(signed[k])}`).join("&");
  signed.w_rid = Md5.hashStr(sorted + mixinKey) as string;
  return signed;
}

async function ensureBuvid3(env: Env): Promise<string> {
  const cached = await env.CACHE.get("buvid3");
  if (cached) return cached;
  try {
    const res = await fetch("https://www.bilibili.com", { headers: { "User-Agent": UA }, redirect: "follow" });
    const cookies = (res.headers as any).getSetCookie?.() ?? [];
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) cookies.push(setCookie);
    for (const c of cookies) {
      const m = (c as string).match(/buvid3=([^;]+)/);
      if (m) { await env.CACHE.put("buvid3", m[1]!, { expirationTtl: 86400 }); return m[1]!; }
    }
  } catch {}
  const fallback = `${crypto.randomUUID()}infoc`;
  await env.CACHE.put("buvid3", fallback, { expirationTtl: 86400 });
  return fallback;
}

async function getWbiKeys(env: Env): Promise<{ imgKey: string; subKey: string }> {
  const [cachedImg, cachedSub] = await Promise.all([env.CACHE.get("wbi:imgKey"), env.CACHE.get("wbi:subKey")]);
  if (cachedImg && cachedSub) return { imgKey: cachedImg, subKey: cachedSub };
  const buvid3 = await ensureBuvid3(env);
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: { ...COMMON_HEADERS, Cookie: `buvid3=${buvid3}` } });
  const json = (await res.json()) as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } };
  const imgKey = json.data?.wbi_img?.img_url?.split("/").pop()?.replace(".png", "") ?? "";
  const subKey = json.data?.wbi_img?.sub_url?.split("/").pop()?.replace(".png", "") ?? "";
  if (imgKey && subKey) {
    await Promise.all([env.CACHE.put("wbi:imgKey", imgKey, { expirationTtl: 43200 }), env.CACHE.put("wbi:subKey", subKey, { expirationTtl: 43200 })]);
  }
  return { imgKey, subKey };
}

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  if (!keyword) return Response.json({ total: 0, videos: [] });

  try {
    const { imgKey, subKey } = await getWbiKeys(env);
    const mixinKey = getMixinKey(imgKey, subKey);
    const buvid3 = await ensureBuvid3(env);
    const params = signParams({ search_type: "video", keyword, page, order: "totalrank" }, mixinKey);
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`https://api.bilibili.com/x/web-interface/search/type?${qs}`, {
      headers: { ...COMMON_HEADERS, Cookie: `buvid3=${buvid3}` },
    });
    const json = (await res.json()) as any;
    if (json.code !== 0 || !json.data?.result) return Response.json({ total: 0, videos: [] });
    return Response.json({
      total: json.data.numResults ?? json.data.result.length,
      videos: json.data.result.filter((v: any) => v.bvid).map((v: any) => ({
        bvid: v.bvid,
        title: (v.title ?? "").replace(/<[^>]*>/g, ""),
        author: v.author ?? "",
        duration: v.duration ?? "",
        play: v.play ?? 0,
        pic: v.pic?.startsWith("//") ? `https:${v.pic}` : (v.pic ?? ""),
      })),
    });
  } catch (err) {
    console.error("bili search error:", err);
    return Response.json({ total: 0, videos: [] }, { status: 502 });
  }
};
