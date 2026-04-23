"use client";

import type {
  ClientMessage,
  Difficulty,
  Player,
  RoomSnapshot,
} from "@/shared/types";
import { useState } from "react";

interface Props {
  snapshot: RoomSnapshot;
  me: Player | undefined;
  isHost: boolean;
  send: (m: ClientMessage) => void;
}

const DIFFICULTIES: { id: Difficulty; label: string; sub: string }[] = [
  { id: "easy", label: "Easy", sub: "2–3 hops" },
  { id: "medium", label: "Medium", sub: "4–5 hops" },
  { id: "hard", label: "Hard", sub: "6+ hops" },
];

export function Lobby({ snapshot, me, isHost, send }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(me?.name ?? "");

  const connectedPlayers = snapshot.players.filter((p) => p.connected);
  const canStart = isHost && connectedPlayers.length >= 1;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/40">
            Room code
          </div>
          <div className="text-5xl font-black font-mono tracking-[0.25em] text-accent">
            {snapshot.code.toUpperCase()}
          </div>
          {snapshot.roundNumber > 0 && (
            <div className="mt-1 text-xs text-white/40">
              Round {snapshot.roundNumber} in the books
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-white/40">
            You
          </div>
          {editingName ? (
            <div className="flex gap-2 items-center">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={24}
                className="bg-black/40 border border-white/20 rounded px-2 py-1"
              />
              <button
                onClick={() => {
                  send({ t: "rename", name: newName });
                  localStorage.setItem(
                    "wiki-race:name",
                    newName || me?.name || "Racer"
                  );
                  setEditingName(false);
                }}
                className="bg-accent text-ink font-bold px-3 py-1 rounded"
              >
                ok
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-2xl font-bold flex items-center gap-2"
              style={{ color: me?.color }}
            >
              {me?.name ?? "—"}
              <span className="text-white/30 text-sm">✎</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <h3 className="text-sm uppercase tracking-widest text-white/50 mb-3">
            Players ({connectedPlayers.length})
          </h3>
          <ul className="space-y-2">
            {snapshot.players.map((p) => (
              <li
                key={p.id}
                className={`flex items-center gap-3 bg-black/30 border border-white/10 rounded-lg px-3 py-2 ${
                  p.connected ? "" : "opacity-40"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: p.color }}
                />
                <span className="flex-1 font-medium truncate">{p.name}</span>
                {p.isHost && (
                  <span className="text-[10px] uppercase tracking-widest bg-accent text-ink font-bold px-2 py-0.5 rounded">
                    Host
                  </span>
                )}
                {snapshot.roundNumber > 0 && (
                  <span className="text-sm text-white/60 tabular-nums">
                    {p.score} pts
                  </span>
                )}
                {!p.connected && (
                  <span className="text-[10px] text-white/40">offline</span>
                )}
              </li>
            ))}
          </ul>
          {snapshot.players.length === 0 && (
            <div className="text-white/40 text-sm">
              Waiting for players…
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm uppercase tracking-widest text-white/50 mb-3">
            Difficulty
          </h3>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {DIFFICULTIES.map((d) => {
              const active = snapshot.difficulty === d.id;
              return (
                <button
                  key={d.id}
                  disabled={!isHost}
                  onClick={() =>
                    send({ t: "set-difficulty", difficulty: d.id })
                  }
                  className={`rounded-lg border px-3 py-4 text-left transition ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-white/10 hover:border-white/30"
                  } ${isHost ? "" : "opacity-60 cursor-not-allowed"}`}
                >
                  <div className="font-bold">{d.label}</div>
                  <div className="text-xs text-white/50">{d.sub}</div>
                </button>
              );
            })}
          </div>

          {isHost ? (
            <button
              onClick={() => send({ t: "start-round" })}
              disabled={!canStart}
              className="w-full bg-accent disabled:opacity-40 text-ink font-bold text-lg py-4 rounded-lg"
            >
              {snapshot.roundNumber === 0
                ? "Start round 1"
                : `Start round ${snapshot.roundNumber + 1}`}
            </button>
          ) : (
            <div className="bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white/60 text-sm text-center">
              Waiting for host to start the round…
            </div>
          )}

          <p className="text-xs text-white/40 mt-4">
            Share this URL or the code <b>{snapshot.code.toUpperCase()}</b>{" "}
            with players. No account needed.
          </p>
        </section>
      </div>
    </div>
  );
}
