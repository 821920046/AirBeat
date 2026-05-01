"use client";

import { useEffect } from "react";
import { ControlBar } from "@/app/components/molecules/ControlBar";
import { SeekBar } from "@/app/components/molecules/SeekBar";
import { TrackInfo } from "@/app/components/molecules/TrackInfo";
import { VolumeControl } from "@/app/components/molecules/VolumeControl";
import { usePlayer } from "@/app/context/PlayerContext";

export function Player() {
  const { state, next, prev, togglePlay, stop, seek, setVolume } = usePlayer();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay]);

  return (
    <div
      className="flex flex-col gap-5 rounded-sm border p-4 md:p-5"
      style={{
        borderColor: "var(--color-surface-container-high)",
        backgroundColor: "color-mix(in srgb, var(--color-surface-container-low) 88%, transparent)",
      }}
    >
      <TrackInfo track={state.current} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ControlBar
          playing={state.playing}
          onPrev={prev}
          onToggle={togglePlay}
          onNext={next}
          onStop={stop}
        />
        <VolumeControl volume={state.volume} onChange={setVolume} />
      </div>
      <SeekBar progress={state.progress} duration={state.duration} playing={state.playing} onSeek={seek} />
    </div>
  );
}
