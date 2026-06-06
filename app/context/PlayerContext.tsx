"use client";

import type { Track, PlayerState } from "@/app/lib/types";
import { useAudioPlayer } from "@/app/hooks/useAudioPlayer";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type PlayerCtx = {
  state: PlayerState;
  playTrack: (track: Track, playlist?: Track[]) => void;
  addTracks: (tracks: Track[]) => void;
  removeTrack: (trackId: string) => void;
  next: () => void;
  prev: () => void;
  togglePlay: () => void | Promise<void>;
  seek: (n: number) => void;
  setVolume: (n: number) => void;
  stop: () => void;
  error: string | null;
  clearError: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
};

const PlayerContext = createContext<PlayerCtx | null>(null);

function trackKeys(track: Track): string[] {
  return [track.id, track.bvid].filter((v): v is string => Boolean(v));
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);

  const playlistRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const playTrackInternalRef = useRef<(track: Track) => void>(() => {});
  // 防止并发添加同一首歌（搜索结果的 id=bvid，数据库的 id=数字id，bvid字段保持一致）
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const handleEnded = useCallback(() => {
    const pl = playlistRef.current;
    if (!pl.length) return;
    const ni = (indexRef.current + 1) % pl.length;
    const t = pl[ni];
    setIndex(ni);
    indexRef.current = ni;
    if (t) playTrackInternalRef.current(t);
  }, []);

  const {
    audioRef,
    playing,
    progress,
    duration,
    volume,
    error,
    clearError,
    toggle,
    seek,
    setVolume,
    playTrack,
    pause,
  } = useAudioPlayer({ onEnded: handleEnded });

  useEffect(() => {
    playTrackInternalRef.current = playTrack;
  }, [playTrack]);

  const current =
    index >= 0 && index < playlist.length ? playlist[index] ?? null : null;

  const addTracks = useCallback((tracks: Track[]) => {
    if (!tracks.length) return;

    // 去重：用 inFlightRef 防并发竞态 + seen set 防已存在
    const inflight = inFlightRef.current;
    const seen = new Set(playlistRef.current.flatMap(trackKeys));
    const fresh = tracks.filter((track) => {
      const keys = trackKeys(track);
      if (keys.some((key) => inflight.has(key) || seen.has(key))) return false;
      keys.forEach((key) => { seen.add(key); inflight.add(key); });
      return true;
    });
    if (!fresh.length) return;

    const next = [...playlistRef.current, ...fresh];
    playlistRef.current = next;
    setPlaylist(next);

    if (indexRef.current < 0) {
      const first = next[0];
      if (first) {
        setIndex(0);
        indexRef.current = 0;
        playTrack(first);
      }
    }
  }, [playTrack]);

  const removeTrack = useCallback(
    (trackId: string) => {
      setPlaylist((prev) => {
        const rmIdx = prev.findIndex((t) => t.id === trackId);
        if (rmIdx < 0) return prev;
        const next = [...prev];
        next.splice(rmIdx, 1);
        playlistRef.current = next;

        const curIdx = indexRef.current;

        if (rmIdx === curIdx) {
          // removing the currently playing track
          if (next.length === 0) {
            setIndex(-1);
            indexRef.current = -1;
            pause();
          } else {
            const newIdx = Math.min(rmIdx, next.length - 1);
            setIndex(newIdx);
            indexRef.current = newIdx;
            const t = next[newIdx];
            if (t) playTrack(t);
          }
        } else if (rmIdx < curIdx) {
          // removed a track before current — shift index back
          const newIdx = curIdx - 1;
          setIndex(newIdx);
          indexRef.current = newIdx;
        }
        // rmIdx > curIdx: index unchanged

        return next;
      });
    },
    [playTrack, pause]
  );

  const playTrackWrapped = useCallback(
    (track: Track, pl?: Track[]) => {
      if (pl?.length) {
        const nextPl = [...pl];
        const i = Math.max(nextPl.findIndex((t) => t.id === track.id), 0);
        setPlaylist(nextPl);
        playlistRef.current = nextPl;
        setIndex(i);
        indexRef.current = i;
        playTrack(track);
      } else {
        const cur = playlistRef.current;
        const i = cur.findIndex((t) => t.id === track.id);
        if (i >= 0) {
          setIndex(i);
          indexRef.current = i;
          playTrack(track);
        } else {
          const single = [track];
          setPlaylist(single);
          playlistRef.current = single;
          setIndex(0);
          indexRef.current = 0;
          playTrack(track);
        }
      }
    },
    [playTrack]
  );

  const next = useCallback(() => {
    const i = indexRef.current;
    const pl = playlistRef.current;
    if (!pl.length) return;
    const ni = Math.min(pl.length - 1, Math.max(i + 1, 0));
    if (ni === i && i >= 0) return;
    setIndex(ni);
    indexRef.current = ni;
    const t = pl[ni];
    if (t) playTrack(t);
  }, [playTrack]);

  const prev = useCallback(() => {
    const i = indexRef.current;
    const pl = playlistRef.current;
    if (!pl.length || i <= 0) return;
    const ni = Math.max(0, i - 1);
    setIndex(ni);
    indexRef.current = ni;
    const t = pl[ni];
    if (t) playTrack(t);
  }, [playTrack]);

  const togglePlayWrapped = useCallback(() => {
    if (indexRef.current < 0 || !playlistRef.current[indexRef.current]) {
      const first = playlistRef.current[0];
      if (first) {
        setIndex(0);
        indexRef.current = 0;
        playTrack(first);
        return;
      }
    }

    const el = audioRef.current;
    const currentTrack = playlistRef.current[indexRef.current];
    if (currentTrack && el?.paused && !el.src && !el.currentSrc) {
      playTrack(currentTrack);
      return;
    }

    return toggle();
  }, [audioRef, toggle, playTrack]);

  const stop = useCallback(() => {
    pause();
    seek(0);
  }, [pause, seek]);

  const state: PlayerState = useMemo(
    () => ({
      current,
      playlist,
      index: index < 0 ? 0 : index,
      playing,
      progress,
      duration,
      volume,
    }),
    [current, playlist, index, playing, progress, duration, volume]
  );

  const ctx: PlayerCtx = useMemo(
    () => ({
      state,
      playTrack: playTrackWrapped,
      addTracks,
      removeTrack,
      next,
      prev,
      togglePlay: togglePlayWrapped,
      seek,
      setVolume,
      stop,
      error,
      clearError,
      audioRef,
    }),
    [state, playTrackWrapped, addTracks, removeTrack, next, prev, togglePlayWrapped, seek, setVolume, stop, error, clearError, audioRef]
  );

  return (
    <PlayerContext.Provider value={ctx}>
      <audio ref={audioRef} className="hidden" preload="metadata" aria-hidden />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const v = useContext(PlayerContext);
  if (!v) throw new Error("usePlayer must be used within PlayerProvider");
  return v;
}
