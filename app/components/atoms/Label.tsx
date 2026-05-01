"use client";

import type { ReactNode } from "react";

type LabelSize = "sm" | "md";

type LabelProps = {
  children: ReactNode;
  size?: LabelSize;
  className?: string;
};

const sizeStyles: Record<LabelSize, string> = {
  sm: "text-[12px] font-semibold tracking-[0.15em]",
  md: "text-[14px] font-medium tracking-[0.2em]",
};

export function Label({ children, size = "sm", className }: LabelProps) {
  return (
    <span
      className={[
        "inline font-['Space_Grotesk',sans-serif] uppercase text-[color:var(--color-on-surface,#e8e8e8)]",
        sizeStyles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
