import { searchVideos } from "../lib/bili";
import { searchMusic } from "../lib/music-sources";
import { searchTracks } from "../lib/db";
import { createSources } from "./_sources";
import { chatCompletion } from "../lib/openrouter";
import { CORS_HEADERS } from "../lib/cors";
import type { Env } from "../types";

// System prompt — 支持多源音乐搜索（网易云/YouTube/B站）
const SYSTEM_PROMPT = `你是 AirBeat 的 AI 音乐助手。保持简洁的中文终端风格语气。

## 你的能力
你可以通过工具搜索音乐（网易云/YouTube/B站多源）和本地曲库，然后将结果推荐给用户。

## 搜索规则
- 用户想找音乐、歌曲等，通过 search_music 工具搜索（已整合多源，优先网易云）
- 用户说"推荐几首"等模糊请求时，用热门关键词搜索
- 可多次调用工具，使用不同关键词扩大搜索范围
- 搜索返回结果后直接推荐，不需要额外检查
- **输出 tracks 时，所有字段值必须原样复制，禁止缩写或重写**

## 推荐输出格式（严格遵守）

当向用户推荐歌曲时，先用自然语言简要介绍，然后 **必须** 将曲目放在独立的 tracks 代码块中：

\`\`\`tracks
[
  {"id":"歌曲ID","title":"歌曲名","artist":"歌手","duration":"03:45","source":"netease","url":"https://music.163.com/song?id=歌曲ID"}
]
\`\`\`

关键规则：
1. 代码块标记必须用 \`\`\`tracks 开头，\`\`\` 结尾，各占独立一行
2. 数据必须是合法 JSON 数组
3. 每个对象必须包含 id、title、artist、duration、source、url 六个字段
4. source 是来源标识：netease（网易云）、youtube（YouTube）、bilibili（B站）
5. url 是源页面链接，id 来自搜索结果，不要自行编造
6. 如果用户只是闲聊、提问，不需要输出 tracks 代码块

## 添加歌曲
当用户想添加某首歌时，告诉他们点击搜索结果中的 + ADD 按钮即可。你不需要处理下载或转换流程。`;

// Function calling 工具定义
const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_music",
      description: "搜索音乐（已整合网易云音乐、YouTube、B站等多源，优先网易云）。用户想找歌曲、音乐时使用。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "搜索关键词（歌名/歌手）",
          },
          limit: {
            type: "number",
            description: "返回数量，默认 10",
          },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_local",
      description: "搜索本地曲库中的已收藏歌曲。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "搜索关键词（歌名或歌手名）",
          },
        },
        required: ["keyword"],
      },
    },
  },
];

// SSE 发送辅助
function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  function send(event: string, data: unknown) {
    controller.enqueue(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  }

  function close() {
    controller.close();
  }

  return { stream, send, close };
}

// 执行工具调用
async function executeTool(
  env: Env,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "search_music": {
      const keyword = String(args.keyword || "");
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const sources = createSources(env);
      const { tracks, usedSource } = await searchMusic(keyword, sources, limit);
      return JSON.stringify({ tracks, usedSource });
    }
    case "search_local": {
      const keyword = String(args.keyword || "");
      const result = await searchTracks(env, keyword, 20);
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  const { stream, send, close } = createSSEStream();

  // 异步处理，不阻塞 Response 返回
  const process = async () => {
    try {
      send("status", { stage: "starting" });

      const body = (await request.json()) as {
        message?: string;
        history?: Array<{ role: string; content: string }>;
      };

      if (!body.message?.trim()) {
        send("error", { error: "message is required" });
        close();
        return;
      }

      // 构建消息历史
      const messages: Array<{
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        tool_call_id?: string;
        tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
      }> = [
        { role: "system", content: SYSTEM_PROMPT },
      ];

      // 加入对话历史
      if (Array.isArray(body.history)) {
        for (const msg of body.history.slice(-16)) {
          const role = msg.role === "operator" ? "user" : "assistant";
          messages.push({ role, content: msg.content });
        }
      }

      messages.push({ role: "user", content: body.message });

      // 第一轮调用
      let response;
      try {
        response = await chatCompletion(env, messages, TOOLS);
      } catch (err) {
        if (String(err).includes("RATE_LIMITED")) {
          send("output", {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "请求频率受限，请稍后再试。" }],
            },
          });
          send("done", { status: "completed" });
          close();
          return;
        }
        throw err;
      }

      if (response.error) {
        send("error", { error: response.error.message || "OpenRouter error" });
        close();
        return;
      }

      // 多轮 tool_call 循环 — 最多 3 轮
      const MAX_TOOL_ROUNDS = 3;
      for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      const choice = response.choices?.[0];
      if (!choice?.message) {
        send("error", { error: "No response from model" });
        close();
        return;
      }

      // 如果模型返回了 tool_calls
      if (choice.message.tool_calls?.length) {
        // 发送工具调用事件
        for (const tc of choice.message.tool_calls) {
          send("output", {
            type: "tool_call",
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }

        // 执行工具并收集结果
        const toolMessages: Array<{
          role: "tool";
          content: string;
          tool_call_id: string;
        }> = [];

        for (const tc of choice.message.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            /* empty */
          }
          const result = await executeTool(env, tc.function.name, args);
          toolMessages.push({
            role: "tool",
            content: result,
            tool_call_id: tc.id,
          });
        }

        messages.push({
          role: "assistant" as const,
          content: choice.message.content || "",
          tool_calls: choice.message.tool_calls,
        });
        messages.push(...toolMessages);

        // 继续下一轮
        if (round < MAX_TOOL_ROUNDS) {
          try {
            response = await chatCompletion(env, messages, TOOLS);
          } catch (err) {
            if (String(err).includes("RATE_LIMITED")) {
              send("output", {
                type: "assistant",
                message: {
                  content: [{ type: "text", text: "请求频率受限，请稍后再试。" }],
                },
              });
              send("done", { status: "completed" });
              close();
              return;
            }
            throw err;
          }
          continue;
        }
      } else if (choice.message.content) {
        // 纯文本响应
        send("output", {
          type: "assistant",
          message: {
            content: [{ type: "text", text: choice.message.content }],
          },
        });
      }
      break; // 无 tool_calls，退出
      }

      send("done", { status: "completed" });
      close();
    } catch (err) {
      console.error("chat handler error:", err);
      send("error", { error: String(err) });
      close();
    }
  };

  // 启动异步处理
  process();

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
