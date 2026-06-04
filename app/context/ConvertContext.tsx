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
  stage: "downloading" | "decoding" | "encoding" | "uploading";
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

/** Convert AudioBuffer (PCM) to WAV bytes */
function encodeWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;
  const channelInterleaved = true;

  const dataView = new DataView(new ArrayBuffer(0));
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels and write PCM data
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Uint8Array(arrayBuffer);
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
        // Step 1: Fetch audio URL from Bilibili
        console.log(`[Convert] ${bvid} Step 1: 获取音频URL...`);
        updateProgress(bvid, { title, stage: "downloading", progress: 0 });
        const { cid } = await getVideoInfo(bvid);
        const audioUrl = await getAudioUrl(bvid, cid);
        if (!audioUrl) throw new Error("未找到音频流");
        console.log(`[Convert] ${bvid} Step 1 OK, audioUrl: ${audioUrl.slice(0, 50)}...`);

        // Step 2: Download audio via proxy
        console.log(`[Convert] ${bvid} Step 2: 下载音频...`);
        const audioData = await fetchAudioBuffer(audioUrl);
        console.log(`[Convert] ${bvid} Step 2 OK, size: ${audioData.byteLength} bytes`);

        // Step 3: Decode AAC to PCM using Web Audio API (no ffmpeg needed)
        console.log(`[Convert] ${bvid} Step 3: 解码音频...`);
        updateProgress(bvid, { stage: "decoding", progress: 40 });

        let audioBuffer: AudioBuffer;
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioBuffer = await audioCtx.decodeAudioData(audioData);
          audioCtx.close();
        } catch (err) {
          console.error(`[Convert] ${bvid} decodeAudioData failed:`, err);
          throw new Error(`音频解码失败: ${String(err)}`);
        }

        console.log(`[Convert] ${bvid} Step 3 OK, channels: ${audioBuffer.numberOfChannels}, samples: ${audioBuffer.length}, sampleRate: ${audioBuffer.sampleRate}`);

        // Encode to WAV
        console.log(`[Convert] ${bvid} Step 3b: 编码 WAV...`);
        updateProgress(bvid, { stage: "encoding", progress: 70 });
        const wavData = encodeWav(audioBuffer);
        console.log(`[Convert] ${bvid} Step 3 OK, WAV size: ${wavData.byteLength} bytes`);

        updateProgress(bvid, { stage: "uploading", progress: 95 });

        // Step 4: Upload to R2
        console.log(`[Convert] ${bvid} Step 4: 上传到 R2...`);

        const wavBlob = new Blob([wavData as unknown as BlobPart], { type: "audio/wav" });
        const formData = new FormData();
        formData.append("file", wavBlob, `${sanitizeFilename(title)}_${bvid}.wav`);
        formData.append("title", title);
        formData.append("author", author);
        formData.append("bvid", bvid);

        const uploadResp = await fetch(apiUrl("/api/upload"), {
          method: "POST",
          body: formData,
        });

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
