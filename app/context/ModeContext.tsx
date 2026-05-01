"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppMode = "local" | "cloud";

type ModeCtxValue = {
  mode: AppMode;
  setMode: (m: AppMode) => void;
};

const ModeContext = createContext<ModeCtxValue | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = useState<AppMode>("local");

  const setMode = useCallback((m: AppMode) => setModeRaw(m), []);

  const value = useMemo<ModeCtxValue>(
    () => ({ mode, setMode }),
    [mode, setMode]
  );

  return (
    <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
  );
}

export function useMode() {
  const v = useContext(ModeContext);
  if (!v) throw new Error("useMode must be used within ModeProvider");
  return v;
}
