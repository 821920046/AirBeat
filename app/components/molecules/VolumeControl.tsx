"use client";

type Props = {
  volume: number;
  onChange: (value: number) => void;
};

export function VolumeControl({ volume, onChange }: Props) {
  const v = Number.isFinite(volume) ? volume : 0;
  const pct = Math.round(v * 100);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className="flex min-w-[140px] max-w-[220px] items-center gap-3">
      <span className="shrink-0 text-[color:var(--color-outline)]" aria-hidden>
        {v <= 0.001 ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M11 5L6 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2l5 4V5z" strokeLinejoin="miter" />
            <path d="M16 16l9-9M16 7l9 9" strokeLinecap="square" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M11 5L6 9H4a1 1 0 00-1 1v4a1 1 0 001 1h2l5 4V5z" strokeLinecap="square" />
            <path
              d="M16 11a5 5 0 014 5m-4 1a9 9 0 019 9"
              strokeLinecap="round"
              style={{ opacity: v < 0.35 ? 0.35 : 1 }}
            />
          </svg>
        )}
      </span>
      <label className="sr-only" htmlFor="aura-volume">
        Volume
      </label>
      <div className="relative flex flex-1 items-center" style={{ height: "20px" }}>
        <div
          className="pointer-events-none absolute left-0 right-0 overflow-hidden rounded-sm"
          style={{
            height: "6px",
            backgroundColor: "var(--color-surface-container-high)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <div
            className="h-full rounded-sm transition-[width] duration-100"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(to right, var(--color-primary-dim), var(--color-primary))",
              boxShadow: "0 0 8px var(--color-crt-glow-soft)",
            }}
          />
        </div>
        <input
          id="aura-volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={v}
          onChange={onInput}
          className={[
            "relative z-[1] w-full cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0",
            "[&::-webkit-slider-thumb]:bg-[color:var(--color-primary)]",
            "[&::-webkit-slider-thumb]:shadow-[0_0_10px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]",
            "[&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-3",
            "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:bg-[color:var(--color-primary)]",
            "[&::-moz-range-thumb]:shadow-[0_0_10px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]",
            "[&::-moz-range-track]:bg-transparent [&::-moz-range-track]:h-3 [&::-moz-range-track]:border-0",
            "focus-visible:outline-none",
          ].join(" ")}
          style={{ height: "20px" }}
        />
      </div>
    </div>
  );
}
