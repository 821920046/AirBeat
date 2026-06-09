"use client";

import { Label } from "@/app/components/atoms/Label";
import type { Track } from "@/app/lib/types";
import { apiUrl } from "@/app/lib/config";
import { usePlayer } from "@/app/context/PlayerContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function fmtSec(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** 限制同时加载 meta 的 Audio 对象数，避免大量 track 时内存浪费 */
const MAX_CONCURRENT = 2;

function useDurationMap(tracks: Track[]) {
  const [map, setMap] = useState<Record<string, number>>({});
  const pending = useRef(new Set<string>());
  const queueRef = useRef<Track[]>([]);
  const activeCountRef = useRef(0);

  // 处理队列中的下一个 track
  const processNext = () => {
    if (activeCountRef.current >= MAX_CONCURRENT) return;
    const t = queueRef.current.shift();
    if (!t) return;

    activeCountRef.current++;
    pending.current.add(t.id);
    const id = t.id;

    const audio = new Audio();
    audio.preload = "metadata";

    // 超时保护：8 秒后无论如何释放，防止 Audio 不触发事件导致永久死锁
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      finish(undefined);
    }, 8000);

    const finish = (dur: number | undefined) => {
      clearTimeout(timer);
      if (timedOut) return; // 已经处理过了，防止重复
      if (Number.isFinite(dur) && (dur ?? 0) > 0) {
        setMap((prev) => ({ ...prev, [id]: dur! }));
      }
      pending.current.delete(id);
      audio.src = "";
      activeCountRef.current--;
      processNext(); // 处理下一个
    };
    audio.addEventListener("loadedmetadata", () => finish(audio.duration), { once: true });
    audio.addEventListener("error", () => finish(undefined), { once: true });
    // stalled 卡住超 5 秒也视为失败
    audio.addEventListener("stalled", () => {
      setTimeout(() => {
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) finish(undefined);
      }, 5000);
    });
    audio.src = apiUrl(t.url);
  };

  useEffect(() => {
    // 把未处理且未在队列/pending 中的 track 加入队列
    const toQueue = tracks.filter(
      (t) => t.url && map[t.id] == null && !pending.current.has(t.id) && !queueRef.current.includes(t)
    );
    if (!toQueue.length) return;
    queueRef.current.push(...toQueue);
    // 尝试启动
    while (activeCountRef.current < MAX_CONCURRENT) processNext();
  }, [tracks, map]);

  return map;
}

export function Playlist() {
  const { state, playTrack, removeTrack } = usePlayer();
  const [filter, setFilter] = useState("");

  const allTracks = state.playlist;
  const durMap = useDurationMap(allTracks);

  const q = filter.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q.length) return allTracks;
    return allTracks.filter((t) => {
      const hay = `${t.title} ${t.author} ${t.filename}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allTracks, q]);

  const onRowClick = useCallback(
    (track: Track) => {
      playTrack(track);
    },
    [playTrack]
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border"
      style={{
        borderColor: "var(--color-surface-container-high)",
        backgroundColor: "var(--color-surface-container-low)",
      }}
    >
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 md:px-4"
        style={{ borderColor: "var(--color-outline-variant)" }}
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <Label size="md">ACTIVE_QUEUE.LOG</Label>
          <span
            className="text-[12px] tabular-nums opacity-72"
            style={{ fontFamily: "var(--font-body)" }}
          >
            [{rows.length}/{allTracks.length}]
          </span>
        </div>
      </div>

      <div className="shrink-0 px-3 py-2 md:px-4">
        <label className="sr-only" htmlFor="playlist-search">
          Filter queue
        </label>
        <input
          id="playlist-search"
          type="search"
          placeholder="FILTER…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-sm border px-3 py-2 text-sm outline-none transition-colors placeholder:uppercase placeholder:tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-body)",
            borderColor: "var(--color-outline-variant)",
            backgroundColor: "var(--color-surface-container-lowest)",
            color: "var(--color-on-surface)",
          }}
        />
      </div>

      {allTracks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <p
            className="text-center text-xs uppercase tracking-[0.14em] opacity-50"
            style={{ fontFamily: "var(--font-headline)" }}
          >
            QUEUE_EMPTY — 通过右侧 Agent 对话添加歌曲
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="px-3 py-4 text-sm opacity-60 md:px-4" style={{ fontFamily: "var(--font-body)" }}>
          NO_MATCHES
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1]" style={{ backgroundColor: "var(--color-surface-container)" }}>
              <tr style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
                <th
                  className="w-10 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{ fontFamily: "var(--font-headline)", color: "var(--color-outline)" }}
                >
                  #
                </th>
                <th
                  className="px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{ fontFamily: "var(--font-headline)", color: "var(--color-outline)" }}
                >
                  TITLE
                </th>
                <th
                  className="w-20 shrink-0 px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{ fontFamily: "var(--font-headline)", color: "var(--color-outline)" }}
                >
                  DUR
                </th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: "var(--font-body)", color: "var(--color-on-surface)" }}>
              {rows.map((t, idx) => {
                const active = state.current?.id === t.id;
                return (
                  <tr
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onRowClick(t)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      onRowClick(t);
                    }}
                    className="group relative cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--color-surface-container-high)_55%,transparent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-primary)] focus-visible:ring-inset focus-visible:bg-[color-mix(in_srgb,var(--color-surface-container-high)_55%,transparent)]"
                    style={{
                      borderLeftWidth: "3px",
                      borderLeftStyle: "solid",
                      borderLeftColor: active ? "var(--color-primary)" : "transparent",
                    }}
                  >
                    <td className="w-10 shrink-0 px-2 py-2.5 tabular-nums text-[color:var(--color-outline)]">
                      {idx + 1}
                    </td>
                    <td className="max-w-0 truncate px-2 py-2.5">{t.title}</td>
                    <td className="w-20 shrink-0 px-2 py-2.5 text-right tabular-nums opacity-82">
                      {active && state.duration > 0 ? fmtSec(state.duration) : fmtSec(durMap[t.id])}
                    </td>
                    <td className="absolute right-0 top-0 bottom-0 flex items-center justify-center px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-surface-container) 92%, transparent)" }}
                    >
                      <button
                        type="button"
                        aria-label="移除"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrack(t.id);
                        }}
                        className="group/rm relative flex h-6 w-6 items-center justify-center rounded-sm border bg-transparent transition-colors hover:border-[color:var(--color-error)] hover:text-[color:var(--color-error)]"
                        style={{
                          borderColor: "var(--color-outline-variant)",
                          color: "var(--color-outline)",
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                        <span
                          className="pointer-events-none absolute -top-8 right-0 z-10 whitespace-nowrap rounded px-2 py-1 text-[10px] uppercase tracking-[0.12em] opacity-0 transition-opacity group-hover/rm:opacity-100"
                          style={{
                            fontFamily: "var(--font-headline)",
                            backgroundColor: "var(--color-surface-container-high)",
                            color: "var(--color-error)",
                            border: "1px solid var(--color-outline-variant)",
                          }}
                        >
                          REMOVE
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
