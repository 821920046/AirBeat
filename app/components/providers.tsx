"use client";

import { AgentProvider } from "@/app/context/AgentContext";
import { ModeProvider } from "@/app/context/ModeContext";
import { PlayerProvider } from "@/app/context/PlayerContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ModeProvider>
      <PlayerProvider>
        <AgentProvider>{children}</AgentProvider>
      </PlayerProvider>
    </ModeProvider>
  );
}
