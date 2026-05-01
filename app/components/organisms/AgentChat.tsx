"use client";

import { Badge } from "@/app/components/atoms/Badge";
import { GlowDot } from "@/app/components/atoms/GlowDot";
import { Label } from "@/app/components/atoms/Label";
import { ChatMessage } from "@/app/components/molecules/ChatMessage";
import { CommandInput } from "@/app/components/molecules/CommandInput";
import { useAgent } from "@/app/context/AgentContext";
import { useEffect, useMemo, useRef } from "react";

const ThinkingCard = (
  <article className="mb-2 flex w-full justify-start" key="__thinking__">
    <div
      className="max-w-[min(100%,38rem)] border-l-[3px] border-transparent pl-4 pr-4 pt-3 pb-3"
      style={{ borderLeftColor: "var(--color-outline-variant)" }}
    >
      <div className="mb-2 flex items-baseline gap-2 opacity-92">
        <span
          className="terminal-label"
          style={{ fontFamily: "var(--font-headline)", letterSpacing: "var(--tracking-label)" }}
        >
          AGENT_01
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.12em]"
          style={{ fontFamily: "var(--font-headline)", color: "var(--color-outline)" }}
        >
          thinking
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: "var(--color-primary)",
              animation: `thinking-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  </article>
);

export function AgentChat() {
  const { messages, loading, sessionId, sendMessage } = useAgent();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const showThinking = loading && (messages.length === 0 || messages[messages.length - 1].role !== "agent");

  const rendered = useMemo(() => {
    if (!showThinking || messages.length === 0) {
      return showThinking
        ? [ThinkingCard]
        : messages.map((m) => <ChatMessage key={m.id} message={m} />);
    }

    let insertIdx = messages.length;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "tool") {
        insertIdx = i + 1;
        break;
      }
    }

    const before = messages.slice(0, insertIdx);
    const after = messages.slice(insertIdx);

    return [
      ...before.map((m) => <ChatMessage key={m.id} message={m} />),
      ThinkingCard,
      ...after.map((m) => <ChatMessage key={m.id} message={m} />),
    ];
  }, [messages, showThinking]);

  return (
    <section
      className="flex h-full min-h-[min(420px,70vh)] w-full flex-1 flex-col overflow-hidden rounded-sm border md:min-h-0"
      style={{
        borderColor: "var(--color-surface-container-high)",
        backgroundColor: "var(--color-surface-container-low)",
      }}
    >
      <header
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 md:px-4"
        style={{ borderColor: "var(--color-outline-variant)" }}
      >
        <GlowDot color="primary" />
        <Label size="md" className="text-[color:var(--color-on-surface)]">
          NEURAL_AGENT
        </Label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {loading ? (
            <Badge label="PROCESSING" variant="primary" />
          ) : (
            <Badge label="STANDBY" variant="default" />
          )}
          {sessionId ? (
            <Badge label="SESSION_OK" variant="primary" />
          ) : (
            <Badge label="NO_SESSION" variant="default" />
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 md:px-3 md:py-4">
        {messages.length === 0 && !loading ? (
          <p className="px-2 text-center text-sm opacity-55" style={{ fontFamily: "var(--font-body)" }}>
            Awaiting operator input…
          </p>
        ) : (
          rendered
        )}
        <div ref={bottomRef} aria-hidden />
      </div>

      <div className="shrink-0 border-t px-3 py-3 md:px-4" style={{ borderColor: "var(--color-outline-variant)" }}>
        <CommandInput disabled={loading} onSubmit={(t) => void sendMessage(t)} />
      </div>
    </section>
  );
}
