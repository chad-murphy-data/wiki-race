export type Difficulty = "easy" | "medium" | "hard";

export interface Puzzle {
  id: string;
  start: string;
  end: string;
  optimalPath: string[];
  optimalHops: number;
  pathCount: number;
  difficulty: Difficulty;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  score: number;
}

export interface PlayerRace {
  playerId: string;
  path: string[];
  finished: boolean;
  finishedAt?: number;
  hops: number;
  givenUp?: boolean;
}

export type GamePhase =
  | "lobby"
  | "reveal"
  | "race"
  | "replay";

export interface RoundScore {
  playerId: string;
  points: number;
  hops: number;
  finished: boolean;
  overOptimal: number | null;
  badges: Badge[];
}

export type Badge = "speed-runner" | "longest-route" | "most-creative";

export interface RoomSnapshot {
  code: string;
  phase: GamePhase;
  players: Player[];
  hostId: string | null;
  puzzle: Puzzle | null;
  difficulty: Difficulty;
  raceStartsAt: number | null;
  raceEndsAt: number | null;
  races: Record<string, PlayerRace>;
  lastRound: {
    puzzle: Puzzle;
    races: Record<string, PlayerRace>;
    scores: RoundScore[];
  } | null;
  roundNumber: number;
}

export type ClientMessage =
  | { t: "hello"; playerId: string; name: string }
  | { t: "rename"; name: string }
  | { t: "claim-host" }
  | { t: "set-difficulty"; difficulty: Difficulty }
  | { t: "start-round" }
  | { t: "next-round" }
  | { t: "back-to-lobby" }
  | { t: "click"; article: string }
  | { t: "give-up" };

export type ServerMessage =
  | { t: "snapshot"; snapshot: RoomSnapshot }
  | { t: "you"; playerId: string }
  | { t: "error"; message: string };
