"use client";

import type { DanmakuItem } from "@/app/lib/types";
import { useDanmaku } from "@/app/context/DanmakuContext";
import { usePlayer } from "@/app/context/PlayerContext";
import { useCallback, useEffect, useRef, useState } from "react";

/** 弹幕横穿屏幕用时（秒），所有弹幕统一速度 */
const SCROLL_DURATION = 12;
/** 预加载时间（秒），提前显示即将出现的弹幕 */
const LOOKAHEAD = 0.3;
/** 行数 */
const ROWS = 5;
/** 播放器暂停判定阈值（秒） */
const PAUSE_DELTA = 0.1;

type ActiveDanmaku = {
  spawnId: number;
  item: DanmakuItem;
  /** 弹幕在屏幕上的开始时间（performance.now 值），用于计算动画位置 */
  animStartTime: number;
  /** CSS 文本总宽度（px），用于判断是否完全滚出屏幕 */
  textWidth: number;
};

let spawnIdCounter = 0;

export function DanmakuOverlay() {
  const { state } = usePlayer();
  const { enabled, currentDanmaku } = useDanmaku();

  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<ActiveDanmaku[]>([]);
  const lastProgressRef = useRef(0);
  const lastIndexRef = useRef(0);
  const lastTimeRef = useRef(0); // 上一帧的 performance.now
  const rafRef = useRef(0);
  // 用 state 驱动重新渲染（稀疏更新，不每帧 setState）
  const [active, setActive] = useState<ActiveDanmaku[]>([]);
  const activeLenRef = useRef(0); // 避免无变化时不必要的 setState

  const progress = state.progress;
  const playing = state.playing;

  const containerWidth = useRef(typeof window !== "undefined" ? window.innerWidth : 1920);

  useEffect(() => {
    const onResize = () => { containerWidth.current = window.innerWidth; };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 核心动画循环：JS驱动，所有弹幕统一 px/s 速度
  const animate = useCallback(() => {
    const now = performance.now();
    const deltaTime = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;

    if (!enabled || !currentDanmaku.length) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    // 如果正在播放，计算弹幕进度（根据播放时间推进 spawn 索引）
    if (playing) {
      const seeked = progress - lastProgressRef.current;
      const isSeek = seeked < -1 || seeked > 3;
      lastProgressRef.current = progress;

      if (isSeek) {
        // seek：清除所有可见弹幕，从新位置重新开始
        activeRef.current = [];
        lastIndexRef.current = progress <= 0 ? 0 : Math.max(0, currentDanmaku.findIndex((d) => d.time >= progress - LOOKAHEAD));
        if (lastIndexRef.current < 0) lastIndexRef.current = 0;
      }

      // spawn 新弹幕（预加载 LOOKAHEAD 秒）
      const target = progress + LOOKAHEAD;
      let idx = lastIndexRef.current;
      while (idx < currentDanmaku.length && currentDanmaku[idx]!.time <= target) {
        const item = currentDanmaku[idx]!;
        const spawnId = ++spawnIdCounter;
        // 估算文本宽度：中文字符约 1em（~16px），ASCII 约 0.6em（~10px）
        const chineseCount = (item.content.match(/[一-鿿　-〿＀-￯]/g) || []).length;
        const asciiCount = item.content.length - chineseCount;
        const estimatedWidth = chineseCount * 16 + asciiCount * 10;
        activeRef.current.push({
          spawnId,
          item,
          animStartTime: now,
          textWidth: estimatedWidth,
        });
        idx++;
      }
      lastIndexRef.current = idx;
    }

    // 更新所有活跃弹幕的位置 + 移除已滚出屏幕的
    const pxPerSec = containerWidth.current / SCROLL_DURATION;
    const activeNow = activeRef.current;
    let removed = 0;

    // 遍历并过滤 — 暂停时不移动（animStartTime 随暂停时间推移）
    const remaining: ActiveDanmaku[] = [];
    if (playing) {
      for (const d of activeNow) {
        const elapsed = (now - d.animStartTime) / 1000;
        const traveled = elapsed * pxPerSec;
        if (traveled > containerWidth.current + d.textWidth + 100) {
          removed++;
          continue;
        }
        remaining.push(d);
      }
    } else {
      // 暂停时：保留所有弹幕，但把 animStartTime 向前推移（冻结位置）
      for (const d of activeNow) {
        // 检查是否在暂停期间已经滚出屏幕
        const elapsed = (now - d.animStartTime) / 1000;
        const traveled = elapsed * pxPerSec;
        if (traveled > containerWidth.current + d.textWidth + 100) {
          removed++;
          continue;
        }
        remaining.push(d);
      }
    }

    activeRef.current = remaining;

    // 稀疏更新 React state（仅在数量变化时）
    if (remaining.length !== activeLenRef.current || removed > 0) {
      activeLenRef.current = remaining.length;
      setActive([...remaining]);
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [enabled, currentDanmaku, playing, progress]);

  // 启动/停止 rAF 循环
  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  // enabled 切换时清理状态
  useEffect(() => {
    if (!enabled) {
      activeRef.current = [];
      setActive([]);
      activeLenRef.current = 0;
      lastIndexRef.current = 0;
      lastProgressRef.current = progress;
    }
  }, [enabled, progress]);

  if (!enabled || !currentDanmaku.length) return null;

  const pxPerSec = containerWidth.current / SCROLL_DURATION;
  const now = performance.now();

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      aria-hidden
    >
      {active.map((d) => {
        const row = d.spawnId % ROWS;
        const topPct = (row / ROWS) * 80 + ((d.spawnId * 7) % 15);
        // JS驱动位置计算：elapsed * pxPerSec
        const elapsed = (now - d.animStartTime) / 1000;
        const traveled = elapsed * pxPerSec;
        const left = containerWidth.current - traveled;
        return (
          <span
            key={d.spawnId}
            className="absolute whitespace-nowrap text-sm font-medium"
            style={{
              top: `${topPct}%`,
              left: `${left}px`,
              color: d.item.color,
              fontFamily: "var(--font-headline), 'Space Grotesk', sans-serif",
              textShadow:
                "0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.9)",
            }}
          >
            {d.item.content}
          </span>
        );
      })}
    </div>
  );
}
