import type {
  Badge,
  Player,
  PlayerRace,
  Puzzle,
  RoundScore,
} from "./types";

export function pointsFor(overOptimal: number | null, finished: boolean): number {
  if (!finished) return 1;
  if (overOptimal === null) return 1;
  if (overOptimal <= 0) return 10;
  if (overOptimal === 1) return 8;
  if (overOptimal === 2) return 6;
  if (overOptimal === 3) return 4;
  return 3;
}

export function overlapFraction(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map(normalize));
  const setB = new Set(b.map(normalize));
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : shared / union;
}

export function normalize(title: string): string {
  return title.trim().replace(/_/g, " ").toLowerCase();
}

export function computeScores(
  puzzle: Puzzle,
  players: Player[],
  races: Record<string, PlayerRace>
): RoundScore[] {
  const participants = players.filter((p) => races[p.id]);
  const raceList = participants.map((p) => races[p.id]);

  const finishers = raceList.filter((r) => r.finished);
  const speedRunners = new Set(
    finishers
      .filter((r) => r.hops <= puzzle.optimalHops)
      .map((r) => r.playerId)
  );

  const maxHops = raceList.reduce(
    (m, r) => Math.max(m, r.path.length > 0 ? r.path.length - 1 : 0),
    0
  );
  const longestRoutes = new Set(
    raceList
      .filter((r) => (r.path.length - 1) === maxHops && maxHops > 0)
      .map((r) => r.playerId)
  );

  let minOverlap = Infinity;
  const overlapByPlayer: Record<string, number> = {};
  for (const r of raceList) {
    let sum = 0;
    let n = 0;
    for (const other of raceList) {
      if (other.playerId === r.playerId) continue;
      sum += overlapFraction(r.path, other.path);
      n++;
    }
    const avg = n === 0 ? 0 : sum / n;
    overlapByPlayer[r.playerId] = avg;
    if (r.path.length > 1 && avg < minOverlap) minOverlap = avg;
  }
  const mostCreative = new Set(
    raceList
      .filter(
        (r) =>
          r.path.length > 1 &&
          overlapByPlayer[r.playerId] === minOverlap &&
          raceList.length > 1
      )
      .map((r) => r.playerId)
  );

  return participants.map((p) => {
    const race = races[p.id];
    const overOptimal = race.finished
      ? race.hops - puzzle.optimalHops
      : null;
    const badges: Badge[] = [];
    if (speedRunners.has(p.id)) badges.push("speed-runner");
    if (longestRoutes.has(p.id)) badges.push("longest-route");
    if (mostCreative.has(p.id)) badges.push("most-creative");
    return {
      playerId: p.id,
      points: pointsFor(overOptimal, race.finished),
      hops: race.hops,
      finished: race.finished,
      overOptimal,
      badges,
    };
  });
}

export function divergenceIndex(optimal: string[], actual: string[]): number {
  const n = Math.min(optimal.length, actual.length);
  for (let i = 0; i < n; i++) {
    if (normalize(optimal[i]) !== normalize(actual[i])) return i;
  }
  return n;
}
