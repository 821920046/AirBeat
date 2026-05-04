"use client";

import { useDanmaku } from "@/app/context/DanmakuContext";

export function DanmakuToggle() {
  const { enabled, hasDanmaku, toggleDanmaku } = useDanmaku();

  return (
    <div className="relative ml-auto">
      <button
        onClick={toggleDanmaku}
        disabled={!hasDanmaku}
        title={hasDanmaku ? undefined : "当前音频无弹幕"}
        className="rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        style={{
          fontFamily: "var(--font-headline), 'Space Grotesk', sans-serif",
          borderColor: enabled
            ? "var(--color-primary)"
            : "var(--color-outline-variant)",
          color: enabled ? "var(--color-primary)" : "var(--color-outline)",
          boxShadow: enabled
            ? "0 0 8px rgba(111, 238, 225, 0.25)"
            : "none",
        }}
      >
        DANMAKU
      </button>
    </div>
  );
}
