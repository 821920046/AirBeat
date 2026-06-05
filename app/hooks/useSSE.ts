"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SSEHookMessage = { event: string; data: unknown };

function consumeSseChunks(
  raw: string
): { events: SSEHookMessage[]; buffer: string } {
  const events: SSEHookMessage[] = [];
  const parts = raw.split(/\r?\n\r?\n/);
  const buffer = parts.pop() ?? "";

  for (const part of parts) {
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of part.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim() || "message";
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).startsWith(" ") ? line.slice(6) : line.slice(5));
      }
    }
    if (!dataLines.length) continue;
    const dataStr = dataLines.join("\n");
    let parsed: unknown = dataStr;
    try {
      parsed = JSON.parse(dataStr) as unknown;
    } catch {
      /* plain text payload */
    }
    events.push({ event: eventType, data: parsed });
  }

  return { events, buffer };
}

/** 指数退避延迟：1s → 2s → 4s → 8s，最多 4 次 */
const BACKOFF_MS = [1000, 2000, 4000, 8000];
const MAX_RETRIES = 4;

export function useSSE(options: {
  url: string;
  body?: Record<string, unknown>;
  onMessage: (msg: SSEHookMessage) => void;
}) {
  const { url, body = {}, onMessage } = options;
  const bodyRef = useRef(body);
  const onMsgRef = useRef(onMessage);
  // 保存最后一次发送的参数，用于自动重连
  const lastSendRef = useRef<{ message: string; extra?: Record<string, unknown> } | null>(null);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);
  useEffect(() => {
    onMsgRef.current = onMessage;
  }, [onMessage]);

  const abortRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    retryCountRef.current = 0;
    lastSendRef.current = null;
  }, []);

  const send = useCallback(
    async (message: string, extra?: Record<string, unknown>) => {
      cancel();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);

      // 保存以便重连时使用
      lastSendRef.current = { message, extra };

      const sendRequest = async (isRetry: boolean) => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({ ...bodyRef.current, ...(isRetry ? extra : (extra ?? {})), message, _retry: isRetry }),
            signal: ac.signal,
          });

          if (!res.ok) {
            onMsgRef.current({
              event: "error",
              data: { status: res.status, text: await res.text() },
            });
            return;
          }

          // 连接成功，重置重试计数
          retryCountRef.current = 0;

          const stream = res.body;
          if (!stream) return;

          const reader = stream.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let doneReceived = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const { events, buffer } = consumeSseChunks(buf);
            buf = buffer;
            for (const evt of events) {
              if (evt.event === "done") doneReceived = true;
              onMsgRef.current(evt);
            }
          }

          buf += decoder.decode();
          if (buf.trim()) {
            const { events } = consumeSseChunks(buf + "\n\n");
            for (const evt of events) {
              if (evt.event === "done") doneReceived = true;
              onMsgRef.current(evt);
            }
          }

          // 正常完成（收到 done 事件），不重连
          if (doneReceived) {
            lastSendRef.current = null;
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          onMsgRef.current({ event: "error", data: String(err) });

          // 网络错误 → 自动重连（非用户取消、非已收到 done）
          if (retryCountRef.current < MAX_RETRIES && lastSendRef.current) {
            const delay = BACKOFF_MS[retryCountRef.current] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
            retryCountRef.current++;
            console.log(`[SSE] 将在 ${delay}ms 后第 ${retryCountRef.current} 次重连...`);
            await new Promise((r) => setTimeout(r, delay));
            // 检查是否在等待期间被取消了
            if (abortRef.current === ac && lastSendRef.current) {
              const newAc = new AbortController();
              abortRef.current = newAc;
              await sendRequest(true);
            }
          }
        } finally {
          setLoading(false);
          if (abortRef.current === ac) abortRef.current = null;
        }
      };

      await sendRequest(false);
    },
    [url, cancel]
  );

  return { send, loading, cancel };
}
