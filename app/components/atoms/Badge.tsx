"use client";

type BadgeVariant = "primary" | "error" | "default";

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
  primary:
    "bg-[color-mix(in_srgb,var(--color-primary,#6feee1)_12%,transparent)] text-[color:var(--color-primary,#6feee1)]",
  error:
    "bg-[color-mix(in_srgb,var(--color-error,#ef4444)_12%,transparent)] text-[color:var(--color-error,#ef4444)]",
  default:
    "text-[color:var(--color-on-surface-muted,#88898a)] bg-[color:var(--color-surface-variant,#2a2a2b)]",
};

export function Badge({ label, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded px-2 py-0.5 font-['Space_Grotesk',sans-serif]",
        "text-[12px] font-semibold uppercase tracking-[0.15em]",
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </span>
  );
}
