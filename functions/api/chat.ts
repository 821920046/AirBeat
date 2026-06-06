interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; }
interface Track { id: string; title: string; author: string; date: string; filename: string; subDir: string; size: number; url: string; bvid?: string; }
interface DBTrackRow { id: number; title: string; author: string; bvid: string | null; r2_key: string; duration: number | null; file_size: number | null; date_added: string; source: string; }
interface ChatMsg { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: ToolCall[]; }
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string }; }
interface OpenRouterResponse { choices?: Array<{ message?: { role: string; content?: string; tool_calls?: ToolCall[] } }>; error?: { message?: string; code?: number }; }

// --- 数据库 ---
function rowToTrack(row: DBTrackRow): Track { return { id: String(row.id), title: row.title, author: row.author || "", date: row.date_added || "", filename: row.r2_key.split("/").pop() || "", subDir: "", size: row.file_size || 0, url: `/audio/${row.r2_key}`, bvid: row.bvid || undefined }; }
async function searchTracks(env: Env, query: string, limit = 20): Promise<{ total: number; tracks: Track[] }> { if (!query.trim()) { const rows = await env.DB.prepare("SELECT * FROM tracks ORDER BY date_added DESC LIMIT ?").bind(limit).all<DBTrackRow>(); return { total: rows.results.length, tracks: rows.results.map(rowToTrack) }; } const like = `%${query}%`; const countRow = await env.DB.prepare("SELECT COUNT(*) as cnt FROM tracks WHERE title LIKE ? OR author LIKE ?").bind(like, like).first<{ cnt: number }>(); const rows = await env.DB.prepare("SELECT * FROM tracks WHERE title LIKE ? OR author LIKE ? ORDER BY date_added DESC LIMIT ?").bind(like, like, limit).all<DBTrackRow>(); return { total: countRow?.cnt || 0, tracks: rows.results.map(rowToTrack) }; }

// --- OpenRouter Key Pool ---
async function getKeyPool(env: Env): Promise<string[]> {
  try { const raw = await env.CACHE.get("api_keys"); if (raw) { const keys = JSON.parse(raw) as string[]; if (Array.isArray(keys) && keys.length > 0) return keys; } } catch {}
  if (env.OPENROUTER_API_KEY) return [env.OPENROUTER_API_KEY];
  return [];
}

function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const MODEL_FALLBACKS = ["google/gemma-4-26b-a4b-it:free", "qwen/qwen3-coder:free", "deepseek/deepseek-v4-flash:free", "meta-llama/llama-3.3-70b-instruct:free", "moonshotai/kimi-k2.6:free", "openai/gpt-oss-20b:free"];

async function chatCompletion(env: Env, messages: ChatMsg[], tools?: unknown[]): Promise<OpenRouterResponse> {
  const primaryModel = env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";
  const models = [primaryModel, ...MODEL_FALLBACKS.filter(m => m !== primaryModel)];
  const pool = shuffle(await getKeyPool(env));
  if (pool.length === 0) throw new Error("No API keys configured");
  const keysPerModel = Math.min(2, pool.length);
  for (const model of models) {
    const body: Record<string, unknown> = { model, messages, temperature: 0.7, max_tokens: 4096 };
    if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = "auto"; }
    const bodyStr = JSON.stringify(body);
    let modelRateLimited = false;
    for (let i = 0; i < keysPerModel; i++) {
      const key = pool[i % pool.length];
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://airbeat-8mo.pages.dev", "X-Title": "AirBeat" }, body: bodyStr });
      if (resp.status === 429) { modelRateLimited = true; break; }
      if (!resp.ok) { const t = await resp.text(); console.error(`Model ${model} error ${resp.status}: ${t}`); break; }
      return resp.json() as Promise<OpenRouterResponse>;
    }
    if (modelRateLimited) console.log(`Model ${model} rate limited, trying next...`);
  }
  throw new Error("All models rate limited");
}

// --- SSE & 工具 ---
const SYSTEM_PROMPT = `你是 AirBeat 的 AI 音乐助手，运行在一个终端风格的音乐播放器里。保持简洁中文，像终端命令行一样回复用户。

## 你的核心能力
1. **搜索 B站 视频** — 用 web_search 工具搜索 bilibili.com，提取视频 BV号、标题、作者、时长
2. **搜索本地曲库** — 用 search_local 工具查询已收藏的歌曲
3. **闲聊** — 简短回答音乐相关问题

## 工作流程
当用户说"搜 XXX"、"我想听 XXX"、"找 XXX的歌"、"放 XXX"等音乐请求时：
1. 先用 search_local 查本地是否已有该歌曲
2. 如果没有或者用户明确要搜 B站，用 web_search 搜 bilibili.com
   搜索格式: site:bilibili.com 歌曲名 歌手名 MV
3. 从搜索结果中提取视频信息，用 \`\`\`tracks 代码块输出

当用户只是聊天/问问题时，直接回答，不要无故搜索。

## 输出 tracks 格式
必须是合法的 JSON 数组：
\`\`\`tracks
[{"bvid":"BVxxxxxx","title":"歌曲名","author":"作者/UP主","duration":"03:45","url":"","id":"BVxxxxxx"}]
\`\`\`
每个 track 必须有 bvid, title, author。duration 和 url 可选。
搜索到的 B站 结果 url 留空，id 填 bvid，用户点击"ADD"后系统会自动处理。

## 重要限制
- web_search 只能搜索公开网页信息，无法调用 B站 API
- 搜索 B站 时用中文关键词
- tracks 数组中的 JSON 必须严格合法，字段名用双引号`;

const TOOLS = [
  { type: "function" as const, function: { name: "search_local", description: "搜索本地已收藏的曲库", parameters: { type: "object", properties: { keyword: { type: "string", description: "搜索关键词（歌名/歌手）" } }, required: ["keyword"] } } },
  { type: "function" as const, function: { name: "web_search", description: "在 B站 (bilibili.com) 搜索视频。用于查找用户想听的歌曲 MV、音乐视频等。返回搜索结果中提取的视频信息（BV号、标题、作者、时长）。", parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词，格式: site:bilibili.com 歌曲名 歌手" } }, required: ["query"] } } },
];

function createSSE() { const enc = new TextEncoder(); let ctrl: ReadableStreamDefaultController<Uint8Array>; const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } }); return { stream, send(ev: string, d: unknown) { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); }, close() { ctrl.close(); } }; }

// 执行 web_search — 用 Google Custom Search 或直接 web fetch 搜索 B站
async function execWebSearch(query: string): Promise<string> {
  // 从公开搜索引擎抓取 B站 搜索结果
  // Google: site:bilibili.com 关键词
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
  try {
    const resp = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    const html = await resp.text();

    // 从 Google 搜索结果中提取 B站 视频链接
    // B站视频 URL 格式: bilibili.com/video/BVxxxxxx 或 b23.tv/xxxxx
    const bvRe = /bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/g;
    const bvMatches = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = bvRe.exec(html)) !== null) {
      bvMatches.add(m[1]!);
    }

    // 提取标题（Google 搜索结果标题通常在 h3 中）
    const titleRe = /<h3[^>]*>([^<]+(?:<[^/][^>]*>[^<]*)*?)<\/h3>/gi;
    const titles: string[] = [];
    let tm: RegExpExecArray | null;
    while ((tm = titleRe.exec(html)) !== null) {
      const clean = tm[1]!.replace(/<[^>]*>/g, "").trim();
      if (clean && !clean.includes("Google") && !clean.includes("Search")) {
        titles.push(clean);
      }
    }

    const bvids = [...bvMatches].slice(0, 8);
    if (bvids.length === 0) {
      return JSON.stringify({ results: [], note: "未在 B站 找到匹配视频，请尝试更精确的关键词" });
    }

    const results = bvids.map((bv, i) => ({
      bvid: bv,
      title: titles[i] || "(从搜索结果提取，点击查看详情)",
      author: "",
      duration: "",
      url: `https://www.bilibili.com/video/${bv}`,
    }));

    return JSON.stringify({ results, total: bvids.length });
  } catch (err) {
    return JSON.stringify({ results: [], error: String(err) });
  }
}

async function execTool(env: Env, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_local":
      return JSON.stringify(await searchTracks(env, String(args.keyword || ""), 20));
    case "web_search":
      return await execWebSearch(String(args.query || ""));
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

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
      // 多轮 tool_call 循环 — 最多 3 轮
      const MAX_TOOL_ROUNDS = 3;
      let currentMessages = [...msgs];
      for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
        const choice = resp.choices?.[0]; if (!choice?.message) { send("error", { error: "No response from model" }); close(); return; }

        if (choice.message.tool_calls?.length) {
          for (const tc of choice.message.tool_calls) send("output", { type: "tool_call", name: tc.function.name, arguments: tc.function.arguments });
          const toolMsgs: ChatMsg[] = [];
          for (const tc of choice.message.tool_calls) { let a: Record<string, unknown> = {}; try { a = JSON.parse(tc.function.arguments); } catch {} toolMsgs.push({ role: "tool", content: await execTool(env, tc.function.name, a), tool_call_id: tc.id }); }
          currentMessages = [...currentMessages, { role: "assistant", content: choice.message.content || "", tool_calls: choice.message.tool_calls }, ...toolMsgs];
          if (round < MAX_TOOL_ROUNDS) {
            send("status", { stage: `tool_round_${round + 1}` });
            try { resp = await chatCompletion(env, currentMessages, TOOLS); } catch (err) { if (String(err).toLowerCase().includes("rate limited")) { send("output", { type: "assistant", message: { content: [{ type: "text", text: "所有 API key 均已限流，请稍后再试。" }] } }); send("done", { status: "completed" }); close(); return; } throw err; }
            continue;
          }
        } else if (choice.message.content) {
          send("output", { type: "assistant", message: { content: [{ type: "text", text: choice.message.content }] } });
        }
        break;
      }
      send("done", { status: "completed" }); close();
    } catch (err) { console.error("chat handler error:", err); send("error", { error: String(err) }); close(); }
  })();
  return new Response(stream, { headers: CORS });
};
