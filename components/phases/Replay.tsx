"use client";

import type {
  Badge,
  ClientMessage,
  Player,
  RoomSnapshot,
  RoundScore,
} from "@/shared/types";
import { divergenceIndex, normalize } from "@/shared/scoring";

interface Props {
  snapshot: RoomSnapshot;
  isHost: boolean;
  send: (m: ClientMessage) => void;
}

const BADGE_META: Record<
  Badge,
  { label: string; icon: string; desc: string }
> = {
  "speed-runner": {
    label: "Speed Runner",
    icon: "⚡",
    desc: "matched optimal hops",
  },
  "longest-route": {
    label: "Longest Route",
    icon: "🧭",
    desc: "scenic route award",
  },
  "most-creative": {
    label: "Most Creative",
    icon: "🎨",
    desc: "least overlap with other racers",
  },
};

export function Replay({ snapshot, isHost, send }: Props) {
  const round = snapshot.lastRound;
  if (!round) return null;

  const playerById = new Map(snapshot.players.map((p) => [p.id, p]));
  const leaderboard = [...snapshot.players].sort((a, b) => b.score - a.score);
  const optimalPath = round.puzzle.optimalPath;

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 pb-24">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-white/40">
          Round {snapshot.roundNumber} · {round.puzzle.difficulty}
        </div>
        <div className="flex items-center gap-3 text-3xl md:text-4xl font-black mt-1 flex-wrap">
          <span className="text-cool">{round.puzzle.start}</span>
          <span className="text-white/30">→</span>
          <span className="text-accent">{round.puzzle.end}</span>
        </div>
      </header>

      <section className="mb-8">
        <div className="text-xs uppercase tracking-widest text-white/40 mb-2">
          Par · BFS optimal path ({round.puzzle.optimalHops} hops)
        </div>
        <PathChain
          path={optimalPath}
          color="#a786df"
          divergeAt={null}
        />
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-white/50 mb-3">
          Racers
        </h2>
        <div className="space-y-4">
          {round.scores.map((score) => {
            const player = playerById.get(score.playerId);
            if (!player) return null;
            const race = round.races[score.playerId];
            if (!race) return null;
            const divIdx = divergenceIndex(optimalPath, race.path);
            return (
              <PlayerRow
                key={score.playerId}
                player={player}
                score={score}
                path={race.path}
                finished={race.finished}
                divergeAt={divIdx}
              />
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm uppercase tracking-widest text-white/50 mb-3">
          Cumulative leaderboard
        </h2>
        <ol className="space-y-1">
          {leaderboard.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center gap-3 bg-black/30 border border-white/10 rounded px-3 py-2"
            >
              <span className="w-6 text-white/40 tabular-nums text-sm">
                {i + 1}
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: p.color }}
              />
              <span className="flex-1 font-medium truncate">{p.name}</span>
              <span className="font-mono tabular-nums text-lg">
                {p.score}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {isHost && (
        <div className="fixed bottom-0 left-0 right-0 bg-ink/95 border-t border-white/10 p-4 flex gap-3 justify-center">
          <button
            onClick={() => send({ t: "back-to-lobby" })}
            className="px-4 py-3 rounded-lg border border-white/20 text-white/70 hover:text-white"
          >
            Back to lobby
          </button>
          <button
            onClick={() => send({ t: "next-round" })}
            className="bg-accent text-ink font-bold px-6 py-3 rounded-lg"
          >
            Next round →
          </button>
        </div>
      )}
      {!isHost && (
        <div className="text-center text-white/40 text-sm">
          Waiting for host to continue…
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  score,
  path,
  finished,
  divergeAt,
}: {
  player: Player;
  score: RoundScore;
  path: string[];
  finished: boolean;
  divergeAt: number;
}) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className="w-3 h-3 rounded-full"
          style={{ background: player.color }}
        />
        <span className="font-bold" style={{ color: player.color }}>
          {player.name}
        </span>
        <span className="text-white/40 text-sm">
          {finished
            ? `${score.hops} hops${
                score.overOptimal != null && score.overOptimal > 0
                  ? ` (+${score.overOptimal})`
                  : score.overOptimal === 0
                  ? " (par)"
                  : ""
              }`
            : "did not finish"}
        </span>
        <div className="flex gap-1 ml-1">
          {score.badges.map((b) => (
            <span
              key={b}
              title={BADGE_META[b].desc}
              className="text-[10px] uppercase tracking-widest bg-white/10 border border-white/20 rounded-full px-2 py-0.5"
            >
              {BADGE_META[b].icon} {BADGE_META[b].label}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <div className="font-mono tabular-nums text-xl">
          +{score.points}
        </div>
      </div>
      <PathChain path={path} color={player.color} divergeAt={divergeAt} />
    </div>
  );
}

function PathChain({
  path,
  color,
  divergeAt,
}: {
  path: string[];
  color: string;
  divergeAt: number | null;
}) {
  if (path.length === 0) {
    return <div className="text-white/30 text-sm italic">no moves</div>;
  }
  return (
    <div className="chain">
      {path.map((a, i) => {
        const diverged =
          divergeAt !== null && divergeAt !== -1 && i >= divergeAt;
        return (
          <span key={i} className="flex items-center gap-1">
            <span
              className="title-pill"
              style={
                diverged
                  ? {
                      background: `${color}22`,
                      borderColor: color,
                      color: "#fffffe",
                    }
                  : undefined
              }
            >
              {a}
            </span>
            {i < path.length - 1 && (
              <span
                className="chain-arrow"
                style={diverged ? { color } : undefined}
              >
                →
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
