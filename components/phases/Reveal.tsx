"use client";

import type { RoomSnapshot } from "@/shared/types";
import { useEffect, useState } from "react";

export function Reveal({ snapshot }: { snapshot: RoomSnapshot }) {
  const puzzle = snapshot.puzzle;
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!snapshot.raceStartsAt) return;
    const tick = () => {
      const ms = Math.max(0, snapshot.raceStartsAt! - Date.now());
      setRemaining(Math.ceil(ms / 1000));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [snapshot.raceStartsAt]);

  if (!puzzle) return null;

  const diffColor =
    puzzle.difficulty === "easy"
      ? "#2cb67d"
      : puzzle.difficulty === "medium"
      ? "#ff8906"
      : "#e53170";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-3xl">
        <div
          className="inline-block text-xs font-bold uppercase tracking-[0.3em] px-3 py-1 rounded-full mb-10"
          style={{
            background: `${diffColor}22`,
            color: diffColor,
            border: `1px solid ${diffColor}`,
          }}
        >
          {puzzle.difficulty} · {puzzle.optimalHops} hop
          {puzzle.optimalHops === 1 ? "" : "s"}
        </div>

        <div className="space-y-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40">
              Start
            </div>
            <div className="text-4xl md:text-6xl font-black text-cool mt-2 break-words">
              {puzzle.start}
            </div>
          </div>
          <div className="text-5xl text-white/30">↓</div>
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40">
              Target
            </div>
            <div className="text-4xl md:text-6xl font-black text-accent mt-2 break-words">
              {puzzle.end}
            </div>
          </div>
        </div>

        <div className="mt-16">
          <div className="text-xs uppercase tracking-widest text-white/40">
            Race begins in
          </div>
          <div className="text-8xl font-black tabular-nums mt-2">
            {remaining}
          </div>
        </div>
      </div>
    </div>
  );
}
