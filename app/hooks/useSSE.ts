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

export function useSSE(options: {
  url: string;
  body?: Record<string, unknown>;
  onMessage: (msg: SSEHookMessage) => void;
}) {
  const { url, body = {}, onMessage } = options;
  const bodyRef = useRef(body);
  const onMsgRef = useRef(onMessage);
  useEffect(() => {
    bodyRef.current = body;
  }, [body]);
  useEffect(() => {
    onMsgRef.current = onMessage;
  }, [onMessage]);

  const abortRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(
    async (message: string) => {
      cancel();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ ...bodyRef.current, message }),
          signal: ac.signal,
        });

        if (!res.ok) {
          onMsgRef.current({
            event: "error",
            data: { status: res.status, text: await res.text() },
          });
          return;
        }

        const stream = res.body;
        if (!stream) return;

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const { events, buffer } = consumeSseChunks(buf);
          buf = buffer;
          for (const evt of events) {
            onMsgRef.current(evt);
          }
        }

        buf += decoder.decode();
        if (buf.trim()) {
          const { events } = consumeSseChunks(buf + "\n\n");
          for (const evt of events) onMsgRef.current(evt);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        onMsgRef.current({ event: "error", data: String(err) });
      } finally {
        setLoading(false);
        if (abortRef.current === ac) abortRef.current = null;
      }
    },
    [url, cancel]
  );

  return { send, loading, cancel };
}
