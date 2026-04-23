"use client";

import type {
  ClientMessage,
  Player,
  RoomSnapshot,
} from "@/shared/types";
import { useCallback, useEffect, useState } from "react";
import { WikiArticle } from "@/components/WikiArticle";
import { normalize } from "@/shared/scoring";

interface Props {
  snapshot: RoomSnapshot;
  me: Player | undefined;
  isHost: boolean;
  send: (m: ClientMessage) => void;
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function Race({ snapshot, me, isHost, send }: Props) {
  const puzzle = snapshot.puzzle;
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!snapshot.raceEndsAt) return;
    const tick = () =>
      setRemaining(Math.max(0, snapshot.raceEndsAt! - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [snapshot.raceEndsAt]);

  const myRace = me ? snapshot.races[me.id] : undefined;
  const currentArticle =
    myRace && myRace.path.length > 0
      ? myRace.path[myRace.path.length - 1]
      : puzzle?.start ?? "";

  const onLinkClick = useCallback(
    (next: string) => {
      if (!me) return;
      if (myRace?.finished || myRace?.givenUp) return;
      send({ t: "click", article: next });
    },
    [me, myRace?.finished, myRace?.givenUp, send]
  );

  if (!puzzle || !me) return null;

  const atTarget =
    myRace && normalize(currentArticle) === normalize(puzzle.end);

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-4 md:px-6 py-3 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-white/40">
            Target
          </span>
          <span className="font-bold text-accent truncate">
            {puzzle.end}
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/40">
              Hops
            </div>
            <div className="font-mono text-xl tabular-nums">
              {myRace?.hops ?? 0}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/40">
              Time
            </div>
            <div
              className={`font-mono text-xl tabular-nums ${
                remaining < 30_000 ? "text-pop" : ""
              }`}
            >
              {formatTime(remaining)}
            </div>
          </div>
          {!myRace?.finished && !myRace?.givenUp && (
            <button
              onClick={() => {
                if (confirm("Give up this round?")) send({ t: "give-up" });
              }}
              className="text-xs text-white/40 hover:text-pop"
            >
              give up
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {myRace?.finished ? (
            <FinishedView
              puzzle={puzzle}
              hops={myRace.hops}
              path={myRace.path}
            />
          ) : myRace?.givenUp ? (
            <GaveUpView end={puzzle.end} />
          ) : (
            <>
              <div className="px-4 md:px-6 py-2 border-b border-white/5 text-xs text-white/50 flex items-center gap-2 flex-wrap">
                <span className="opacity-60">Now reading:</span>
                <span className="font-bold text-paper">{currentArticle}</span>
                {atTarget && (
                  <span className="ml-2 text-accent font-bold">
                    ✓ target reached!
                  </span>
                )}
              </div>
              <WikiArticle
                title={currentArticle}
                onLinkClick={onLinkClick}
              />
            </>
          )}
        </div>

        {isHost && (
          <aside className="w-72 hidden lg:flex flex-col border-l border-white/10 bg-black/30">
            <SpectatorPanel snapshot={snapshot} />
          </aside>
        )}
      </div>

      {isHost && (
        <MobileSpectatorToggle snapshot={snapshot} />
      )}
    </div>
  );
}

function SpectatorPanel({ snapshot }: { snapshot: RoomSnapshot }) {
  const connected = snapshot.players.filter((p) => p.connected);
  return (
    <>
      <div className="px-4 py-3 border-b border-white/10">
        <div className="text-xs uppercase tracking-widest text-white/40">
          Spectator
        </div>
        <div className="text-sm text-white/60">
          {connected.length} racer{connected.length === 1 ? "" : "s"}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {connected.map((p) => {
          const race = snapshot.races[p.id];
          const current =
            race && race.path.length > 0
              ? race.path[race.path.length - 1]
              : snapshot.puzzle?.start ?? "";
          return (
            <li
              key={p.id}
              className="px-4 py-2 border-b border-white/5 flex items-center gap-2"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: p.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">
                  {p.name}
                </div>
                <div className="text-xs text-white/50 truncate">
                  {race?.finished ? (
                    <span className="text-accent font-bold">finished</span>
                  ) : race?.givenUp ? (
                    <span className="text-white/40">gave up</span>
                  ) : (
                    current
                  )}
                </div>
              </div>
              <div className="text-xs font-mono tabular-nums text-white/60">
                {race?.hops ?? 0}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function MobileSpectatorToggle({ snapshot }: { snapshot: RoomSnapshot }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed bottom-3 right-3 bg-accent text-ink font-bold px-4 py-2 rounded-full shadow-lg text-sm z-40"
      >
        {open ? "Hide" : "Players"} ({snapshot.players.filter((p) => p.connected).length})
      </button>
      {open && (
        <div className="lg:hidden fixed inset-0 bg-ink/95 z-30 flex flex-col pt-16">
          <SpectatorPanel snapshot={snapshot} />
        </div>
      )}
    </>
  );
}

function FinishedView({
  puzzle,
  hops,
  path,
}: {
  puzzle: { end: string; optimalHops: number };
  hops: number;
  path: string[];
}) {
  const over = hops - puzzle.optimalHops;
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <div className="max-w-lg">
        <div className="text-accent text-7xl font-black mb-2">✓</div>
        <div className="text-3xl font-bold mb-2">You made it!</div>
        <div className="text-white/60 mb-6">
          Reached <span className="text-accent font-bold">{puzzle.end}</span>{" "}
          in <span className="font-mono">{hops}</span> hops
          {over > 0 ? ` (+${over} over par)` : over < 0 ? ` (${over} under par)` : " — par"}
        </div>
        <div className="chain justify-center">
          {path.map((a, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="title-pill">{a}</span>
              {i < path.length - 1 && <span className="chain-arrow">→</span>}
            </span>
          ))}
        </div>
        <div className="mt-8 text-white/40 text-sm">
          Hang tight — waiting for others or the timer.
        </div>
      </div>
    </div>
  );
}

function GaveUpView({ end }: { end: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <div>
        <div className="text-white/30 text-6xl mb-2">✕</div>
        <div className="text-xl font-bold">You tapped out.</div>
        <div className="text-white/50 text-sm mt-2">
          Round ends when everyone finishes or the timer runs out. Target was{" "}
          <span className="text-accent">{end}</span>.
        </div>
      </div>
    </div>
  );
}
