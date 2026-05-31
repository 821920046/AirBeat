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
    const body: Record<string, unknown> = { model, messages, temperature: 0.7, max_tokens: 2048 };
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
const SYSTEM_PROMPT = `你是 AirBeat 的 AI 音乐助手。保持简洁的中文终端风格语气。

## 你的能力
- 搜索本地曲库中已收藏的歌曲
- 回答音乐相关问题、闲聊

## 关于搜索 B站
你无法直接搜索 B站。当用户想搜索 B站歌曲时，告诉他们使用 /search 命令：
"请使用 /search 关键词 搜索 B站视频"

## 输出格式
当推荐本地歌曲时，用 \`\`\`tracks 代码块包裹 JSON 数组。`;

const TOOLS = [
  { type: "function" as const, function: { name: "search_local", description: "搜索本地曲库中的已收藏歌曲", parameters: { type: "object", properties: { keyword: { type: "string", description: "搜索关键词" } }, required: ["keyword"] } } },
];

function createSSE() { const enc = new TextEncoder(); let ctrl: ReadableStreamDefaultController<Uint8Array>; const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } }); return { stream, send(ev: string, d: unknown) { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); }, close() { ctrl.close(); } }; }
async function execTool(env: Env, name: string, args: Record<string, unknown>): Promise<string> { switch (name) { case "search_local": return JSON.stringify(await searchTracks(env, String(args.keyword || ""), 20)); default: return JSON.stringify({ error: `Unknown tool: ${name}` }); } }

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
