interface Env { DB: D1Database; AUDIO_BUCKET: R2Bucket; CACHE: KVNamespace; OPENROUTER_API_KEY: string; OPENROUTER_MODEL: string; MUSIC_API_BASE?: string; }
interface Track { id: string; title: string; author: string; date: string; filename: string; subDir: string; size: number; url: string; bvid?: string; duration?: number; source?: string; }
interface DBTrackRow { id: number; title: string; author: string; bvid: string | null; r2_key: string; duration: number | null; file_size: number | null; date_added: string; source: string; }
interface ChatMsg { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: ToolCall[]; }
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string }; }
interface OpenRouterResponse { choices?: Array<{ message?: { role: string; content?: string; tool_calls?: ToolCall[] } }>; error?: { message?: string; code?: number }; }

// --- 数据库 ---
function rowToTrack(row: DBTrackRow): Track {
  const sec = row.duration || 0;
  const durStr = sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}` : "";
  return {
    id: String(row.id),
    title: row.title,
    author: row.author || "",
    date: row.date_added || "",
    filename: row.r2_key.split("/").pop() || "",
    subDir: "",
    size: row.file_size || 0,
    url: `/audio/${row.r2_key}`,
    bvid: row.bvid || undefined,
    duration: sec,
    source: "local",
    artist: row.author || "",
  };
}
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

  for (const model of models) {
    const body: Record<string, unknown> = { model, messages, temperature: 0.7, max_tokens: 4096 };
    if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = "auto"; }
    const bodyStr = JSON.stringify(body);

    // 遍历所有 key，直到某个 key 成功；只有全部 key 都 429 才算模型限流
    let modelRateLimited = true;
    for (const key of pool) {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://airbeat-8mo.pages.dev",
          "X-Title": "AirBeat",
        },
        body: bodyStr,
      });

      if (resp.ok) return resp.json() as Promise<OpenRouterResponse>;

      // 429 → 这个 key 限流了，试下一个 key
      if (resp.status === 429) continue;

      // 其他错误（4xx 非 429 / 5xx）→ 这个 key 可能有问题，也试下一个
      const t = await resp.text();
      console.error(`Model ${model} key ${key.slice(0, 12)}... error ${resp.status}: ${t.slice(0, 200)}`);
      modelRateLimited = false; // 不是限流，是其他错误，不标记模型限流
    }

    if (modelRateLimited) {
      console.log(`Model ${model}: all ${pool.length} key(s) rate limited, trying next model...`);
    } else {
      console.log(`Model ${model}: all keys failed (non-429), trying next model...`);
    }
  }
  throw new Error("All models rate limited");
}

// --- SSE & 工具 ---
const SYSTEM_PROMPT = `你是 AirBeat 的 AI 音乐助手，运行在一个终端风格的音乐播放器里。保持简洁中文，像终端命令行一样回复用户。

## 你的核心能力
1. **搜索音乐** — 用 search_music 工具搜索音乐，支持多源（网易云/YouTube/B站），优先返回网易云结果
2. **搜索本地曲库** — 用 search_local 工具查询已收藏的歌曲
3. **闲聊** — 简短回答音乐相关问题

## 工作流程
当用户说"搜 XXX"、"我想听 XXX"、"找 XXX的歌"、"放 XXX"等音乐请求时：
1. 先用 search_local 查本地是否已有该歌曲
2. 用 search_music 搜索在线音乐
3. 从搜索结果中提取信息，用 \`\`\`tracks 代码块输出

当用户只是聊天/问问题时，直接回答，不要无故搜索。

## 输出 tracks 格式
必须是合法的 JSON 数组：
\`\`\`tracks
[{"id":"歌曲ID","title":"歌曲名","artist":"歌手","duration":"03:45","source":"netease","url":"https://music.163.com/song?id=歌曲ID"}]
\`\`\`
每个 track 必须有 id, title, artist, source, url 字段。duration 可选。
source 取值：netease（网易云）、youtube（YouTube）、bilibili（B站）、local（本地已收藏）
- 如果来自 search_local 返回的数据，source 必须是 "local"，url 和 artist 必须原样保留
- search_local 返回的数据已包含 url（/audio/ 开头）和 source:"local"，直接复制即可

## 重要限制
- search_music 会自动从多个音乐源搜索，不需要分别指定平台
- tracks 数组中的 JSON 必须严格合法，字段名用双引号
- 本地搜索结果优先放在前面`;

const TOOLS = [
  { type: "function" as const, function: { name: "search_local", description: "搜索本地已收藏的曲库", parameters: { type: "object", properties: { keyword: { type: "string", description: "搜索关键词（歌名/歌手）" } }, required: ["keyword"] } } },
  { type: "function" as const, function: { name: "search_music", description: "搜索在线音乐（网易云/YouTube/B站多源）。查找歌曲、MV、音频时使用。", parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词，如: 周杰伦 晴天" } }, required: ["query"] } } },
];

function createSSE() { const enc = new TextEncoder(); let ctrl: ReadableStreamDefaultController<Uint8Array>; const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } }); return { stream, send(ev: string, d: unknown) { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); }, close() { ctrl.close(); } }; }

async function execWebSearch(query: string, env: Env): Promise<string> {
  // 调用内网 music API 搜索多源音乐
  const apiBase = env.MUSIC_API_BASE || "";

  // 尝试用网易云 API 直接搜索
  if (apiBase) {
    try {
      const ncmResp = await fetch(`${apiBase}/search?keywords=${encodeURIComponent(query)}&type=1&limit=10`, {
        headers: { "User-Agent": "AirBeat/1.0" },
      });
      if (ncmResp.ok) {
        const json = (await ncmResp.json()) as {
          code: number;
          result?: { songs?: Array<{ id: number; name: string; ar?: Array<{ name: string }>; dt?: number; al?: { picUrl?: string } }> };
        };
        if (json.code === 200 && json.result?.songs?.length) {
          const tracks = json.result.songs.map(s => {
            const sec = Math.floor((s.dt || 0) / 1000);
            return {
              id: String(s.id),
              title: s.name,
              artist: s.ar?.map(a => a.name).join("/") || "未知",
              duration: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`,
              source: "netease",
              url: `https://music.163.com/song?id=${s.id}`,
            };
          });
          return JSON.stringify({ tracks, usedSource: "netease" });
        }
      }
    } catch (err) {
      console.warn("[chat] netease search failed:", err);
    }
  }

  // Fallback: Google + B站搜索
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent("site:bilibili.com " + query)}&num=10`;
  try {
    const resp = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    const html = await resp.text();

    const bvRe = /bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/g;
    const bvMatches = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = bvRe.exec(html)) !== null) {
      bvMatches.add(m[1]!);
    }

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
      return JSON.stringify({ tracks: [], usedSource: "none", note: "未找到匹配视频" });
    }

    const tracks = bvids.map((bv, i) => ({
      id: bv,
      title: titles[i] || "(从搜索结果提取)",
      artist: "",
      duration: "",
      source: "bilibili",
      url: `https://www.bilibili.com/video/${bv}`,
    }));

    return JSON.stringify({ tracks, usedSource: "bilibili" });
  } catch (err) {
    return JSON.stringify({ tracks: [], error: String(err) });
  }
}

async function execTool(env: Env, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_local":
      return JSON.stringify(await searchTracks(env, String(args.keyword || ""), 20));
    case "search_music":
      return await execWebSearch(String(args.query || ""), env);
    case "web_search":
      return await execWebSearch(String(args.query || ""), env);
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
