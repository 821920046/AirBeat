/**
 * Cloudflare Pages Function — B站 视频信息 / 音频 URL 代理
 * /api/bili/info?bvid=xxx    → 获取视频 cid + title
 * /api/bili/audio-url?bvid=xxx&cid=xxx → 获取 DASH 音频流 URL
 * 带 buvid3 cookie + 完整浏览器 UA 绕过 B站 412
 */
import { Md5 } from "ts-md5";

interface Env {
  CACHE: KVNamespace;
}

// --- 常量 ---
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
};

function jr(d: unknown, s = 200): Response {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
}

// --- WBI 签名 ---
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

// --- buvid3 ---
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
      if (m) { await env.CACHE.put("buvid3", m[1]!, { expirationTtl: 86400 }); return m[1]!; }
    }
  } catch {}
  const fallback = `${crypto.randomUUID()}infoc`;
  await env.CACHE.put("buvid3", fallback, { expirationTtl: 86400 });
  return fallback;
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

// --- 路由 ---
export const onRequestOptions = () => new Response(null, { headers: CORS });

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);

  try {
    // /api/bili/info?bvid=xxx
    if (url.pathname === "/api/bili/info") {
      const bvid = url.searchParams.get("bvid");
      if (!bvid?.trim()) return jr({ error: "bvid is required" }, 400);

      const { imgKey, subKey } = await getWbiKeys(env);
      const mixinKey = getMixinKey(imgKey, subKey);
      const buvid3 = await ensureBuvid3(env);
      const params = signParams({ bvid }, mixinKey);
      const qs = new URLSearchParams(params).toString();

      const resp = await fetch(`https://api.bilibili.com/x/web-interface/view?${qs}`, {
        headers: { ...COMMON_HEADERS, Cookie: `buvid3=${buvid3}` },
      });
      if (!resp.ok) return jr({ error: `B站 returned ${resp.status}` }, resp.status);

      const json = (await resp.json()) as { code?: number; data?: { cid?: number; title?: string } };
      if (json.code !== 0 || !json.data?.cid) {
        return jr({ error: `获取视频信息失败 (code: ${json.code})` }, 502);
      }
      return jr({ bvid, cid: String(json.data.cid), title: json.data.title ?? "" });
    }

    // /api/bili/audio-url?bvid=xxx&cid=xxx
    if (url.pathname === "/api/bili/audio-url") {
      const bvid = url.searchParams.get("bvid");
      const cid = url.searchParams.get("cid");
      if (!bvid?.trim() || !cid?.trim()) return jr({ error: "bvid and cid are required" }, 400);

      const buvid3 = await ensureBuvid3(env);
      const resp = await fetch(
        `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}&fnval=16&qn=64`,
        { headers: { ...COMMON_HEADERS, Cookie: `buvid3=${buvid3}` } },
      );
      if (!resp.ok) return jr({ error: `B站 returned ${resp.status}` }, resp.status);

      const json = (await resp.json()) as {
        code?: number;
        data?: { dash?: { audio?: Array<{ baseUrl?: string; base_url?: string }> } };
      };
      if (json.code !== 0 || !json.data?.dash?.audio?.length) {
        return jr({ error: `获取音频URL失败 (code: ${json.code})` }, 502);
      }
      const audio = json.data.dash.audio[0];
      return jr({ bvid, cid, audioUrl: audio!.baseUrl || audio!.base_url || "" });
    }

    return jr({ error: "Unknown endpoint. Use /api/bili/info or /api/bili/audio-url" }, 404);
  } catch (err) {
    console.error("bili info proxy error:", err);
    return jr({ error: String(err) }, 502);
  }
};
