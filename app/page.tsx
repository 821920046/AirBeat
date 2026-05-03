import { Logo, ModeSwitch } from "@/app/components/atoms";
import {
  AgentChat,
  ClockPanel,
  Player,
  Playlist,
  StatusBar,
} from "@/app/components/organisms";

export default function Home() {
  return (
    <div className="dot-matrix-bg flex min-h-[100dvh] items-center justify-center p-3 text-[color:var(--color-on-surface)] md:p-6 lg:p-8">
      <div
        className="flex h-[min(94dvh,56rem)] w-full max-w-7xl flex-col overflow-hidden rounded-md border shadow-lg"
        style={{
          borderColor: "var(--color-outline-variant)",
          backgroundColor: "color-mix(in srgb, var(--color-surface) 97%, transparent)",
        }}
      >
        <header
          className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b px-4 py-3 md:px-6"
          style={{
            borderColor: "var(--color-outline-variant)",
            backgroundColor: "color-mix(in srgb, var(--color-surface-container-low) 94%, transparent)",
          }}
        >
          <Logo />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-4 md:gap-6">
            <ModeSwitch />
          </nav>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:grid md:grid-cols-2 md:grid-rows-[1fr] md:gap-6 md:p-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
            <ClockPanel />
            <Player />
            <Playlist />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1">
            <AgentChat />
          </div>
        </main>

        <StatusBar />
      </div>
    </div>
  );
}
