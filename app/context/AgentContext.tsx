"use client";

import type { AgentState, ChatMessage } from "@/app/lib/types";
import { apiUrl } from "@/app/lib/config";
import { searchVideos } from "@/app/lib/bili";
import { useSSE } from "@/app/hooks/useSSE";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type AgentCtxValue = AgentState & {
  sendMessage: (text: string) => Promise<void>;
  cancel: () => void;
};

const AgentContext = createContext<AgentCtxValue | null>(null);

const SEARCH_COMMAND_RE = /^\/search\s+(.+)/i;
const QUESTION_RE = /[?？]$|^(?:为什么|怎么|如何|什么是|介绍|解释|聊聊)/;
const MUSIC_INTENT_RE = /(?:搜索|搜|查找|找|想听|听歌|播放|点播|来一首|来点|推荐|歌曲|音乐|歌)/i;

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanSearchKeyword(text: string): string {
  return text
    .replace(SEARCH_COMMAND_RE, "$1")
    .replace(/^(?:请|帮我|给我|我想|我要)?(?:搜索|搜一下|搜|查找|找|播放|点播|想听|听|来一首|来点|推荐)(?:一下)?/i, "")
    .replace(/(?:B站|b站|视频|歌曲|音乐|的歌|歌|几首|一些|一下)/g, " ")
    .replace(/[，。！？?：:、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function directSearchKeyword(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\/(?!search\b)/i.test(trimmed)) return null;

  const command = trimmed.match(SEARCH_COMMAND_RE);
  if (command?.[1]?.trim()) return command[1].trim();

  const hasMusicIntent = MUSIC_INTENT_RE.test(trimmed);
  if (!hasMusicIntent && QUESTION_RE.test(trimmed)) return null;
  // 启发式规则：无音乐意图词且不是问句的短输入(<24字符)当作搜索关键词（如"周杰伦""G.E.M."），
  // 长输入（≥24字符）当作自然语言问题路由给 AI 推理（避免把"我今天心情不好想放松一下"当搜索词）
  if (!hasMusicIntent && trimmed.length > 24) return null;

  const keyword = hasMusicIntent ? cleanSearchKeyword(trimmed) : trimmed;
  return keyword.length > 0 ? keyword : null;
}

function appendFromSdkPayload(
  data: unknown,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>
) {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, unknown>;

  const sid = d.session_id;
  if (typeof sid === "string" && sid) {
    setSessionId((prev) => prev ?? sid);
  }

  const t = d.type;
  const ts = Date.now();

  if (t === "assistant") {
    const message = d.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) return;
    const blocks = content as Array<Record<string, unknown>>;
    for (const block of blocks) {
      if (block.type === "text") {
        const text = block.text;
        if (typeof text === "string" && text.trim()) {
          setMessages((m) => [
            ...m,
            { id: newId(), role: "agent" as const, content: text, timestamp: ts },
          ]);
        }
      } else if (block.type === "tool_use") {
        const tool = block.name;
        if (typeof tool === "string") {
          let summary = `Tool: ${tool}`;
          if (block.input !== undefined) {
            try {
              summary += `\n${JSON.stringify(block.input).slice(0, 480)}`;
            } catch {
              summary += "\n[input]";
            }
          }
          setMessages((m) => [
            ...m,
            {
              id: newId(),
              role: "tool" as const,
              content: summary,
              timestamp: ts,
              toolName: tool,
            },
          ]);
        }
      }
    }
    return;
  }

  if (t === "tool_call") {
    const name =
      (typeof d.name === "string" && d.name) ||
      (typeof d.tool === "string" && d.tool) ||
      "tool";
    let body =
      typeof d.arguments === "string"
        ? d.arguments
        : d.input !== undefined
          ? JSON.stringify(d.input)
          : "";
    if (!body.trim()) body = "{}";
    setMessages((m) => [
      ...m,
      {
        id: newId(),
        role: "tool" as const,
        content: `${name}\n${body.slice(0, 512)}`,
        timestamp: ts,
        toolName: name,
      },
    ]);
    return;
  }

  if (t === "result" && d.subtype === "success" && typeof d.result === "string") {
    const text = d.result.trim();
    if (text.length) {
      setMessages((m) => {
        const lastAgent = [...m].reverse().find((msg) => msg.role === "agent");
        if (lastAgent && lastAgent.content === text) return m;
        return [
          ...m,
          { id: newId(), role: "agent" as const, content: text, timestamp: ts },
        ];
      });
    }
  }
}

export function AgentProvider({
  children,
  chatApiPath = apiUrl("/api/chat"),
}: {
  children: ReactNode;
  chatApiPath?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const historyRef = useRef<Array<{ role: string; content: string }>>([]);

  const { send, loading, cancel: sseCancel } = useSSE({
    url: chatApiPath,
    body: {},
    onMessage: (msg) => {
      if (msg.event === "output") {
        appendFromSdkPayload(msg.data, setMessages, setSessionId);
        return;
      }
      if (msg.event === "error") {
        const err =
          typeof msg.data === "string"
            ? msg.data
            : JSON.stringify(msg.data ?? "error");
        setMessages((m) => [
          ...m,
          { id: newId(), role: "system", content: err, timestamp: Date.now() },
        ]);
      }
    },
  });

  const cancel = useCallback(() => {
    sseCancel();
  }, [sseCancel]);

  const runDirectSearch = useCallback(async (keyword: string) => {
    try {
      const result = await searchVideos(keyword);
      if (result.videos.length) {
        const tracks = result.videos.map((v) => ({
          id: v.bvid,
          bvid: v.bvid,
          title: v.title,
          author: v.author,
          duration: v.duration,
          url: "",
          date: "",
          filename: "",
          subDir: "",
          size: 0,
        }));
        setMessages((m) => [
          ...m,
          {
            id: newId(),
            role: "agent" as const,
            content: "```tracks\n" + JSON.stringify(tracks) + "\n```",
            timestamp: Date.now(),
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: newId(),
            role: "system" as const,
            content: `未找到「${keyword}」的相关结果`,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: newId(),
          role: "system" as const,
          content: `搜索失败: ${String(err)}`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const ts = Date.now();

      setMessages((m) => {
        const next = [
          ...m,
          { id: newId(), role: "operator" as const, content: trimmed, timestamp: ts },
        ];
        historyRef.current = next
          .filter((msg) => msg.role === "agent" || msg.role === "operator")
          .slice(-30)
          .map((msg) => ({ role: msg.role, content: msg.content }));
        return next;
      });

      const keyword = directSearchKeyword(trimmed);
      if (keyword) {
        await runDirectSearch(keyword);
        return;
      }

      await send(trimmed, { history: historyRef.current });
    },
    [runDirectSearch, send]
  );

  const value = useMemo<AgentCtxValue>(
    () => ({
      messages,
      loading,
      sessionId,
      sendMessage,
      cancel,
    }),
    [messages, loading, sessionId, sendMessage, cancel]
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent() {
  const v = useContext(AgentContext);
  if (!v) throw new Error("useAgent must be used within AgentProvider");
  return v;
}
