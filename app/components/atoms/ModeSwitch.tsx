"use client";

import { useMode, type AppMode } from "@/app/context/ModeContext";

const MODES: { key: AppMode; label: string }[] = [
  { key: "local", label: "LOCAL" },
  { key: "cloud", label: "CLOUD" },
];

export function ModeSwitch() {
  const { mode, setMode } = useMode();

  return (
    <div
      className="flex overflow-hidden rounded-md border"
      style={{
        borderColor: "var(--color-outline-variant)",
        fontFamily: "var(--font-headline)",
      }}
    >
      {MODES.map(({ key, label }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            onClick={() => setMode(key)}
            className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors"
            style={{
              backgroundColor: active
                ? "color-mix(in srgb, var(--color-primary) 18%, transparent)"
                : "transparent",
              color: active
                ? "var(--color-primary)"
                : "var(--color-outline)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
