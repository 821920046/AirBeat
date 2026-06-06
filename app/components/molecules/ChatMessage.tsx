"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import type { Track } from "@/app/lib/types";
import type { ChatMessage as ChatMessageModel } from "@/app/lib/types";
import type { MusicSource } from "@/app/lib/music";
import { usePlayer } from "@/app/context/PlayerContext";
import { useConvert } from "@/app/context/ConvertContext";
import { useDanmaku } from "@/app/context/DanmakuContext";

type Props = { message: ChatMessageModel };

type TrackExt = Track & {
  bvid?: string;
  duration?: string;
  source?: MusicSource;
  artist?: string;
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "tracks"; tracks: TrackExt[] }
  | { type: "added"; tracks: TrackExt[] };

const FENCED_RE = /```(?:tracks|json|added)?\s*\n([\s\S]*?)```/g;

function looksLikeTracks(arr: unknown[]): arr is TrackExt[] {
  if (arr.length === 0) return false;
  const first = arr[0] as Record<string, unknown>;
  return typeof first === "object" && first !== null && ("title" in first);
}

function tryParseTrackArray(raw: string): TrackExt[] | null {
  try {
    const trimmed = raw.trim();
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && looksLikeTracks(parsed)) return parsed as TrackExt[];
    if (parsed?.tracks && Array.isArray(parsed.tracks) && looksLikeTracks(parsed.tracks))
      return parsed.tracks as TrackExt[];
  } catch { /* not valid JSON */ }
  return tryExtractTracksFromRaw(raw);
}

const OBJ_RE = /\{([^}]*)\}/g;

/** 从非标准 JSON 字符串中尽力提取 Track 对象（正则兜底，处理 LLM 格式偏差） */
function tryExtractTracksFromRaw(raw: string): TrackExt[] | null {
  const tracks: TrackExt[] = [];
  OBJ_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OBJ_RE.exec(raw)) !== null) {
    const obj = m[1];
    const bvid = obj.match(/"bvid"\s*:\s*"([^"]+)"/)?.[1];
    const id = obj.match(/"id"\s*:\s*"([^"]+)"/)?.[1];
    const title = obj.match(/"title"\s*:\s*"([\s\S]+?)"\s*,\s*"(?:author|artist|duration|url|bvid|id|source)"/)?.[1];
    const titleAlt = !title ? obj.match(/"title"\s*:\s*"([^"]+)"/)?.[1] : null;
    const author = obj.match(/"author"\s*:\s*"([\s\S]+?)"\s*,\s*"(?:duration|url|bvid)"/)?.[1]
      || obj.match(/"artist"\s*:\s*"([\s\S]+?)"\s*,\s*"(?:duration|url|id|source)"/)?.[1];
    const authorAlt = !author ? (obj.match(/"author"\s*:\s*"([^"]+)"/)?.[1] || obj.match(/"artist"\s*:\s*"([^"]+)"/)?.[1]) : null;
    const duration = obj.match(/"duration"\s*:\s*"([^"]+)"/)?.[1];
    const url = obj.match(/"url"\s*:\s*"([^"]+)"/)?.[1];
    const source = obj.match(/"source"\s*:\s*"([^"]+)"/)?.[1] as MusicSource | undefined;

    const finalTitle = title ?? titleAlt;
    const finalAuthor = author ?? authorAlt;
    const trackId = bvid || id;
    if (trackId && finalTitle) {
      tracks.push({
        id: trackId,
        ...(bvid ? { bvid } : {}),
        title: finalTitle,
        author: finalAuthor ?? "",
        ...(duration ? { duration } : {}),
        url: url ?? "",
        ...(source ? { source } : {}),
        date: "",
        filename: "",
        subDir: "",
        size: 0,
      });
    }
  }
  OBJ_RE.lastIndex = 0;
  return tracks.length > 0 ? tracks : null;
}

// 来源标签颜色
function sourceBadge(source: MusicSource | undefined) {
  switch (source) {
    case "netease": return { label: "NCM", color: "#E72D2D" };
    case "youtube": return { label: "YT", color: "#FF0000" };
    case "bilibili": return { label: "BILI", color: "#00A1D6" };
    default: return null;
  }
}

/** URL 处理：区分网易云/YouTube/B站链接和本地R2链接 */
function getTrackLink(t: TrackExt): { href: string; isExternal: boolean } {
  if (t.bvid) return { href: `https://www.bilibili.com/video/${t.bvid}`, isExternal: true };
  if (t.source && t.url && (t.url.startsWith("https://") || t.url.startsWith("http://"))) {
    return { href: t.url, isExternal: true };
  }
  return { href: "", isExternal: false };
}

function detectTag(matchStr: string): "tracks" | "added" {
  if (matchStr.startsWith("```added")) return "added";
  return "tracks";
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let last = 0;

  FENCED_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCED_RE.exec(content)) !== null) {
    const tracks = tryParseTrackArray(match[1]);
    if (match.index > last) {
      parts.push({ type: "text", text: content.slice(last, match.index) });
    }
    if (tracks) {
      const tag = detectTag(match[0]);
      parts.push({ type: tag, tracks });
    } else {
      // fenced block found but JSON parsing failed — render the captured content as text
      parts.push({ type: "text", text: match[1] });
    }
    last = match.index + match[0].length;
  }

  if (last < content.length) {
    const remainder = content.slice(last);
    const bare = remainder.match(/(\[[\s\n]*\{[\s\S]*?\}[\s\n]*\])/);
    if (bare) {
      const tracks = tryParseTrackArray(bare[1]);
      if (tracks) {
        const idx = remainder.indexOf(bare[1]);
        if (idx > 0) parts.push({ type: "text", text: remainder.slice(0, idx) });
        parts.push({ type: "tracks", tracks });
        const end = idx + bare[1].length;
        if (end < remainder.length) parts.push({ type: "text", text: remainder.slice(end) });
        return parts;
      }
    }
    parts.push({ type: "text", text: remainder });
  }
  return parts;
}

function AddedCards({ tracks }: { tracks: TrackExt[] }) {
  const { addTracks } = usePlayer();
  const { convertBvid, convertTrack } = useConvert();
  const { fetchDanmaku } = useDanmaku();
  const didAutoAdd = useRef(false);

  // URL 以 /audio/ 开头 → R2 已上传，可直接播放
  // 其他 → 需要走转换流程
  useEffect(() => {
    if (didAutoAdd.current || tracks.length === 0) return;
    didAutoAdd.current = true;

    const readyTracks = tracks.filter((t) => t.url?.startsWith("/audio/"));
    const needConvert = tracks.filter((t) => !t.url?.startsWith("/audio/"));

    if (readyTracks.length > 0) addTracks(readyTracks);

    for (const track of needConvert) {
      const trackId = track.bvid || track.id;
      const trackSource = track.source || (track.bvid ? "bilibili" : "netease");
      const artist = track.artist || track.author || "";

      if (trackSource === "bilibili" && track.bvid) {
        fetchDanmaku(track.bvid);
      }

      convertTrack(trackId, trackSource, track.title, artist)
        .then((converted) => addTracks([converted]))
        .catch((err) => console.error("[AddedCards] convert failed:", err));
    }
  }, [tracks, addTracks, convertBvid, convertTrack, fetchDanmaku]);

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

type ButtonState = "add" | "converting" | "added";

function getButtonState(
  track: TrackExt,
  inPlaylist: Set<string>,
  converting: Map<string, unknown>,
  convertTrackErrors: Map<string, string>,
  isLocalTrack: boolean
): ButtonState {
  const trackKey = track.bvid || track.id;
  if (isLocalTrack) return "added"; // 本地曲目不需要转换
  if (inPlaylist.has(trackKey)) return "added";
  if (converting.has(trackKey) || converting.has(`${track.source}:${trackKey}`)) return "converting";
  if (convertTrackErrors.has(trackKey)) return "add";
  return "add";
}

const BTN_CONFIG: Record<ButtonState, { label: string; disabled: boolean }> = {
  add: { label: "+ ADD", disabled: false },
  converting: { label: "CONVERTING...", disabled: true },
  added: { label: "ADDED", disabled: true },
};

function TrackCards({ tracks }: { tracks: TrackExt[] }) {
  const { state, addTracks } = usePlayer();
  const { convertBvid, convertTrack, converting, errors } = useConvert();
  const { fetchDanmaku } = useDanmaku();
  const inPlaylist = new Set(
    state.playlist.flatMap((t) => [t.id, t.bvid].filter((v): v is string => Boolean(v)))
  );

  // 判断是否为本地已收藏曲目（URL 以 /audio/ 开头）
  const isLocal = (t: TrackExt) => t.url?.startsWith("/audio/");
  // 本地曲目：URL以/audio/开头，或source既不是netease/youtube/bilibili（说明是search_local返回的）
  const isLocalTrack = (t: TrackExt) => isLocal(t) || (!!t.source && !["netease","youtube","bilibili"].includes(t.source));

  const isCloud = tracks.some((t) => !isLocalTrack(t));

  const allDone = tracks.every((t) => {
    const s = getButtonState(t, inPlaylist, converting, errors, isLocal(t));
    return s !== "add";
  });

  const handleAdd = async (track: TrackExt) => {
    // 本地曲库的 track 直接加入播放列表，不需要转换
    if (isLocalTrack(track)) {
      addTracks([track]);
      return;
    }

    const trackId = track.bvid || track.id;
    const trackSource = track.source || (track.bvid ? "bilibili" : "netease");
    const artist = track.artist || track.author || "";

    if (trackSource === "bilibili" && trackId) {
      fetchDanmaku(trackId);
      try {
        const convertedTrack = await convertBvid(trackId, track.title, track.author || artist);
        addTracks([convertedTrack]);
      } catch {
        // error state handled by ConvertContext
      }
    } else {
      try {
        const convertedTrack = await convertTrack(trackId, trackSource, track.title, artist);
        addTracks([convertedTrack]);
      } catch {
        // error state handled by ConvertContext
      }
    }
  };

  const handleAddAll = async () => {
    // 本地曲目直接加入
    const localTracks = tracks.filter((t) => isLocalTrack(t));
    if (localTracks.length > 0) addTracks(localTracks);

    const cloudTracks = tracks.filter((t) => !isLocalTrack(t) && getButtonState(t, inPlaylist, converting, errors, false) === "add");
    for (const track of cloudTracks) {
      const trackId = track.bvid || track.id;
      const trackSource = track.source || (track.bvid ? "bilibili" : "netease");
      const artist = track.artist || track.author || "";

      if (trackSource === "bilibili" && trackId) {
        fetchDanmaku(trackId);
        try {
          const convertedTrack = await convertBvid(trackId, track.title, track.author || artist);
          addTracks([convertedTrack]);
        } catch { /* continue with next */ }
      } else {
        try {
          const convertedTrack = await convertTrack(trackId, trackSource, track.title, artist);
          addTracks([convertedTrack]);
        } catch { /* continue with next */ }
      }
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
          const btnState = getButtonState(t, inPlaylist, converting, errors, isLocalTrack(t));
          const cfg = BTN_CONFIG[btnState];
          const trackKey = t.bvid || t.id;
          const progress = converting.get(trackKey) || converting.get(`${t.source}:${trackKey}`)
          const progressVal = typeof progress === "object" ? progress?.progress : undefined;
          const stageVal = typeof progress === "object" ? progress?.stage : undefined;
          const badge = sourceBadge(t.source);
          const link = getTrackLink(t);

          return (
            <div
              key={t.bvid || t.id}
              className="flex items-center gap-2 border-t px-3 py-2"
              style={{ borderColor: "var(--color-outline-variant)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {badge && (
                    <span
                      className="shrink-0 rounded-sm px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.1em]"
                      style={{
                        fontFamily: "var(--font-headline)",
                        backgroundColor: `${badge.color}20`,
                        color: badge.color,
                        border: `1px solid ${badge.color}40`,
                      }}
                    >
                      {badge.label}
                    </span>
                  )}
                  <p className="m-0 truncate text-sm" style={{ fontFamily: "var(--font-body)" }}>
                    {link.href ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-colors hover:underline"
                        style={{ color: "var(--color-primary)" }}
                        title={t.title}
                      >
                        {t.title}
                      </a>
                    ) : (
                      <span style={{ color: "var(--color-on-surface)" }}>{t.title}</span>
                    )}
                  </p>
                </div>
                <p className="m-0 truncate text-xs opacity-60" style={{ fontFamily: "var(--font-body)" }}>
                  {t.artist || t.author}
                  {t.duration && <span className="ml-2 opacity-70">{t.duration}</span>}
                </p>
                {btnState === "converting" && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[10px] opacity-60" style={{ fontFamily: "var(--font-headline)" }}>
                      <span>{stageVal === "downloading" ? "DOWNLOADING" : stageVal === "uploading" ? "UPLOADING" : "PROCESSING"}</span>
                      <span>{progressVal ?? 0}%</span>
                    </div>
                    <div className="mt-0.5 h-1 w-full rounded-full" style={{ backgroundColor: "var(--color-surface-container-high)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${progressVal ?? 0}%`, backgroundColor: "var(--color-primary)" }}
                      />
                    </div>
                  </div>
                )}
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
          <div className="flex items-baseline min-w-0">
            <span
              className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]"
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
          </div>
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
