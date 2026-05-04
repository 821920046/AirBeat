"use client";

import type { DanmakuItem } from "@/app/lib/bili";
import { usePlayer } from "@/app/context/PlayerContext";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DanmakuCtxValue = {
  enabled: boolean;
  hasDanmaku: boolean;
  currentDanmaku: DanmakuItem[];
  toggleDanmaku: () => void;
  fetchDanmaku: (bvid: string) => void;
};

const DanmakuContext = createContext<DanmakuCtxValue | null>(null);

export function DanmakuProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [danmakuMap, setDanmakuMap] = useState<
    Record<string, DanmakuItem[]>
  >({});

  const { state } = usePlayer();
  const bvid = state.current?.bvid ?? null;

  const toggleDanmaku = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  const fetchDanmaku = useCallback(
    (bvidToFetch: string) => {
      if (danmakuMap[bvidToFetch]) return;

      fetch(`/api/bili/danmaku?bvid=${encodeURIComponent(bvidToFetch)}`)
        .then((res) => res.json())
        .then((json: { danmaku?: DanmakuItem[] }) => {
          if (json.danmaku?.length) {
            setDanmakuMap((prev) => ({
              ...prev,
              [bvidToFetch]: json.danmaku!,
            }));
          }
        })
        .catch(() => {
          /* ignore fetch errors */
        });
    },
    [danmakuMap]
  );

  const currentDanmaku = bvid ? danmakuMap[bvid] ?? [] : [];
  const hasDanmaku = currentDanmaku.length > 0;

  const value = useMemo<DanmakuCtxValue>(
    () => ({
      enabled,
      hasDanmaku,
      currentDanmaku,
      toggleDanmaku,
      fetchDanmaku,
    }),
    [enabled, hasDanmaku, currentDanmaku, toggleDanmaku, fetchDanmaku]
  );

  return (
    <DanmakuContext.Provider value={value}>
      {children}
    </DanmakuContext.Provider>
  );
}

export function useDanmaku() {
  const v = useContext(DanmakuContext);
  if (!v) throw new Error("useDanmaku must be used within DanmakuProvider");
  return v;
}
