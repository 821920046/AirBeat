"use client";

import { GlowDot } from "@/app/components/atoms/GlowDot";
import { Label } from "@/app/components/atoms/Label";
import { useClock } from "@/app/hooks/useClock";

export function ClockPanel() {
  const { time, day, date } = useClock();
  const [hours, minutes] = time.split(":");

  return (
    <div
      className="scanline-overlay rounded-sm border p-5"
      style={{ borderColor: "var(--color-surface-container-high)" }}
    >
      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <GlowDot color="error" />
          <Label size="sm">LIVE FEED</Label>
          <Label size="sm" className="text-[color:var(--color-primary)]">
            STRM_SYNC: ACTIVE
          </Label>
        </div>

        <div className="text-center">
          <div
            aria-live="polite"
            className="time block tracking-[-0.02em]"
            style={{
              fontFamily: "var(--font-press-start-2p)",
              fontSize: "48px",
              lineHeight: "1.05",
              color: "var(--color-primary)",
            }}
          >
            {hours}
            <span className="colon-blink">:</span>
            {minutes}
          </div>
          <div
            className="mt-4 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 md:justify-start"
            style={{ fontFamily: "var(--font-headline)", color: "var(--color-on-surface)" }}
          >
            <span className="text-sm uppercase opacity-92" style={{ letterSpacing: "0.2em" }}>
              {day}
            </span>
            <span className="text-sm opacity-78" style={{ fontFamily: "var(--font-body)" }}>
              {date}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
