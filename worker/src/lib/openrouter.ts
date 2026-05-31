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

/**
 * 调用 OpenRouter API（非流式），支持 function calling
 */
export async function chatCompletion(
  env: Env,
  messages: ChatMsg[],
  tools?: unknown[]
): Promise<OpenRouterResponse> {
  const model = env.OPENROUTER_MODEL || "qwen/qwen3-coder:free";

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://airbeat.pages.dev",
      "X-Title": "AirBeat",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter error ${resp.status}: ${text}`);
  }

  return resp.json() as Promise<OpenRouterResponse>;
}
