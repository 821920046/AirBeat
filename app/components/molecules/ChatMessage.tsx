"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import type { Track } from "@/app/lib/types";
import type { ChatMessage as ChatMessageModel } from "@/app/lib/types";
import { usePlayer } from "@/app/context/PlayerContext";
import { useAgent } from "@/app/context/AgentContext";

type Props = { message: ChatMessageModel };

type ContentPart =
  | { type: "text"; text: string }
  | { type: "tracks"; tracks: Track[] }
  | { type: "added"; tracks: Track[] };

const FENCED_RE = /```(?:tracks|json|added)?\s*\n([\s\S]*?)```/g;

function looksLikeTracks(arr: unknown[]): arr is Track[] {
  if (arr.length === 0) return false;
  const first = arr[0] as Record<string, unknown>;
  return typeof first === "object" && first !== null && "title" in first;
}

function tryParseTrackArray(raw: string): Track[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && looksLikeTracks(parsed)) return parsed;
    if (parsed?.tracks && Array.isArray(parsed.tracks) && looksLikeTracks(parsed.tracks))
      return parsed.tracks;
  } catch { /* not valid JSON */ }
  return null;
}

function detectTag(matchStr: string): "tracks" | "added" {
  if (matchStr.startsWith("```added")) return "added";
  return "tracks";
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let last = 0;
  let matched = false;

  FENCED_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCED_RE.exec(content)) !== null) {
    const tracks = tryParseTrackArray(match[1]);
    if (!tracks) continue;
    matched = true;
    if (match.index > last) {
      parts.push({ type: "text", text: content.slice(last, match.index) });
    }
    const tag = detectTag(match[0]);
    parts.push({ type: tag, tracks });
    last = match.index + match[0].length;
  }

  if (!matched) {
    const bare = content.match(/(\[[\s\n]*\{[\s\S]*?\}[\s\n]*\])/);
    if (bare) {
      const tracks = tryParseTrackArray(bare[1]);
      if (tracks) {
        const idx = content.indexOf(bare[1]);
        if (idx > 0) parts.push({ type: "text", text: content.slice(0, idx) });
        parts.push({ type: "tracks", tracks });
        const end = idx + bare[1].length;
        if (end < content.length) parts.push({ type: "text", text: content.slice(end) });
        return parts;
      }
    }
  }

  if (last < content.length) {
    parts.push({ type: "text", text: content.slice(last) });
  }
  return parts;
}

type TrackExt = Track & { bvid?: string; duration?: string };

function AddedCards({ tracks }: { tracks: TrackExt[] }) {
  const { addTracks } = usePlayer();
  const didAutoAdd = useRef(false);

  useEffect(() => {
    if (!didAutoAdd.current && tracks.length > 0) {
      didAutoAdd.current = true;
      addTracks(tracks);
    }
  }, [tracks, addTracks]);

  return (
    <div
      className="my-2 overflow-hidden rounded-sm border"
      style={{ borderColor: "var(--color-outline-variant)" }}
    >
      <div
        className="px-3 py-2"
        style={{ backgroundColor: "var(--color-surface-container)" }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ fontFamily: "var(--font-headline)", color: "var(--color-primary)" }}
        >
          [{tracks.length} TRACKS ADDED]
        </span>
      </div>
      <div className="max-h-[16rem] overflow-y-auto scrollbar-thin">
        {tracks.map((t, i) => (
          <div
            key={t.id || i}
            className="flex items-center gap-2 border-t px-3 py-2"
            style={{ borderColor: "var(--color-outline-variant)" }}
          >
            <div className="min-w-0 flex-1">
              <p
                className="m-0 truncate text-sm"
                style={{ fontFamily: "var(--font-body)", color: "var(--color-on-surface)" }}
              >
                {t.title}
              </p>
              <p className="m-0 truncate text-xs opacity-60" style={{ fontFamily: "var(--font-body)" }}>
                {t.author}
                {t.duration && <span className="ml-2 opacity-70">{t.duration}</span>}
              </p>
            </div>
            <span
              className="shrink-0 rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-50"
              style={{
                fontFamily: "var(--font-headline)",
                borderColor: "var(--color-outline-variant)",
                color: "var(--color-outline)",
              }}
            >
              ADDED
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ButtonState = "add" | "queued" | "converting" | "added";

function getButtonState(
  track: TrackExt,
  inPlaylist: Set<string>,
  convertQueue: string[],
  convertingSet: Set<string>,
  convertedSet: Set<string>
): ButtonState {
  if (inPlaylist.has(track.id) || (track.bvid && inPlaylist.has(track.bvid))) return "added";
  if (track.bvid) {
    if (convertedSet.has(track.bvid)) return "added";
    if (convertingSet.has(track.bvid)) return "converting";
    if (convertQueue.includes(track.bvid)) return "queued";
  }
  return "add";
}

const BTN_CONFIG: Record<ButtonState, { label: string; disabled: boolean }> = {
  add: { label: "+ ADD", disabled: false },
  queued: { label: "QUEUED", disabled: true },
  converting: { label: "CONVERTING...", disabled: true },
  added: { label: "ADDED", disabled: true },
};

function TrackCards({ tracks }: { tracks: TrackExt[] }) {
  const { state, addTracks } = usePlayer();
  const { queueConvert, convertQueue, convertingSet, convertedSet } = useAgent();
  const inPlaylist = new Set(state.playlist.map((t) => t.id));

  const isCloud = tracks.some((t) => t.bvid);

  const allDone = tracks.every((t) => {
    const s = getButtonState(t, inPlaylist, convertQueue, convertingSet, convertedSet);
    return s !== "add";
  });

  const handleAdd = (track: TrackExt) => {
    if (track.bvid) {
      queueConvert([track.bvid]);
    } else {
      addTracks([track]);
    }
  };

  const handleAddAll = () => {
    if (isCloud) {
      const bvids = tracks
        .filter((t) => t.bvid && getButtonState(t, inPlaylist, convertQueue, convertingSet, convertedSet) === "add")
        .map((t) => t.bvid!);
      if (bvids.length) queueConvert(bvids);
    } else {
      addTracks(tracks);
    }
  };

  return (
    <div
      className="my-2 overflow-hidden rounded-sm border"
      style={{ borderColor: "var(--color-outline-variant)" }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-2"
        style={{ backgroundColor: "var(--color-surface-container)" }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ fontFamily: "var(--font-headline)", color: "var(--color-outline)" }}
        >
          [{tracks.length} TRACKS]
        </span>
        <button
          onClick={handleAddAll}
          disabled={allDone}
          className="rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-opacity disabled:opacity-40"
          style={{
            fontFamily: "var(--font-headline)",
            borderColor: "var(--color-primary)",
            color: "var(--color-primary)",
          }}
        >
          {allDone ? "ALL_ADDED" : "ADD_ALL"}
        </button>
      </div>
      <div className="max-h-[16rem] overflow-y-auto scrollbar-thin">
        {tracks.map((t) => {
          const btnState = getButtonState(t, inPlaylist, convertQueue, convertingSet, convertedSet);
          const cfg = BTN_CONFIG[btnState];
          return (
            <div
              key={t.bvid || t.id}
              className="flex items-center gap-2 border-t px-3 py-2"
              style={{ borderColor: "var(--color-outline-variant)" }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="m-0 truncate text-sm"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-on-surface)" }}
                >
                  {t.title}
                </p>
                <p className="m-0 truncate text-xs opacity-60" style={{ fontFamily: "var(--font-body)" }}>
                  {t.author}
                  {t.duration && <span className="ml-2 opacity-70">{t.duration}</span>}
                </p>
              </div>
              <button
                onClick={() => handleAdd(t)}
                disabled={cfg.disabled}
                className="shrink-0 rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-opacity disabled:opacity-40"
                style={{
                  fontFamily: "var(--font-headline)",
                  borderColor: cfg.disabled ? "var(--color-outline-variant)" : "var(--color-primary)",
                  color: cfg.disabled ? "var(--color-outline)" : "var(--color-primary)",
                }}
              >
                {cfg.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function labelFor(role: ChatMessageModel["role"]) {
  if (role === "agent") return "AGENT_01";
  if (role === "operator") return "OPERATOR";
  if (role === "tool") return "TOOL";
  return "SYS";
}

function formatTs(ts: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(ts);
  } catch {
    return String(ts);
  }
}

function ToolMessage({ message: m }: Props) {
  const [open, setOpen] = useState(false);
  const firstLine = m.content.split("\n")[0] ?? "";
  const rest = m.content.slice(firstLine.length + 1);
  const toolLabel = m.toolName || firstLine.split(/\s/)[0] || "Tool";

  return (
    <article className="mb-1 flex w-full justify-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[min(100%,38rem)] cursor-pointer items-start gap-1.5 border-l-[3px] border-transparent py-1 pl-4 pr-4 text-left transition-opacity hover:opacity-90"
        style={{
          borderLeftColor: "var(--color-secondary)",
          opacity: open ? 0.8 : 0.5,
        }}
      >
        <span
          className="mt-px shrink-0 text-[10px]"
          style={{ color: "var(--color-outline)" }}
        >
          {open ? "\u25BE" : "\u25B8"}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ fontFamily: "var(--font-headline)", color: "var(--color-secondary)" }}
          >
            [{toolLabel}]
          </span>
          {!open && rest && (
            <span
              className="ml-1.5 truncate text-[11px]"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-outline)" }}
            >
              {rest.slice(0, 80)}
            </span>
          )}
          {open && rest && (
            <pre
              className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-outline)" }}
            >
              {rest}
            </pre>
          )}
        </div>
      </button>
    </article>
  );
}

export function ChatMessage({ message: m }: Props) {
  if (m.role === "tool") return <ToolMessage message={m} />;

  const isOp = m.role === "operator";
  const label = labelFor(m.role);

  const bgAgent = m.role === "agent";

  const edge =
    m.role === "system"
      ? "var(--color-error)"
      : "var(--color-outline-variant)";

  const borderStyle: CSSProperties = isOp
    ? { borderRightColor: edge }
    : { borderLeftColor: edge };

  const parts = m.role === "agent" ? parseContent(m.content) : null;

  return (
    <article className={`mb-6 flex w-full ${isOp ? "justify-end" : "justify-start"}`}>
      <div
        className={
          `max-w-[min(100%,38rem)] pl-4 pr-4 pt-3 pb-3 ` +
          (isOp ? "border-r-[3px] border-transparent border-l-transparent" : "border-l-[3px] border-transparent border-r-transparent") +
          ` ` +
          (bgAgent ? "bg-[color:var(--color-surface-container-high)]" : "")
        }
        style={borderStyle}
      >
        <div
          className={`mb-3 flex flex-wrap items-baseline gap-2 opacity-92 ${isOp ? "justify-end" : ""}`}
        >
          <span
            className="terminal-label"
            style={{ fontFamily: "var(--font-headline)", letterSpacing: "var(--tracking-label)" }}
          >
            {label}
          </span>
          <span className="text-[11px] text-[color:var(--color-outline)]">{formatTs(m.timestamp)}</span>
        </div>
        {parts ? (
          <div className={isOp ? "text-right" : "text-left"}>
            {parts.map((part, i) => {
              if (part.type === "added") return <AddedCards key={i} tracks={part.tracks} />;
              if (part.type === "tracks") return <TrackCards key={i} tracks={part.tracks} />;
              return (
                <pre
                  key={i}
                  className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-on-surface)" }}
                >
                  {part.text}
                </pre>
              );
            })}
          </div>
        ) : (
          <pre
            className={`m-0 whitespace-pre-wrap break-words text-sm leading-relaxed ${isOp ? "text-right" : "text-left"}`}
            style={{ fontFamily: "var(--font-body)", color: "var(--color-on-surface)" }}
          >
            {m.content}
          </pre>
        )}
      </div>
    </article>
  );
}
