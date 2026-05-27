"use client";

import { AgentProvider } from "@/app/context/AgentContext";
import { ConvertProvider } from "@/app/context/ConvertContext";
import { DanmakuProvider } from "@/app/context/DanmakuContext";
import { PlayerProvider } from "@/app/context/PlayerContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PlayerProvider>
      <ConvertProvider>
        <DanmakuProvider>
          <AgentProvider>{children}</AgentProvider>
        </DanmakuProvider>
      </ConvertProvider>
    </PlayerProvider>
  );
}
