import { Md5 } from "ts-md5";

interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }
interface DanmakuItem { time: number; content: string; type: number; color: string; }

const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52] as const;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BH: Record<string, string> = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Origin: "https://www.bilibili.com", Referer: "https://www.bilibili.com/" };

function getMixinKey(ik: string, sk: string): string { return MIXIN_KEY_ENC_TAB.map(i => (ik + sk)[i]).join("").slice(0, 32); }
function sign(p: Record<string, string | number>, mk: string): Record<string, string> { const wts = Math.floor(Date.now() / 1000); const s: Record<string, string> = {}; for (const [k, v] of Object.entries(p)) s[k] = String(v); s.wts = String(wts); const q = Object.keys(s).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(s[k])}`).join("&"); s.w_rid = Md5.hashStr(q + mk) as string; return s; }
async function buvid3(env: Env): Promise<string> { const c = await env.CACHE.get("buvid3"); if (c) return c; try { const r = await fetch("https://www.bilibili.com", { headers: { "User-Agent": UA }, redirect: "follow" }); for (const x of r.headers.getSetCookie?.() ?? []) { const m = x.match(/buvid3=([^;]+)/); if (m) { await env.CACHE.put("buvid3", m[1], { expirationTtl: 86400 }); return m[1]; } } } catch {} const f = `${crypto.randomUUID()}infoc`; await env.CACHE.put("buvid3", f, { expirationTtl: 86400 }); return f; }
async function videoInfo(env: Env, bvid: string): Promise<{ cid: string; title: string }> { const ci = await env.CACHE.get("wbi:imgKey"); const cs = await env.CACHE.get("wbi:subKey"); let ik = ci ?? "", sk = cs ?? ""; if (!ik || !sk) { const b = await buvid3(env); const r = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: { ...BH, Cookie: `buvid3=${b}` } }); const j = (await r.json()) as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } }; ik = (j.data?.wbi_img?.img_url ?? "").split("/").pop()?.replace(".png", "") ?? ""; sk = (j.data?.wbi_img?.sub_url ?? "").split("/").pop()?.replace(".png", "") ?? ""; if (ik && sk) { await env.CACHE.put("wbi:imgKey", ik, { expirationTtl: 43200 }); await env.CACHE.put("wbi:subKey", sk, { expirationTtl: 43200 }); } } const mk = getMixinKey(ik, sk); const b = await buvid3(env); const p = sign({ bvid }, mk); const qs = Object.entries(p).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"); const r = await fetch(`https://api.bilibili.com/x/web-interface/view?${qs}`, { headers: { ...BH, Cookie: `buvid3=${b}` } }); const j = (await r.json()) as { code?: number; data?: { cid?: number; title?: string } }; if (j.code !== 0 || !j.data?.cid) throw new Error(`Failed to get video info for ${bvid}`); return { cid: String(j.data.cid), title: j.data.title ?? "" }; }
async function getDanmaku(env: Env, cid: string): Promise<DanmakuItem[]> { const b = await buvid3(env); const r = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, { headers: { ...BH, Cookie: `buvid3=${b}` } }); const xml = await r.text(); const items: DanmakuItem[] = []; const re = /<d p="([^"]*)"[^>]*>([^<]*)<\/d>/g; let m: RegExpExecArray | null; while ((m = re.exec(xml)) !== null) { const a = m[1]!.split(","); const time = parseFloat(a[0] ?? "0"); const type = parseInt(a[1] ?? "0", 10); const color = a[3] ? `#${parseInt(a[3]).toString(16).padStart(6, "0")}` : "#ffffff"; const content = m[2]!; if (content.trim()) items.push({ time, content, type, color }); } items.sort((a, b) => a.time - b.time); return items; }

function jr(d: unknown, s = 200): Response { return new Response(JSON.stringify(d), { s, headers: { "Content-Type": "application/json" } } as ResponseInit); }
function er(m: string, s = 500): Response { return jr({ error: m }, s); }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url); const bvid = url.searchParams.get("bvid");
  if (!bvid?.trim()) return er("bvid is required", 400);
  try { const { cid } = await videoInfo(env, bvid); return jr({ bvid, cid, danmaku: await getDanmaku(env, cid) }); }
  catch (err) { console.error("bili danmaku error:", err); return er(String(err), 502); }
};
