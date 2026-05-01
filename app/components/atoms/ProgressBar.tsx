"use client";

type ProgressBarProps = {
  value: number;
  className?: string;
};

export function ProgressBar({ value, className }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const pct = clamped * 100;

  return (
    <div
      className={[
        "relative h-0.5 w-full overflow-visible rounded-full",
        "bg-[color:var(--color-surface-container,#252526)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-[color:var(--color-primary,#6feee1)]"
        style={{ width: `${pct}%` }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-primary,#6feee1)]"
        style={{
          left: `${pct}%`,
          boxShadow:
            "0 0 8px color-mix(in srgb, var(--color-primary, #6feee1) 80%, transparent), 0 0 14px color-mix(in srgb, var(--color-primary, #6feee1) 40%, transparent)",
        }}
      />
    </div>
  );
}
