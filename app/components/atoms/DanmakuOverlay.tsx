"use client";

import type { DanmakuItem } from "@/app/lib/bili";
import { useDanmaku } from "@/app/context/DanmakuContext";
import { usePlayer } from "@/app/context/PlayerContext";
import { useCallback, useEffect, useRef, useState } from "react";

const SCROLL_DURATION = 10;
const LOOKAHEAD = 0.3;

type ActiveDanmaku = DanmakuItem & { spawnId: number };

let spawnIdCounter = 0;

export function DanmakuOverlay() {
  const { state } = usePlayer();
  const { enabled, currentDanmaku } = useDanmaku();

  const [active, setActive] = useState<ActiveDanmaku[]>([]);
  const lastProgressRef = useRef(0);
  const lastIndexRef = useRef(0);

  const progress = state.progress;

  const spawnDanmaku = useCallback(
    (item: DanmakuItem) => {
      const spawnId = ++spawnIdCounter;
      setActive((prev) => [...prev, { ...item, spawnId }]);
      setTimeout(() => {
        setActive((prev) => prev.filter((d) => d.spawnId !== spawnId));
      }, SCROLL_DURATION * 1000 + 500);
    },
    []
  );

  useEffect(() => {
    if (!enabled || !currentDanmaku.length) {
      setActive([]);
      lastIndexRef.current = 0;
      lastProgressRef.current = progress;
      return;
    }

    const delta = progress - lastProgressRef.current;
    const seeked = delta < -1 || delta > 3;
    lastProgressRef.current = progress;

    if (seeked) {
      setActive([]);
      lastIndexRef.current = 0;
      if (progress <= 0) return;
      const resumeIdx = currentDanmaku.findIndex(
        (d) => d.time >= progress - LOOKAHEAD
      );
      lastIndexRef.current = Math.max(0, resumeIdx);
    }

    const target = progress + LOOKAHEAD;
    const items = currentDanmaku;
    let idx = lastIndexRef.current;
    while (idx < items.length && items[idx]!.time <= target) {
      spawnDanmaku(items[idx]!);
      idx++;
    }
    lastIndexRef.current = idx;
  }, [progress, enabled, currentDanmaku, spawnDanmaku]);

  if (!enabled || !currentDanmaku.length) return null;

  const rows = 5;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      aria-hidden
    >
      <style>{`
        @keyframes dm-scroll {
          from { transform: translateX(100vw); }
          to   { transform: translateX(-100%); }
        }
      `}</style>
      {active.map((d) => {
        const row = d.spawnId % rows;
        const topPct = (row / rows) * 80;
        return (
          <span
            key={d.spawnId}
            className="absolute left-0 whitespace-nowrap text-sm font-medium"
            style={{
              top: `${topPct + (d.spawnId * 7) % 15}%`,
              animation: `dm-scroll ${SCROLL_DURATION}s linear forwards`,
              color: d.color,
              fontFamily: "var(--font-headline), 'Space Grotesk', sans-serif",
              textShadow:
                "0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.9)",
            }}
          >
            {d.content}
          </span>
        );
      })}
    </div>
  );
}
