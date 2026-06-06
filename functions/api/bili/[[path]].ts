/**
 * Cloudflare Pages Function — 通用 B站 API 代理
 * Catch-all 路由: /api/bili/*
 * 带 buvid3 cookie + 浏览器 UA 绕过 B站 412 封锁
 */
import { Md5 } from "ts-md5";

interface Env {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  CACHE: KVNamespace;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const COMMON_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Origin: "https://www.bilibili.com",
  Referer: "https://www.bilibili.com/",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range, Cookie",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

function jr(d: unknown, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
}

// --- buvid3 管理（KV 缓存 24h）---
async function ensureBuvid3(env: Env): Promise<string> {
  const cached = await env.CACHE.get("buvid3");
  if (cached) return cached;

  try {
    const res = await fetch("https://www.bilibili.com", {
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    const cookies = (res.headers as any).getSetCookie?.() ?? [];
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) cookies.push(setCookie);
    for (const c of cookies) {
      const m = (c as string).match(/buvid3=([^;]+)/);
      if (m) {
        await env.CACHE.put("buvid3", m[1]!, { expirationTtl: 86400 });
        return m[1]!;
      }
    }
  } catch { /* fallback */ }

  const fallback = `${crypto.randomUUID()}infoc`;
  await env.CACHE.put("buvid3", fallback, { expirationTtl: 86400 });
  return fallback;
}

// --- WBI 签名（与 worker/src/lib/bili.ts 一致）---
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
  49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
  40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
  62, 11, 36, 20, 34, 44, 52,
] as const;

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

async function getWbiKeys(env: Env): Promise<{ imgKey: string; subKey: string }> {
  const [cachedImg, cachedSub] = await Promise.all([
    env.CACHE.get("wbi:imgKey"),
    env.CACHE.get("wbi:subKey"),
  ]);
  if (cachedImg && cachedSub) return { imgKey: cachedImg, subKey: cachedSub };

  const buvid3 = await ensureBuvid3(env);
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: { ...COMMON_HEADERS, Cookie: `buvid3=${buvid3}` },
  });
  const json = (await res.json()) as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } };
  const imgKey = json.data?.wbi_img?.img_url?.split("/").pop()?.replace(".png", "") ?? "";
  const subKey = json.data?.wbi_img?.sub_url?.split("/").pop()?.replace(".png", "") ?? "";

  if (imgKey && subKey) {
    await Promise.all([
      env.CACHE.put("wbi:imgKey", imgKey, { expirationTtl: 43200 }),
      env.CACHE.put("wbi:subKey", subKey, { expirationTtl: 43200 }),
    ]);
  }
  return { imgKey, subKey };
}

// --- 判断是否需要 WBI 签名 ---
// B站 需要签名的 API 前缀列表
const NEEDS_WBI = new Set([
  "/x/web-interface/view",
  "/x/web-interface/search",
  "/x/player/playurl",
  "/x/player/wbi",
]);

function needsWbiSign(path: string): boolean {
  for (const prefix of NEEDS_WBI) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

// OPTIONS 预检
export const onRequestOptions = () => new Response(null, { headers: CORS });

// 处理 OPTIONS 预检
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);

  // 提取 B站 API 路径（去除 /api/bili 前缀）
  let biliPath = url.pathname.replace(/^\/api\/bili\/?/, "");

  // 如果没有路径参数，返回错误
  if (!biliPath) {
    return jr({ error: "B站 API path is required after /api/bili/" }, 400);
  }

  // 重新拼接 B站 API 完整 URL
  const biliUrl = new URL(`https://api.bilibili.com/${biliPath}`);

  try {
    // 复制所有查询参数（包括 w_rid, wts 等签名参数）
    url.searchParams.forEach((value, key) => {
      if (!key.startsWith("_")) {  // 过滤掉内部参数
        biliUrl.searchParams.set(key, value);
      }
    });

    const buvid3 = await ensureBuvid3(env);
    const headers: Record<string, string> = {
      ...COMMON_HEADERS,
      Cookie: `buvid3=${buvid3}`,
    };

    const resp = await fetch(biliUrl.toString(), { headers });

    if (!resp.ok) {
      return jr({ error: `B站 returned ${resp.status}` }, resp.status);
    }

    const data = (await resp.json()) as any;
    return jr(data);
  } catch (err) {
    console.error("bili-api proxy error:", err);
    return jr({ error: String(err) }, 502);
  }
};
