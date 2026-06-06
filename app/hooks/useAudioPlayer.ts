"use client";

import type { Track } from "@/app/lib/types";
import { apiUrl } from "@/app/lib/config";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAudioPlayer(options?: { onEnded?: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onEndedRef = useRef(options?.onEnded);
  useEffect(() => {
    onEndedRef.current = options?.onEnded;
  }, [options?.onEnded]);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const syncDuration = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const syncProgress = () =>
      setProgress(Number.isFinite(el.currentTime) ? el.currentTime : 0);
    const syncPlayFlags = () => setPlaying(true);
    const syncPauseFlags = () => setPlaying(false);
    const syncEnded = () => {
      setPlaying(false);
      onEndedRef.current?.();
    };
    const syncVol = () =>
      setVolumeState(Number.isFinite(el.volume) ? el.volume : 1);

    el.addEventListener("loadedmetadata", syncDuration);
    el.addEventListener("durationchange", syncDuration);
    el.addEventListener("timeupdate", syncProgress);
    el.addEventListener("play", syncPlayFlags);
    el.addEventListener("playing", syncPlayFlags);
    el.addEventListener("pause", syncPauseFlags);
    el.addEventListener("ended", syncEnded);
    el.addEventListener("volumechange", syncVol);

    // 捕获原生音频错误（格式不支持、网络错误、CORS 等）
    const handleError = () => {
      const el = audioRef.current;
      const code = el?.error?.code;
      const message = el?.error?.message ||
        (code === 1 ? "播放被中断" :
         code === 2 ? "网络错误，无法加载音频" :
         code === 3 ? "解码失败，音频格式可能不支持" :
         code === 4 ? "音频资源未找到或格式无效" :
         `音频播放错误 (code: ${code})`);
      console.error("[Audio] error event fired, code:", code, "message:", el?.error?.message, "src:", el?.currentSrc || el?.src);
      setError(message);
      setPlaying(false);
    };
    el.addEventListener("error", handleError);

    // 捕获 stalled 事件 — 网络断流
    const handleStalled = (e: Event) => {
      // 只在还没开始播放时记录（播放中遇到 stalled 浏览器会自动重试）
      if ((e.target as HTMLAudioElement).readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        console.warn("[Audio] stalled (buffering), readyState:", (e.target as HTMLAudioElement).readyState);
      }
    };
    el.addEventListener("stalled", handleStalled);

    setVolumeState(el.volume);
    syncDuration();
    syncProgress();

    return () => {
      el.removeEventListener("loadedmetadata", syncDuration);
      el.removeEventListener("durationchange", syncDuration);
      el.removeEventListener("timeupdate", syncProgress);
      el.removeEventListener("play", syncPlayFlags);
      el.removeEventListener("playing", syncPlayFlags);
      el.removeEventListener("pause", syncPauseFlags);
      el.removeEventListener("ended", syncEnded);
      el.removeEventListener("volumechange", syncVol);
      el.removeEventListener("error", handleError);
      el.removeEventListener("stalled", handleStalled);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      setError(null);
      await el.play();
    } catch (err) {
      const msg = String(err);
      console.error("Audio play failed:", msg, "src:", el.currentSrc || el.src || "(empty)");
      // 浏览器中断 play() 时会抛出 DOMException，一般是用户未交互
      // 真正加载错误会走 error 事件，不在这里设 error
      if (err instanceof DOMException && (err as DOMException).name === "NotAllowedError") {
        setError("请先点击页面任意位置，浏览器要求用户交互后才能播放音频");
      } else if (msg.includes("NotSupportedError") || msg.includes("MEDIA_ERR_SRC_NOT_SUPPORTED")) {
        setError("浏览器不支持此音频格式，尝试重新下载");
      }
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) await play();
    else pause();
  }, [pause, play]);

  const seek = useCallback((t: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(t)) return;
    el.currentTime = Math.max(0, Math.min(t, el.duration || t));
    setProgress(el.currentTime);
  }, []);

  const setVolume = useCallback((n: number) => {
    const v = Math.max(0, Math.min(1, n));
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const playTrack = useCallback((track: Track) => {
    const el = audioRef.current;
    if (!el || !track.url) return;
    setError(null);
    const src = apiUrl(track.url);
    // 先设 src 再 play。不调 load()：设 src 已触发加载，
    // 再调 load() 会中断并报 AbortError "The play() request was interrupted"
    el.src = src;
    setProgress(0);
    setDuration(0);
    void el.play().catch((err) => {
      console.error("Audio play failed:", err, "src:", src);
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    audioRef,
    playing,
    progress,
    duration,
    volume,
    error,
    clearError,
    play,
    pause,
    toggle,
    seek,
    setVolume,
    playTrack,
  };
}
