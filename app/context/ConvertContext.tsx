"use client";

import type { Track } from "@/app/lib/types";
import { API_BASE } from "@/app/lib/config";
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
  stage: "downloading" | "loading-converter" | "converting" | "uploading";
}

type ConvertCtxValue = {
  convertBvid: (bvid: string, title: string, author: string) => Promise<Track>;
  converting: Map<string, ConvertProgress>;
  errors: Map<string, string>;
};

const ConvertContext = createContext<ConvertCtxValue | null>(null);

// ffmpeg.wasm 单例
let ffmpegInstance: InstanceType<Awaited<typeof import("@ffmpeg/ffmpeg")>["FFmpeg"]> | null = null;
let ffmpegLoading: Promise<void> | null = null;

async function getFfmpeg(
  onProgress: (p: number) => void
): Promise<InstanceType<Awaited<typeof import("@ffmpeg/ffmpeg")>["FFmpeg"]>> {
  if (ffmpegInstance) return ffmpegInstance;

  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

      ffmpeg.on("progress", ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      ffmpegInstance = ffmpeg;
    })();
  }

  await ffmpegLoading;
  return ffmpegInstance!;
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[-|]/g, "_")
    .replace(/[【】「」:\/\\*?"<>【】]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function ConvertProvider({ children }: { children: ReactNode }) {
  const [converting, setConverting] = useState<Map<string, ConvertProgress>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // 进度回调 ref（ffmpeg 实例可能在创建后才绑定）
  const progressRef = useRef(new Map<string, (p: number) => void>());

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
      // 清除之前的错误
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(bvid);
        return next;
      });

      try {
        // Step 1: 获取音频流 URL
        updateProgress(bvid, { title, stage: "downloading", progress: 0 });
        const infoResp = await fetch(`${API_BASE}/api/bili/audio-url?bvid=${encodeURIComponent(bvid)}`);
        if (!infoResp.ok) throw new Error(`获取音频地址失败: ${infoResp.status}`);
        const { audioUrl } = (await infoResp.json()) as { audioUrl: string; cid: string };
        if (!audioUrl) throw new Error("未找到音频流");

        // Step 2: 通过 Worker 代理下载音频（绕过 CORS）
        const proxyResp = await fetch(`${API_BASE}/api/bili/proxy?url=${encodeURIComponent(audioUrl)}`);
        if (!proxyResp.ok) throw new Error(`音频下载失败: ${proxyResp.status}`);
        const audioData = await proxyResp.arrayBuffer();

        // Step 3: 加载 ffmpeg.wasm 并转换
        updateProgress(bvid, { stage: "loading-converter", progress: 0 });

        const onProgress = (p: number) => {
          updateProgress(bvid, { progress: p });
        };

        // 每次更新进度回调
        progressRef.current.set(bvid, onProgress);

        const ffmpeg = await getFfmpeg((p) => {
          const cb = progressRef.current.get(bvid);
          if (cb) cb(p);
        });

        // 更新回调（ffmpeg 实例复用后回调可能变了）
        ffmpeg.on("progress", ({ progress }) => {
          const cb = progressRef.current.get(bvid);
          if (cb) cb(Math.round(progress * 100));
        });

        updateProgress(bvid, { stage: "converting", progress: 0 });

        // 写入虚拟文件系统
        const inputName = `input_${bvid}.aac`;
        const outputName = `output_${bvid}.mp3`;

        await ffmpeg.writeFile(inputName, new Uint8Array(audioData));
        await ffmpeg.exec(["-i", inputName, "-codec:a", "libmp3lame", "-q:a", "2", outputName]);
        const mp3Data = await ffmpeg.readFile(outputName);

        // 清理虚拟文件系统
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        progressRef.current.delete(bvid);

        // Step 4: 上传到 R2
        updateProgress(bvid, { stage: "uploading", progress: 95 });

        const mp3Blob = new Blob([new Uint8Array(mp3Data as Uint8Array)], { type: "audio/mpeg" });
        const formData = new FormData();
        formData.append("file", mp3Blob, `${sanitizeFilename(title)}_${bvid}.mp3`);
        formData.append("title", title);
        formData.append("author", author);
        formData.append("bvid", bvid);

        const uploadResp = await fetch(`${API_BASE}/api/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadResp.ok) throw new Error(`上传失败: ${uploadResp.status}`);
        const track = (await uploadResp.json()) as Track;

        updateProgress(bvid, { progress: 100 });

        // 清除状态
        setConverting((prev) => {
          const next = new Map(prev);
          next.delete(bvid);
          return next;
        });

        return track;
      } catch (err) {
        const msg = String(err);
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
