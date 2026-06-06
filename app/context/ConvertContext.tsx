"use client";

import type { Track } from "@/app/lib/types";
import { apiUrl } from "@/app/lib/config";
import { getVideoInfo, getAudioUrl, fetchAudioBuffer } from "@/app/lib/bili";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ConvertProgress {
  progress: number;
  title: string;
  stage: "downloading" | "uploading";
}

type ConvertCtxValue = {
  convertBvid: (bvid: string, title: string, author: string) => Promise<Track>;
  converting: Map<string, ConvertProgress>;
  errors: Map<string, string>;
};

const ConvertContext = createContext<ConvertCtxValue | null>(null);

function sanitizeFilename(s: string): string {
  return s
    .replace(/[-|]/g, "_")
    .replace(/[\u3001\u3002\u300c\u300d\/\\*?"<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function ConvertProvider({ children }: { children: ReactNode }) {
  const [converting, setConverting] = useState<Map<string, ConvertProgress>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const updateProgress = useCallback((bvid: string, update: Partial<ConvertProgress>) => {
    setConverting((prev) => {
      const next = new Map(prev);
      const existing = next.get(bvid) || { progress: 0, title: "", stage: "downloading" as const };
      next.set(bvid, { ...existing, ...update });
      return next;
    });
  }, []);

  const convertBvid = useCallback(
    async (bvid: string, title: string, author: string): Promise<Track> => {
      // Clear previous error
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(bvid);
        return next;
      });

      try {
        // Step 1: 获取B站DASH音频流URL，再通过代理下载原始AAC字节
        // 不做客户端解码/重编码 — 原始AAC-in-MP4容器浏览器原生支持播放
        // 避免 ~10x PCM膨胀、WAV量化bug、移动端OOM
        console.log(`[Convert] ${bvid} Step 1: 获取音频URL...`);
        updateProgress(bvid, { title, stage: "downloading", progress: 10 });
        const { cid } = await getVideoInfo(bvid);
        const audioUrl = await getAudioUrl(bvid, cid);
        if (!audioUrl) throw new Error("未找到音频流");
        console.log(`[Convert] ${bvid} Step 1 OK, audioUrl: ${audioUrl.slice(0, 50)}...`);

        // Step 2: 通过代理下载原始AAC/M4A音频
        console.log(`[Convert] ${bvid} Step 2: 下载原始音频...`);
        updateProgress(bvid, { stage: "downloading", progress: 40 });
        const audioData = await fetchAudioBuffer(audioUrl);
        console.log(`[Convert] ${bvid} Step 2 OK, size: ${audioData.byteLength} bytes`);

        // Step 3: 直接上传原始AAC bytes到R2，格式为m4a（AAC-in-MP4容器）
        // 不做客户端转码 — 节省CPU和内存，避免格式转换成bug
        updateProgress(bvid, { stage: "uploading", progress: 70 });
        console.log(`[Convert] ${bvid} Step 3: 上传原始M4A到 R2 (${(audioData.byteLength / 1024 / 1024).toFixed(1)}MB)...`);

        const m4aBlob = new Blob([audioData], { type: "audio/mp4" });
        const formData = new FormData();
        formData.append("file", m4aBlob, `${sanitizeFilename(title)}_${bvid}.m4a`);
        formData.append("title", title);
        formData.append("author", author);
        formData.append("bvid", bvid);

        // 用 AbortController 防止上传永久卡住
        // Cloudflare Pages Functions 免费计划 CPU 10s + 网络开销，设 120s 足够
        const abortCtrl = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`[Convert] ${bvid} upload timed out after 120s, aborting`);
          abortCtrl.abort();
        }, 120_000);

        let uploadResp: Response;
        try {
          uploadResp = await fetch(apiUrl("/api/upload"), {
            method: "POST",
            body: formData,
            signal: abortCtrl.signal,
          });
        } finally {
          clearTimeout(timeoutId);
          // 上传完成后释放内存中的 audioData/Blob/FormData 引用
          // 帮助 GC 回收这 3 份大块内存，减小内存压力
        }

        if (!uploadResp.ok) throw new Error(`上传失败: ${uploadResp.status}`);
        const track = (await uploadResp.json()) as Track;
        console.log(`[Convert] ${bvid} Done! track.id: ${track.id}, url: ${track.url}`);

        updateProgress(bvid, { progress: 100 });

        // Clear status
        setConverting((prev) => {
          const next = new Map(prev);
          next.delete(bvid);
          return next;
        });

        return track;
      } catch (err) {
        const msg = String(err);
        console.error(`[Convert] ${bvid} failed:`, msg, err);
        setErrors((prev) => new Map(prev).set(bvid, msg));
        setConverting((prev) => {
          const next = new Map(prev);
          next.delete(bvid);
          return next;
        });
        throw err;
      }
    },
    [updateProgress]
  );

  const value = useMemo<ConvertCtxValue>(
    () => ({ convertBvid, converting, errors }),
    [convertBvid, converting, errors]
  );

  return <ConvertContext.Provider value={value}>{children}</ConvertContext.Provider>;
}

export function useConvert() {
  const v = useContext(ConvertContext);
  if (!v) throw new Error("useConvert must be used within ConvertProvider");
  return v;
}
