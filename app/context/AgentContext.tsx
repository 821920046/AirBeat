"use client";

import type { AgentState, ChatMessage } from "@/app/lib/types";
import { useMode } from "@/app/context/ModeContext";
import { useSSE } from "@/app/hooks/useSSE";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type AgentCtxValue = AgentState & {
  sendMessage: (text: string) => Promise<void>;
  queueConvert: (bvids: string[]) => void;
  convertQueue: string[];
  convertingSet: Set<string>;
  convertedSet: Set<string>;
};

const AgentContext = createContext<AgentCtxValue | null>(null);

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
              summary += `\n[input]`;
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
    if (text.length)
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

export function AgentProvider({
  children,
  chatApiPath = "/api/chat",
}: {
  children: ReactNode;
  chatApiPath?: string;
}) {
  const { mode } = useMode();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [convertQueue, setConvertQueue] = useState<string[]>([]);
  const [convertingSet, setConvertingSet] = useState<Set<string>>(new Set());
  const [convertedSet, setConvertedSet] = useState<Set<string>>(new Set());

  const historyRef = useRef<Array<{ role: string; content: string }>>([]);

  const { send, loading } = useSSE({
    url: chatApiPath,
    body: { mode },
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

  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const convertQueueRef = useRef(convertQueue);
  convertQueueRef.current = convertQueue;

  const flush = useCallback(() => {
    const queue = convertQueueRef.current;
    if (!queue.length) return;

    setConvertQueue([]);
    setConvertingSet((prev) => {
      const next = new Set(prev);
      for (const bv of queue) next.add(bv);
      return next;
    });

    const urls = queue
      .map((bv) => `https://www.bilibili.com/video/${bv}`)
      .join("\n");
    const msg = `请将以下B站视频转为音频并加入播放列表:\n${urls}`;
    send(msg);
  }, [send]);

  const queueConvert = useCallback(
    (bvids: string[]) => {
      setConvertQueue((prev) => {
        const existing = new Set([...prev, ...Array.from(convertingSet), ...Array.from(convertedSet)]);
        const fresh = bvids.filter((bv) => !existing.has(bv));
        if (!fresh.length) return prev;
        return [...prev, ...fresh];
      });

      if (!loadingRef.current) {
        setTimeout(() => flush(), 0);
      }
    },
    [convertingSet, convertedSet, flush]
  );

  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;

    if (wasLoading && !loading) {
      setConvertingSet((prev) => {
        if (prev.size > 0) {
          setConvertedSet((done) => {
            const next = new Set(done);
            for (const bv of prev) next.add(bv);
            return next;
          });
        }
        return new Set();
      });
      if (convertQueueRef.current.length > 0) {
        setTimeout(() => flush(), 50);
      }
    }
  }, [loading, flush]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const ts = Date.now();
      setMessages((m) => {
        const next = [
          ...m,
          {
            id: newId(),
            role: "operator" as const,
            content: trimmed,
            timestamp: ts,
          },
        ];
        historyRef.current = next
          .filter((msg) => msg.role === "agent" || msg.role === "operator")
          .slice(-30)
          .map((msg) => ({ role: msg.role, content: msg.content }));
        return next;
      });
      await send(trimmed, { history: historyRef.current });
    },
    [send]
  );

  const value = useMemo<AgentCtxValue>(
    () => ({
      messages,
      loading,
      sessionId,
      sendMessage,
      queueConvert,
      convertQueue,
      convertingSet,
      convertedSet,
    }),
    [messages, loading, sessionId, sendMessage, queueConvert, convertQueue, convertingSet, convertedSet]
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
