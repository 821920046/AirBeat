"use client";

import type { DanmakuItem } from "@/app/lib/types";
import { getVideoInfo, getDanmaku } from "@/app/lib/bili";
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
const EMPTY_DANMAKU: DanmakuItem[] = [];

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

      getVideoInfo(bvidToFetch)
        .then(({ cid }) => getDanmaku(cid))
        .then((items) => {
          if (items.length) {
            setDanmakuMap((prev) => ({ ...prev, [bvidToFetch]: items }));
          }
        })
        .catch(() => { /* ignore fetch errors */ });
    },
    [danmakuMap]
  );

  const currentDanmaku = useMemo(
    () => (bvid ? danmakuMap[bvid] ?? EMPTY_DANMAKU : EMPTY_DANMAKU),
    [bvid, danmakuMap]
  );
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
