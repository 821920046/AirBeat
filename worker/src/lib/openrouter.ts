import type { Env } from "../types";

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenRouterChoice {
  message?: {
    role: string;
    content?: string;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string; code?: number };
}

// --- Key Pool（与 functions/api/chat.ts 保持一致） ---
async function getKeyPool(env: Env): Promise<string[]> {
  try {
    const raw = await env.CACHE.get("api_keys");
    if (raw) {
      const keys = JSON.parse(raw) as string[];
      if (Array.isArray(keys) && keys.length > 0) return keys;
    }
  } catch { /* KV 读取失败，fallback */ }
  if (env.OPENROUTER_API_KEY) return [env.OPENROUTER_API_KEY];
  return [];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MODEL_FALLBACKS = [
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3-coder:free",
  "deepseek/deepseek-v4-flash:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "moonshotai/kimi-k2.6:free",
  "openai/gpt-oss-20b:free",
];

/**
 * 调用 OpenRouter API（非流式），支持 function calling
 * 特性：多 key 轮换、多模型降级、429 不废整个模型
 */
export async function chatCompletion(
  env: Env,
  messages: ChatMsg[],
  tools?: unknown[]
): Promise<OpenRouterResponse> {
  const primaryModel = env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";
  const models = [primaryModel, ...MODEL_FALLBACKS.filter(m => m !== primaryModel)];
  const pool = shuffle(await getKeyPool(env));
  if (pool.length === 0) throw new Error("No API keys configured");

  for (const model of models) {
    const body: Record<string, unknown> = { model, messages, temperature: 0.7, max_tokens: 2048 };
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
          "HTTP-Referer": "https://airbeat.pages.dev",
          "X-Title": "AirBeat",
        },
        body: bodyStr,
      });

      if (resp.ok) return resp.json() as Promise<OpenRouterResponse>;

      // 429 → 这个 key 限流了，试下一个 key
      if (resp.status === 429) continue;

      // 其他错误（4xx 非 429 / 5xx）→ 记录并试下一个 key
      const t = await resp.text();
      console.error(`Model ${model} key ${key.slice(0, 12)}... error ${resp.status}: ${t.slice(0, 200)}`);
      modelRateLimited = false; // 不是限流，不标记模型限流
    }

    if (modelRateLimited) {
      console.log(`Model ${model}: all ${pool.length} key(s) rate limited, trying next model...`);
    } else {
      console.log(`Model ${model}: all keys failed (non-429), trying next model...`);
    }
  }

  throw new Error("All models rate limited");
}
