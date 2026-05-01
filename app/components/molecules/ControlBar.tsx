"use client";

type Props = {
  playing: boolean;
  onPrev: () => void;
  onToggle: () => void | Promise<void>;
  onNext: () => void;
  onStop: () => void;
};

const btn =
  "group relative inline-flex h-9 w-9 items-center justify-center rounded-sm border bg-transparent transition-colors " +
  "outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-primary)] " +
  "hover:border-[color:var(--color-primary)] hover:text-[color:var(--color-primary)]";

function Tooltip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute -bottom-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-[10px] uppercase tracking-[0.12em] opacity-0 transition-opacity group-hover:opacity-100"
      style={{
        fontFamily: "var(--font-headline)",
        backgroundColor: "var(--color-surface-container-high)",
        color: "var(--color-on-surface)",
        border: "1px solid var(--color-outline-variant)",
      }}
    >
      {label}
    </span>
  );
}

export function ControlBar({ playing, onPrev, onToggle, onNext, onStop }: Props) {
  return (
    <div
      className="flex items-center gap-2"
      style={{ borderColor: "var(--color-outline-variant)", color: "var(--color-outline)" }}
    >
      <button type="button" aria-label="上一首" onClick={onPrev} className={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M20 18L9 12l11-6v12zM5 17V7" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
        <Tooltip label="PREV" />
      </button>

      <button type="button" aria-label={playing ? "暂停" : "播放"} onClick={() => void onToggle()} className={btn}>
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M9 7v10M15 7v10" strokeLinecap="square" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M10 9l9 6-9 6V9z" strokeLinecap="square" strokeLinejoin="miter" />
          </svg>
        )}
        <Tooltip label={playing ? "PAUSE" : "PLAY"} />
      </button>

      <button type="button" aria-label="下一首" onClick={onNext} className={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M4 18l11-6L4 6v12zm15-11v11" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
        <Tooltip label="NEXT" />
      </button>

      <button type="button" aria-label="停止" onClick={onStop} className={btn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="1" stroke="none" />
        </svg>
        <Tooltip label="STOP" />
      </button>
    </div>
  );
}
