import { md5 } from "@noble/hashes/md5";
import { bytesToHex } from "@noble/hashes/utils";
import type { BiliVideo, DanmakuItem, Env } from "../types";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
  49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
  40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
  62, 11, 36, 20, 34, 44, 52,
] as const;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const COMMON_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Origin: "https://www.bilibili.com",
  Referer: "https://www.bilibili.com/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

function signParams(
  params: Record<string, string | number>,
  mixinKey: string
): Record<string, string> {
  const wts = Math.floor(Date.now() / 1000);
  const signed: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    signed[k] = String(v);
  }
  signed.wts = String(wts);

  const sorted = Object.keys(signed)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(signed[k])}`)
    .join("&");

  // @noble/hashes 替代 Node.js crypto.createHash("md5")
  const wRid = bytesToHex(md5(new TextEncoder().encode(sorted + mixinKey)));

  signed.w_rid = wRid;
  return signed;
}

async function ensureBuvid3(env: Env): Promise<string> {
  const cached = await env.CACHE.get("buvid3");
  if (cached) return cached;

  try {
    const res = await fetch("https://www.bilibili.com", {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    const cookies = res.headers.getSetCookie?.() ?? [];
    for (const c of cookies) {
      const match = c.match(/buvid3=([^;]+)/);
      if (match) {
        const buvid3 = match[1];
        await env.CACHE.put("buvid3", buvid3, { expirationTtl: 86400 });
        return buvid3;
      }
    }
  } catch {
    /* fallback */
  }
  const fallback = `${crypto.randomUUID()}infoc`;
  await env.CACHE.put("buvid3", fallback, { expirationTtl: 86400 });
  return fallback;
}

async function getWbiKeys(env: Env): Promise<{ imgKey: string; subKey: string }> {
  const cachedImg = await env.CACHE.get("wbi:imgKey");
  const cachedSub = await env.CACHE.get("wbi:subKey");
  if (cachedImg && cachedSub) return { imgKey: cachedImg, subKey: cachedSub };

  const buvid3 = await ensureBuvid3(env);
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: {
      ...COMMON_HEADERS,
      Cookie: `buvid3=${buvid3}`,
    },
  });
  const json = (await res.json()) as {
    data?: {
      wbi_img?: { img_url?: string; sub_url?: string };
    };
  };
  const imgUrl = json.data?.wbi_img?.img_url ?? "";
  const subUrl = json.data?.wbi_img?.sub_url ?? "";
  const imgKey = imgUrl.split("/").pop()?.replace(".png", "") ?? "";
  const subKey = subUrl.split("/").pop()?.replace(".png", "") ?? "";

  if (imgKey && subKey) {
    await env.CACHE.put("wbi:imgKey", imgKey, { expirationTtl: 43200 });
    await env.CACHE.put("wbi:subKey", subKey, { expirationTtl: 43200 });
  }
  return { imgKey, subKey };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

export async function getVideoInfo(
  env: Env,
  bvid: string
): Promise<{ cid: string; title: string }> {
  const { imgKey, subKey } = await getWbiKeys(env);
  const mixinKey = getMixinKey(imgKey, subKey);
  const buvid3 = await ensureBuvid3(env);

  const params = signParams({ bvid }, mixinKey);
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(
    `https://api.bilibili.com/x/web-interface/view?${qs}`,
    {
      headers: {
        ...COMMON_HEADERS,
        Cookie: `buvid3=${buvid3}`,
      },
    }
  );

  const json = (await res.json()) as {
    code?: number;
    data?: { cid?: number; title?: string };
  };

  if (json.code !== 0 || !json.data?.cid) {
    throw new Error(`Failed to get video info for ${bvid}`);
  }

  return { cid: String(json.data.cid), title: json.data.title ?? "" };
}

export async function getDanmaku(
  env: Env,
  cid: string
): Promise<DanmakuItem[]> {
  const buvid3 = await ensureBuvid3(env);

  const res = await fetch(
    `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`,
    {
      headers: {
        ...COMMON_HEADERS,
        Cookie: `buvid3=${buvid3}`,
      },
    }
  );

  const xml = await res.text();

  const items: DanmakuItem[] = [];
  const dRegex = /<d p="([^"]*)"[^>]*>([^<]*)<\/d>/g;
  let match: RegExpExecArray | null;
  while ((match = dRegex.exec(xml)) !== null) {
    const attrs = match[1]!.split(",");
    const time = parseFloat(attrs[0] ?? "0");
    const type = parseInt(attrs[1] ?? "0", 10);
    const color = attrs[3]
      ? `#${parseInt(attrs[3]).toString(16).padStart(6, "0")}`
      : "#ffffff";
    const content = match[2]!;
    if (content.trim()) {
      items.push({ time, content, type, color });
    }
  }

  items.sort((a, b) => a.time - b.time);
  return items;
}

export async function searchVideos(
  env: Env,
  keyword: string,
  page = 1
): Promise<{ total: number; videos: BiliVideo[] }> {
  const { imgKey, subKey } = await getWbiKeys(env);
  const mixinKey = getMixinKey(imgKey, subKey);
  const buvid3 = await ensureBuvid3(env);

  const params = signParams(
    { search_type: "video", keyword, page, order: "totalrank" },
    mixinKey
  );
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(
    `https://api.bilibili.com/x/web-interface/search/type?${qs}`,
    {
      headers: {
        ...COMMON_HEADERS,
        Cookie: `buvid3=${buvid3}`,
      },
    }
  );

  const json = (await res.json()) as {
    code?: number;
    data?: {
      numResults?: number;
      result?: Array<{
        bvid?: string;
        title?: string;
        author?: string;
        duration?: string;
        play?: number;
        pic?: string;
      }>;
    };
  };

  if (json.code !== 0 || !json.data?.result) {
    return { total: 0, videos: [] };
  }

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

/**
 * 获取 B站 DASH 音频流 URL
 * fnval=16 表示 DASH 格式，qn=64 表示音质
 */
export async function getAudioUrl(
  env: Env,
  bvid: string,
  cid: string
): Promise<string> {
  const buvid3 = await ensureBuvid3(env);

  const res = await fetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}&fnval=16&qn=64`,
    {
      headers: {
        ...COMMON_HEADERS,
        Cookie: `buvid3=${buvid3}`,
      },
    }
  );

  const json = (await res.json()) as {
    code?: number;
    data?: {
      dash?: {
        audio?: Array<{ baseUrl?: string; base_url?: string; backupUrl?: string[] }>;
      };
    };
  };

  if (json.code !== 0 || !json.data?.dash?.audio?.length) {
    throw new Error(`Failed to get audio URL for ${bvid}`);
  }

  const audio = json.data.dash.audio[0];
  return audio!.baseUrl || audio!.base_url || "";
}
