import { Md5 } from "ts-md5";

interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }
interface BiliVideo { bvid: string; title: string; author: string; duration: string; play: number; pic: string; }
interface DanmakuItem { time: number; content: string; type: number; color: string; }
interface Track { id: string; title: string; author: string; date: string; filename: string; subDir: string; size: number; url: string; bvid?: string; }
interface DBTrackRow { id: number; title: string; author: string; bvid: string | null; r2_key: string; duration: number | null; file_size: number | null; date_added: string; source: string; }
interface ChatMsg { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: ToolCall[]; }
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string }; }
interface OpenRouterResponse { choices?: Array<{ message?: { role: string; content?: string; tool_calls?: ToolCall[] } }>; error?: { message?: string; code?: number }; }

// --- B站工具 ---
const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52] as const;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BH: Record<string, string> = { "User-Agent": UA, Accept: "application/json, text/plain, */*", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", Origin: "https://www.bilibili.com", Referer: "https://www.bilibili.com/", "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-site" };

function getMixinKey(ik: string, sk: string): string { return MIXIN_KEY_ENC_TAB.map(i => (ik + sk)[i]).join("").slice(0, 32); }
function sign(p: Record<string, string | number>, mk: string): Record<string, string> { const wts = Math.floor(Date.now() / 1000); const s: Record<string, string> = {}; for (const [k, v] of Object.entries(p)) s[k] = String(v); s.wts = String(wts); const q = Object.keys(s).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(s[k])}`).join("&"); s.w_rid = Md5.hashStr(q + mk) as string; return s; }
async function ensureBuvid3(env: Env): Promise<string> { const c = await env.CACHE.get("buvid3"); if (c) return c; try { const r = await fetch("https://www.bilibili.com", { headers: { "User-Agent": UA }, redirect: "follow" }); for (const x of r.headers.getSetCookie?.() ?? []) { const m = x.match(/buvid3=([^;]+)/); if (m) { await env.CACHE.put("buvid3", m[1], { expirationTtl: 86400 }); return m[1]; } } } catch {} const f = `${crypto.randomUUID()}infoc`; await env.CACHE.put("buvid3", f, { expirationTtl: 86400 }); return f; }
async function wbiKeys(env: Env): Promise<{ ik: string; sk: string }> { const ci = await env.CACHE.get("wbi:imgKey"); const cs = await env.CACHE.get("wbi:subKey"); if (ci && cs) return { ik: ci, sk: cs }; const b = await ensureBuvid3(env); const r = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: { ...BH, Cookie: `buvid3=${b}` } }); const j = (await r.json()) as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } }; const ik = (j.data?.wbi_img?.img_url ?? "").split("/").pop()?.replace(".png", "") ?? ""; const sk = (j.data?.wbi_img?.sub_url ?? "").split("/").pop()?.replace(".png", "") ?? ""; if (ik && sk) { await env.CACHE.put("wbi:imgKey", ik, { expirationTtl: 43200 }); await env.CACHE.put("wbi:subKey", sk, { expirationTtl: 43200 }); } return { ik, sk }; }
function stripHtml(s: string): string { return s.replace(/<[^>]*>/g, ""); }
async function searchVideos(env: Env, keyword: string, page = 1): Promise<{ total: number; videos: BiliVideo[] }> { const { ik, sk } = await wbiKeys(env); const mk = getMixinKey(ik, sk); const b = await ensureBuvid3(env); const params = sign({ search_type: "video", keyword, page, order: "totalrank" }, mk); const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"); const r = await fetch(`https://api.bilibili.com/x/web-interface/search/type?${qs}`, { headers: { ...BH, Cookie: `buvid3=${b}` } }); const j = (await r.json()) as { code?: number; data?: { numResults?: number; result?: Array<{ bvid?: string; title?: string; author?: string; duration?: string; play?: number; pic?: string }> } }; if (j.code !== 0 || !j.data?.result) return { total: 0, videos: [] }; const videos: BiliVideo[] = j.data.result.filter(v => v.bvid).map(v => ({ bvid: v.bvid!, title: stripHtml(v.title ?? ""), author: v.author ?? "", duration: v.duration ?? "", play: v.play ?? 0, pic: v.pic?.startsWith("//") ? `https:${v.pic}` : (v.pic ?? "") })); return { total: j.data.numResults ?? videos.length, videos }; }
async function getVideoInfo(env: Env, bvid: string): Promise<{ cid: string; title: string }> { const { ik, sk } = await wbiKeys(env); const mk = getMixinKey(ik, sk); const b = await ensureBuvid3(env); const p = sign({ bvid }, mk); const qs = Object.entries(p).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"); const r = await fetch(`https://api.bilibili.com/x/web-interface/view?${qs}`, { headers: { ...BH, Cookie: `buvid3=${b}` } }); const j = (await r.json()) as { code?: number; data?: { cid?: number; title?: string } }; if (j.code !== 0 || !j.data?.cid) throw new Error(`Failed to get video info for ${bvid}`); return { cid: String(j.data.cid), title: j.data.title ?? "" }; }
async function getDanmaku(env: Env, cid: string): Promise<DanmakuItem[]> { const b = await ensureBuvid3(env); const r = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, { headers: { ...BH, Cookie: `buvid3=${b}` } }); const xml = await r.text(); const items: DanmakuItem[] = []; const re = /<d p="([^"]*)"[^>]*>([^<]*)<\/d>/g; let m: RegExpExecArray | null; while ((m = re.exec(xml)) !== null) { const a = m[1]!.split(","); const time = parseFloat(a[0] ?? "0"); const type = parseInt(a[1] ?? "0", 10); const color = a[3] ? `#${parseInt(a[3]).toString(16).padStart(6, "0")}` : "#ffffff"; const content = m[2]!; if (content.trim()) items.push({ time, content, type, color }); } items.sort((a, b) => a.time - b.time); return items; }

// --- 数据库工具 ---
function rowToTrack(row: DBTrackRow): Track { return { id: String(row.id), title: row.title, author: row.author || "", date: row.date_added || "", filename: row.r2_key.split("/").pop() || "", subDir: "", size: row.file_size || 0, url: `/audio/${row.r2_key}`, bvid: row.bvid || undefined }; }
async function searchTracks(env: Env, query: string, limit = 20): Promise<{ total: number; tracks: Track[] }> { if (!query.trim()) { const rows = await env.DB.prepare("SELECT * FROM tracks ORDER BY date_added DESC LIMIT ?").bind(limit).all<DBTrackRow>(); return { total: rows.results.length, tracks: rows.results.map(rowToTrack) }; } const like = `%${query}%`; const countRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM tracks WHERE title LIKE ? OR author LIKE ?").bind(like, like).first<{ cnt: number }>(); const rows = await env.DB.prepare("SELECT * FROM tracks WHERE title LIKE ? OR author LIKE ? ORDER BY date_added DESC LIMIT ?").bind(like, like, limit).all<DBTrackRow>(); return { total: countRow?.cnt || 0, tracks: rows.results.map(rowToTrack) }; }

// --- OpenRouter Key Pool ---
async function getKeyPool(env: Env): Promise<string[]> {
  try { const raw = await env.CACHE.get("api_keys"); if (raw) { const keys = JSON.parse(raw) as string[]; if (Array.isArray(keys) && keys.length > 0) return keys; } } catch {}
  if (env.OPENROUTER_API_KEY) return [env.OPENROUTER_API_KEY];
  return [];
}

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 免费模型降级列表（按优先级排列，429 时自动切换下一个）
const MODEL_FALLBACKS = [
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3-coder:free",
  "deepseek/deepseek-v4-flash:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "moonshotai/kimi-k2.6:free",
  "openai/gpt-oss-20b:free",
];

async function chatCompletion(env: Env, messages: ChatMsg[], tools?: unknown[]): Promise<OpenRouterResponse> {
  const primaryModel = env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";
  const models = [primaryModel, ...MODEL_FALLBACKS.filter(m => m !== primaryModel)];
  const pool = shuffle(await getKeyPool(env));
  if (pool.length === 0) throw new Error("No API keys configured");

  // 每个模型最多试 2 个 key，控制子请求数（6模型×2key=12，不超50上限）
  const keysPerModel = Math.min(2, pool.length);

  for (const model of models) {
    const body: Record<string, unknown> = { model, messages, temperature: 0.7, max_tokens: 2048 };
    if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = "auto"; }
    const bodyStr = JSON.stringify(body);

    let modelRateLimited = false;
    for (let i = 0; i < keysPerModel; i++) {
      const key = pool[i % pool.length];
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://airbeat-8mo.pages.dev", "X-Title": "AirBeat" },
        body: bodyStr,
      });
      if (resp.status === 429) { modelRateLimited = true; break; } // 模型被限流，直接换下一个模型
      if (!resp.ok) { const t = await resp.text(); console.error(`Model ${model} error ${resp.status}: ${t}`); break; }
      return resp.json() as Promise<OpenRouterResponse>;
    }
    if (modelRateLimited) console.log(`Model ${model} rate limited, trying next...`);
  }
  throw new Error("All models rate limited");
}

// --- SSE & 工具执行 ---
const SYSTEM_PROMPT = `你是 AirBeat 的 AI 音乐助手。保持简洁的中文终端风格语气。你可以通过工具搜索 B站视频和本地曲库推荐给用户。输出 tracks 时必须用 \`\`\`tracks 代码块包裹 JSON 数组，字段原样复制。`;

const TOOLS = [
  { type: "function" as const, function: { name: "search_bili", description: "搜索 B站视频", parameters: { type: "object", properties: { keyword: { type: "string" }, page: { type: "number" } }, required: ["keyword"] } } },
  { type: "function" as const, function: { name: "search_local", description: "搜索本地曲库", parameters: { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"] } } },
];

function createSSE() { const enc = new TextEncoder(); let ctrl: ReadableStreamDefaultController<Uint8Array>; const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } }); return { stream, send(ev: string, d: unknown) { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); }, close() { ctrl.close(); } }; }
async function execTool(env: Env, name: string, args: Record<string, unknown>): Promise<string> { switch (name) { case "search_bili": return JSON.stringify(await searchVideos(env, String(args.keyword || ""), typeof args.page === "number" ? args.page : 1)); case "search_local": return JSON.stringify(await searchTracks(env, String(args.keyword || ""), 20)); default: return JSON.stringify({ error: `Unknown tool: ${name}` }); } }

const CORS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" };

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const { stream, send, close } = createSSE();
  (async () => {
    try {
      send("status", { stage: "starting" });
      const body = (await request.json()) as { message?: string; history?: Array<{ role: string; content: string }> };
      if (!body.message?.trim()) { send("error", { error: "message is required" }); close(); return; }
      const msgs: ChatMsg[] = [{ role: "system", content: SYSTEM_PROMPT }];
      if (Array.isArray(body.history)) for (const m of body.history.slice(-16)) msgs.push({ role: m.role === "operator" ? "user" : "assistant", content: m.content });
      msgs.push({ role: "user", content: body.message });
      let resp: OpenRouterResponse;
      try { resp = await chatCompletion(env, msgs, TOOLS); } catch (err) { if (String(err).toLowerCase().includes("rate limited")) { send("output", { type: "assistant", message: { content: [{ type: "text", text: "所有 API key 均已限流，请稍后再试。" }] } }); send("done", { status: "completed" }); close(); return; } throw err; }
      if (resp.error) { send("error", { error: resp.error.message || "OpenRouter error" }); close(); return; }
      const choice = resp.choices?.[0]; if (!choice?.message) { send("error", { error: "No response from model" }); close(); return; }
      if (choice.message.tool_calls?.length) {
        for (const tc of choice.message.tool_calls) send("output", { type: "tool_call", name: tc.function.name, arguments: tc.function.arguments });
        const toolMsgs: ChatMsg[] = [];
        for (const tc of choice.message.tool_calls) { let a: Record<string, unknown> = {}; try { a = JSON.parse(tc.function.arguments); } catch {} toolMsgs.push({ role: "tool", content: await execTool(env, tc.function.name, a), tool_call_id: tc.id }); }
        let resp2: OpenRouterResponse;
        try { resp2 = await chatCompletion(env, [...msgs, { role: "assistant", content: choice.message.content || "", tool_calls: choice.message.tool_calls }, ...toolMsgs]); } catch (err) { if (String(err).toLowerCase().includes("rate limited")) { send("output", { type: "assistant", message: { content: [{ type: "text", text: "所有 API key 均已限流，请稍后再试。" }] } }); send("done", { status: "completed" }); close(); return; } throw err; }
        const c2 = resp2.choices?.[0]; if (c2?.message?.content) send("output", { type: "assistant", message: { content: [{ type: "text", text: c2.message.content }] } });
      } else if (choice.message.content) { send("output", { type: "assistant", message: { content: [{ type: "text", text: choice.message.content }] } }); }
      send("done", { status: "completed" }); close();
    } catch (err) { console.error("chat handler error:", err); send("error", { error: String(err) }); close(); }
  })();
  return new Response(stream, { headers: CORS });
};
