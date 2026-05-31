import { searchVideos, getVideoInfo, getDanmaku } from "../_lib/bili";
import { searchTracks } from "../_lib/db";
import { chatCompletion } from "../_lib/openrouter";
import { CORS_HEADERS, handleOptions } from "../_lib/cors";
import type { Env } from "../_lib/types";

// System prompt — 精简版，描述可用工具
const SYSTEM_PROMPT = `你是 AirBeat 的 AI 音乐助手。保持简洁的中文终端风格语气。

## 你的能力
你可以通过工具搜索 B站视频和本地曲库，然后将结果推荐给用户。

## 搜索规则
- 用户想找音乐、课程、演讲等任何内容，都通过 search_bili 工具搜索
- 根据用户意图提取合适的搜索关键词
- 分析搜索结果，筛选最相关的（通常 5-8 个）推荐给用户
- 可多次调用工具，使用不同关键词扩大搜索范围
- 搜索返回结果后直接推荐，不需要额外检查
- 用户说"推荐几首"等模糊请求时，用热门关键词搜索
- **输出 tracks 时，所有字段值必须原样复制，禁止缩写或重写**

## 推荐输出格式（严格遵守）

当向用户推荐歌曲时，先用自然语言简要介绍，然后 **必须** 将曲目放在独立的 tracks 代码块中：

\`\`\`tracks
[
  {"bvid":"BV1xxxxx","title":"视频标题","author":"UP主","duration":"4:32","url":"https://www.bilibili.com/video/BV1xxxxx"}
]
\`\`\`

关键规则：
1. 代码块标记必须用 \`\`\`tracks 开头，\`\`\` 结尾，各占独立一行
2. 数据必须是合法 JSON 数组
3. 每个对象必须包含 bvid、title、author、duration、url 五个字段
4. url 格式为 https://www.bilibili.com/video/{bvid}
5. bvid 字段来自搜索结果，不要自行编造
6. 如果用户只是闲聊、提问，不需要输出 tracks 代码块

## 添加歌曲
当用户想添加某首歌时，告诉他们点击搜索结果中的 + ADD 按钮即可。你不需要处理下载或转换流程。`;

// Function calling 工具定义
const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_bili",
      description: "搜索 B站视频。用户想找音乐、歌曲、课程、演讲等任何视频内容时使用。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" },
          page: { type: "number", description: "页码，默认 1" },
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
          keyword: { type: "string", description: "搜索关键词（歌名或歌手名）" },
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
    start(c) { controller = c; },
  });

  function send(event: string, data: unknown) {
    controller.enqueue(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  }

  function close() { controller.close(); }

  return { stream, send, close };
}

// 执行工具调用
async function executeTool(env: Env, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_bili": {
      const keyword = String(args.keyword || "");
      const page = typeof args.page === "number" ? args.page : 1;
      return JSON.stringify(await searchVideos(env, keyword, page));
    }
    case "search_local": {
      const keyword = String(args.keyword || "");
      return JSON.stringify(await searchTracks(env, keyword, 20));
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export const onRequestOptions = ({ request }: { request: Request }) => handleOptions(request);

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const { stream, send, close } = createSSEStream();

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

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
      ];

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
          send("output", { type: "assistant", message: { content: [{ type: "text", text: "请求频率受限，请稍后再试。" }] } });
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

      const choice = response.choices?.[0];
      if (!choice?.message) {
        send("error", { error: "No response from model" });
        close();
        return;
      }

      if (choice.message.tool_calls?.length) {
        for (const tc of choice.message.tool_calls) {
          send("output", { type: "tool_call", name: tc.function.name, arguments: tc.function.arguments });
        }

        const toolMessages: Array<{ role: "tool"; content: string; tool_call_id: string }> = [];

        for (const tc of choice.message.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
          const result = await executeTool(env, tc.function.name, args);
          toolMessages.push({ role: "tool", content: result, tool_call_id: tc.id });
        }

        const followUpMessages = [
          ...messages,
          { role: "assistant" as const, content: choice.message.content || "", tool_calls: choice.message.tool_calls },
          ...toolMessages,
        ];

        let secondResponse;
        try {
          secondResponse = await chatCompletion(env, followUpMessages);
        } catch (err) {
          if (String(err).includes("RATE_LIMITED")) {
            send("output", { type: "assistant", message: { content: [{ type: "text", text: "请求频率受限，请稍后再试。" }] } });
            send("done", { status: "completed" });
            close();
            return;
          }
          throw err;
        }

        const secondChoice = secondResponse.choices?.[0];
        if (secondChoice?.message?.content) {
          send("output", { type: "assistant", message: { content: [{ type: "text", text: secondChoice.message.content }] } });
        }
      } else if (choice.message.content) {
        send("output", { type: "assistant", message: { content: [{ type: "text", text: choice.message.content }] } });
      }

      send("done", { status: "completed" });
      close();
    } catch (err) {
      console.error("chat handler error:", err);
      send("error", { error: String(err) });
      close();
    }
  };

  process();

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
