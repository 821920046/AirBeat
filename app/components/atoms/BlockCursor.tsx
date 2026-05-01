"use client";

import { useEffect, useState } from "react";

/** Terminal-style block cursor toggling visibility on a steady interval */
export function BlockCursor() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setVisible((v) => !v);
    }, 530);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className={
        "inline-block h-[1em] min-h-[14px] w-[0.6em] align-middle rounded-[1px] bg-[color:var(--color-primary,#6feee1)]"
      }
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden
    />
  );
}
