"use client";

import { useEffect, useRef, useState } from "react";
import type { Track } from "@/app/lib/types";
import { SpectrumBars } from "@/app/components/atoms/SpectrumBars";

const MARQUEE_KF =
  "@keyframes pcb-mq{0%{transform:translateX(0)}100%{transform:translateX(calc(var(--mq-offset)*-1))}}";
const MQ_GAP = 64;
const MQ_SPEED = 40;

type Props = {
  track: Track | null;
  playing: boolean;
};

export function TrackInfo({ track, playing }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) {
      setTextWidth(0);
      return;
    }

    const check = () => {
      setTextWidth(text.scrollWidth > container.clientWidth ? text.scrollWidth : 0);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [track?.id, track?.title]);

  const hasTrack = !!track;
  const needsMarquee = textWidth > 0;
  const offset = textWidth + MQ_GAP;

  return (
    <div className="flex flex-col gap-2">
      {needsMarquee && <style>{MARQUEE_KF}</style>}
      <div className="flex items-baseline gap-3">
        <div ref={containerRef} className="min-w-0 flex-1 overflow-hidden">
          <div
            className="inline-flex whitespace-nowrap"
            style={
              needsMarquee
                ? ({
                    animation: `pcb-mq ${offset / MQ_SPEED}s linear infinite`,
                    "--mq-offset": `${offset}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <span
              ref={textRef}
              className={
                hasTrack
                  ? "text-lg font-semibold uppercase tracking-[var(--tracking-headline)] md:text-xl"
                  : "terminal-label opacity-45"
              }
              style={
                hasTrack
                  ? { fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }
                  : { fontFamily: "var(--font-headline)", letterSpacing: "var(--tracking-label)" }
              }
            >
              {hasTrack ? track.title : "NO SIGNAL"}
            </span>
            {needsMarquee && (
              <span
                className="pl-16 text-lg font-semibold uppercase tracking-[var(--tracking-headline)] md:text-xl"
                style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
              >
                {track!.title}
              </span>
            )}
          </div>
        </div>
        {hasTrack && (
          <span className="shrink-0 min-w-28 text-sm opacity-78 text-right" style={{ fontFamily: "var(--font-body)" }}>
            {track.author}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="w-fit rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{
            fontFamily: "var(--font-headline)",
            borderColor: hasTrack ? "var(--color-primary)" : "var(--color-outline-variant)",
            color: hasTrack ? "var(--color-primary)" : "var(--color-outline)",
            boxShadow: hasTrack ? "0 0 12px var(--color-crt-glow-soft)" : "none",
            opacity: hasTrack ? 1 : 0.45,
          }}
        >
          PLAYING
        </span>
        <SpectrumBars active={playing} muted={!hasTrack} />
      </div>
    </div>
  );
}
