"use client";

import type { Track } from "@/app/lib/types";
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
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      await el.play();
    } catch {
      /* autoplay blocked or no source */
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
    if (!el) return;
    el.src = track.url;
    el.load();
    setProgress(0);
    setDuration(0);
    void el.play().catch(() => {
      /* ignore */
    });
  }, []);

  return {
    audioRef,
    playing,
    progress,
    duration,
    volume,
    play,
    pause,
    toggle,
    seek,
    setVolume,
    playTrack,
  };
}
