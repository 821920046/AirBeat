"use client";

import type { Track } from "@/app/lib/types";
import type { MusicSource } from "@/app/lib/music";
import { apiUrl } from "@/app/lib/config";
import { getVideoInfo, getAudioUrl as biliGetAudioUrl, fetchAudioBuffer as biliFetchBuffer } from "@/app/lib/bili";
import {
  getAudioUrl as musicGetAudioUrl,
  fetchAudioBuffer as musicFetchBuffer,
} from "@/app/lib/music";
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
  convertTrack: (trackId: string, source: MusicSource, title: string, artist: string) => Promise<Track>;
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
        // Step 1: 获取音频URL — B站走旧路径
        console.log(`[Convert] ${bvid} Step 1: 获取音频URL...`);
        updateProgress(bvid, { title, stage: "downloading", progress: 10 });
        const { cid } = await getVideoInfo(bvid);
        const audioUrl = await biliGetAudioUrl(bvid, cid);
        if (!audioUrl) throw new Error("未找到音频流");
        console.log(`[Convert] ${bvid} Step 1 OK, audioUrl: ${audioUrl.slice(0, 50)}...`);

        // Step 2: 通过代理下载原始AAC/M4A音频
        console.log(`[Convert] ${bvid} Step 2: 下载原始音频...`);
        updateProgress(bvid, { stage: "downloading", progress: 40 });
        const audioData = await biliFetchBuffer(audioUrl);
        console.log(`[Convert] ${bvid} Step 2 OK, size: ${audioData.byteLength} bytes`);

        // Step 3: 直接上传原始AAC bytes到R2
        return await uploadToR2(bvid, title, author, bvid, audioData);
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

  /** 通用转换 — 支持多音乐源（网易云/YouTube/B站） */
  const convertTrack = useCallback(
    async (trackId: string, source: MusicSource, title: string, artist: string): Promise<Track> => {
      const key = `${source}:${trackId}`;

      // Clear previous error
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      try {
        console.log(`[Convert] ${key} Step 1: 获取音频URL (source=${source})...`);
        updateProgress(key, { title, stage: "downloading", progress: 10 });

        let audioUrl: string;
        if (source === "bilibili") {
          const { cid } = await getVideoInfo(trackId);
          audioUrl = await biliGetAudioUrl(trackId, cid);
        } else {
          audioUrl = await musicGetAudioUrl(trackId, source);
        }

        if (!audioUrl) throw new Error("未找到音频流");
        console.log(`[Convert] ${key} Step 1 OK, audioUrl: ${audioUrl.slice(0, 50)}...`);

        // Step 2: 下载音频
        console.log(`[Convert] ${key} Step 2: 下载音频...`);
        updateProgress(key, { stage: "downloading", progress: 40 });
        let audioData: ArrayBuffer;
        if (source === "bilibili") {
          audioData = await biliFetchBuffer(audioUrl);
        } else {
          audioData = await musicFetchBuffer(audioUrl);
        }
        console.log(`[Convert] ${key} Step 2 OK, size: ${audioData.byteLength} bytes`);

        // Step 3: 上传到 R2
        const ext = source === "netease" ? ".mp3" : source === "youtube" ? ".webm" : ".m4a";
        return await uploadToR2(key, title, artist, trackId, audioData, ext);
      } catch (err) {
        const msg = String(err);
        console.error(`[Convert] ${key} failed:`, msg, err);
        setErrors((prev) => new Map(prev).set(key, msg));
        setConverting((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        throw err;
      }
    },
    [updateProgress]
  );

  // 共享上传逻辑
  const uploadToR2 = useCallback(
    async (key: string, title: string, author: string, trackId: string, audioData: ArrayBuffer, ext = ".m4a"): Promise<Track> => {
      updateProgress(key, { stage: "uploading", progress: 70 });
      console.log(`[Convert] ${key} Step 3: 上传到 R2 (${(audioData.byteLength / 1024 / 1024).toFixed(1)}MB)...${ext}`);

      const blob = new Blob([audioData], { type: ext === ".mp3" ? "audio/mpeg" : ext === ".webm" ? "audio/webm" : "audio/mp4" });
      const formData = new FormData();
      formData.append("file", blob, `${sanitizeFilename(title)}_${trackId.slice(0, 12)}${ext}`);
      formData.append("title", title);
      formData.append("author", author);
      formData.append("bvid", trackId);

      const abortCtrl = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[Convert] ${key} upload timed out after 120s, aborting`);
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
      }

      if (!uploadResp.ok) throw new Error(`上传失败: ${uploadResp.status}`);
      const track = (await uploadResp.json()) as Track;
      console.log(`[Convert] ${key} Done! track.id: ${track.id}, url: ${track.url}`);

      updateProgress(key, { progress: 100 });
      setConverting((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      return track;
    },
    [updateProgress]
  );

  const value = useMemo<ConvertCtxValue>(
    () => ({ convertBvid, convertTrack, converting, errors }),
    [convertBvid, convertTrack, converting, errors]
  );

  return <ConvertContext.Provider value={value}>{children}</ConvertContext.Provider>;
}

export function useConvert() {
  const v = useContext(ConvertContext);
  if (!v) throw new Error("useConvert must be used within ConvertProvider");
  return v;
}
