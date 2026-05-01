"use client";

import { useCallback, useRef } from "react";

const DANCE_CSS = [
  "@keyframes pcb-body{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}",
  "@keyframes pcb-cl{0%,100%{transform:translate(0,0)}50%{transform:translate(-1px,-4px)}}",
  "@keyframes pcb-cr{0%,100%{transform:translate(0,0)}50%{transform:translate(1px,-4px)}}",
  "@keyframes pcb-lg{0%,100%{transform:translateX(0)}33%{transform:translateX(-1px)}66%{transform:translateX(1px)}}",
  ".pcb-body{animation:pcb-body .5s ease-in-out infinite}",
  ".pcb-cl{animation:pcb-cl .5s ease-in-out infinite}",
  ".pcb-cr{animation:pcb-cr .5s ease-in-out infinite .25s}",
  ".pcb-lg{animation:pcb-lg .5s ease-in-out infinite}",
].join("");

type Props = {
  progress: number;
  duration: number;
  playing?: boolean;
  onSeek: (seconds: number) => void;
};

function fmt(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SeekBar({ progress, duration, playing = false, onSeek }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const pct = d > 0 ? Math.min(100, Math.max(0, (progress / d) * 100)) : 0;

  const scrub = useCallback(
    (clientX: number) => {
      const el = barRef.current;
      if (!el || d <= 0) return;
      const rect = el.getBoundingClientRect();
      const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(ratio, 1)) * d);
    },
    [d, onSeek]
  );

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    scrub(e.clientX);
    const mm = (ev: MouseEvent) => scrub(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (d <= 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onSeek(Math.min(d, progress + 5));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSeek(Math.max(0, progress - 5));
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em]"
        style={{
          fontFamily: "var(--font-headline)",
          color: "var(--color-outline)",
        }}>
        <span>{fmt(progress)}</span>
        <span>{fmt(duration)}</span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(progress)}
        ref={barRef}
        className="terminal-progress cursor-pointer"
        style={{ "--progress-pct": `${pct}%` } as React.CSSProperties}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
      >
        <div className="terminal-progress-fill" />
        <svg
          width={24}
          height={24}
          viewBox="0 0 11 8"
          fill="currentColor"
          aria-hidden
          shapeRendering="crispEdges"
          className="terminal-progress-crab"
          style={{ color: "var(--color-primary)" }}
        >
          {playing && <style>{DANCE_CSS}</style>}
          <g className={playing ? "pcb-body" : undefined}>
            <g className={playing ? "pcb-cl" : undefined}>
              <path d="M1 0h1v1H1zM0 1h2v1H0z" />
            </g>
            <g className={playing ? "pcb-cr" : undefined}>
              <path d="M9 0h1v1H9zM9 1h2v1H9z" />
            </g>
            <path d="M1 2h9v1H1zM1 3h2v1H1zM4 3h3v1H4zM8 3h2v1H8zM1 4h9v1H1zM2 5h7v1H2z" />
            <g className={playing ? "pcb-lg" : undefined}>
              <path d="M1 6h1v1H1zM3 6h1v1H3zM5 6h1v1H5zM7 6h1v1H7zM9 6h1v1H9zM0 7h1v1H0zM10 7h1v1H10z" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
