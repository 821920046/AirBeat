"use client";

import { GlowDot } from "@/app/components/atoms/GlowDot";
import { Label } from "@/app/components/atoms/Label";

export function StatusBar() {
  return (
    <footer
      className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-4 py-2 md:px-6"
      style={{
        borderColor: "var(--color-outline-variant)",
        backgroundColor: "var(--color-surface-container-low)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-2">
          <GlowDot color="primary" size={7} />
          <Label size="sm" className="text-[color:var(--color-primary)]">
            SYSTEM_ONLINE
          </Label>
        </span>
        <Label size="sm" className="text-[color:var(--color-outline)]">
          MEM: 12.4GB / 32GB
        </Label>
        <Label size="sm" className="text-[color:var(--color-outline)]">
          CPU_LOAD: 8%
        </Label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        <Label size="sm" className="text-[color:var(--color-outline)]">
          PACKET_LOSS: 0.00%
        </Label>
        <Label size="sm" className="text-[color:var(--color-outline)]">
          SYNC_STATUS: VERIFIED
        </Label>
        <Label size="sm" className="text-[color:var(--color-on-surface)]">
          NODE_VERSION: 1.0.4-BETA
        </Label>
      </div>
    </footer>
  );
}
