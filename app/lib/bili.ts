import { createHash } from "crypto";

export interface BiliVideo {
  bvid: string;
  title: string;
  author: string;
  duration: string;
  play: number;
  pic: string;
}

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
  49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
  40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
  62, 11, 36, 20, 34, 44, 52,
] as const;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let cachedKeys: { imgKey: string; subKey: string; ts: number } | null = null;
let cachedBuvid3: string | null = null;

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

  const wRid = createHash("md5")
    .update(sorted + mixinKey)
    .digest("hex");

  signed.w_rid = wRid;
  return signed;
}

async function ensureBuvid3(): Promise<string> {
  if (cachedBuvid3) return cachedBuvid3;
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
        cachedBuvid3 = match[1];
        return cachedBuvid3;
      }
    }
  } catch { /* fallback */ }
  cachedBuvid3 = `${crypto.randomUUID()}infoc`;
  return cachedBuvid3;
}

const KEY_TTL = 12 * 60 * 60 * 1000;

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  if (cachedKeys && Date.now() - cachedKeys.ts < KEY_TTL) {
    return { imgKey: cachedKeys.imgKey, subKey: cachedKeys.subKey };
  }
  const buvid3 = await ensureBuvid3();
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers: {
      "User-Agent": UA,
      Referer: "https://www.bilibili.com",
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
    cachedKeys = { imgKey, subKey, ts: Date.now() };
  }
  return { imgKey, subKey };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

export async function searchVideos(
  keyword: string,
  page = 1
): Promise<{ total: number; videos: BiliVideo[] }> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey, subKey);
  const buvid3 = await ensureBuvid3();

  const params = signParams(
    {
      search_type: "video",
      keyword,
      page,
      order: "totalrank",
    },
    mixinKey
  );

  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(
    `https://api.bilibili.com/x/web-interface/wbi/search/type?${qs}`,
    {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.bilibili.com",
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
