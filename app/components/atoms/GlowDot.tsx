"use client";

type GlowDotColor = "primary" | "error";

type GlowDotProps = {
  color?: GlowDotColor;
  size?: number;
  className?: string;
};

const colorGlow: Record<GlowDotColor, { dot: string; shadow: string }> = {
  primary: {
    dot: "bg-[color:var(--color-primary,#6feee1)]",
    shadow: "0 0 10px color-mix(in srgb, var(--color-primary, #6feee1) 70%, transparent)",
  },
  error: {
    dot: "bg-[color:var(--color-error,#ef4444)]",
    shadow: "0 0 10px color-mix(in srgb, var(--color-error, #ef4444) 70%, transparent)",
  },
};

export function GlowDot({ color = "primary", size = 8, className }: GlowDotProps) {
  const { dot, shadow } = colorGlow[color];

  return (
    <span
      role="presentation"
      className={["inline-block shrink-0 rounded-full animate-glow-pulse", dot, className].filter(Boolean).join(" ")}
      style={{
        width: size,
        height: size,
        boxShadow: shadow,
      }}
    />
  );
}
