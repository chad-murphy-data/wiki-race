import type * as Party from "partykit/server";
import puzzles from "../public/puzzles.json";
import { pickColor } from "../shared/colors";
import { computeScores, normalize } from "../shared/scoring";
import type {
  ClientMessage,
  Difficulty,
  GamePhase,
  Player,
  PlayerRace,
  Puzzle,
  RoomSnapshot,
  RoundScore,
  ServerMessage,
} from "../shared/types";

const RACE_DURATION_MS = 3 * 60 * 1000;
const REVEAL_DURATION_MS = 5 * 1000;

type ConnectionMeta = { playerId: string };

export default class WikiRaceServer implements Party.Server {
  players: Map<string, Player> = new Map();
  hostId: string | null = null;
  phase: GamePhase = "lobby";
  puzzle: Puzzle | null = null;
  difficulty: Difficulty = "medium";
  raceStartsAt: number | null = null;
  raceEndsAt: number | null = null;
  races: Record<string, PlayerRace> = {};
  lastRound: RoomSnapshot["lastRound"] = null;
  roundNumber = 0;
  raceTimer: ReturnType<typeof setTimeout> | null = null;
  revealTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const saved = await this.room.storage.get<{
      players: [string, Player][];
      hostId: string | null;
      roundNumber: number;
    }>("roomMeta");
    if (saved) {
      saved.players.forEach(([id, p]) =>
        this.players.set(id, { ...p, connected: false })
      );
      this.hostId = saved.hostId;
      this.roundNumber = saved.roundNumber ?? 0;
    }
  }

  persist() {
    this.room.storage.put("roomMeta", {
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      roundNumber: this.roundNumber,
    });
  }

  onConnect(conn: Party.Connection<ConnectionMeta>) {
    this.send(conn, { t: "snapshot", snapshot: this.snapshot() });
  }

  onMessage(raw: string, conn: Party.Connection<ConnectionMeta>) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    this.handle(msg, conn);
  }

  onClose(conn: Party.Connection<ConnectionMeta>) {
    const meta = conn.state;
    if (!meta?.playerId) return;
    const p = this.players.get(meta.playerId);
    if (p) {
      p.connected = false;
      this.broadcast();
      this.persist();
    }
  }

  handle(msg: ClientMessage, conn: Party.Connection<ConnectionMeta>) {
    switch (msg.t) {
      case "hello":
        return this.handleHello(msg, conn);
      case "rename":
        return this.handleRename(msg, conn);
      case "claim-host":
        return this.handleClaimHost(conn);
      case "set-difficulty":
        return this.handleSetDifficulty(msg, conn);
      case "start-round":
        return this.handleStartRound(conn);
      case "next-round":
        return this.handleNextRound(conn);
      case "back-to-lobby":
        return this.handleBackToLobby(conn);
      case "click":
        return this.handleClick(msg, conn);
      case "give-up":
        return this.handleGiveUp(conn);
    }
  }

  handleHello(
    msg: { playerId: string; name: string },
    conn: Party.Connection<ConnectionMeta>
  ) {
    const existing = this.players.get(msg.playerId);
    if (existing) {
      existing.connected = true;
      existing.name = msg.name || existing.name;
    } else {
      const usedColors = new Set(
        Array.from(this.players.values()).map((p) => p.color)
      );
      const firstPlayer = this.players.size === 0;
      const player: Player = {
        id: msg.playerId,
        name: msg.name || "Racer",
        color: pickColor(usedColors),
        isHost: firstPlayer || this.hostId === msg.playerId,
        connected: true,
        score: 0,
      };
      this.players.set(msg.playerId, player);
      if (firstPlayer) this.hostId = msg.playerId;
    }
    conn.setState({ playerId: msg.playerId });
    this.send(conn, { t: "you", playerId: msg.playerId });
    this.broadcast();
    this.persist();
  }

  handleRename(
    msg: { name: string },
    conn: Party.Connection<ConnectionMeta>
  ) {
    const pid = conn.state?.playerId;
    if (!pid) return;
    const p = this.players.get(pid);
    if (!p) return;
    p.name = (msg.name || "").slice(0, 24) || p.name;
    this.broadcast();
    this.persist();
  }

  handleClaimHost(conn: Party.Connection<ConnectionMeta>) {
    const pid = conn.state?.playerId;
    if (!pid) return;
    const hostStillHere =
      this.hostId && this.players.get(this.hostId)?.connected;
    if (hostStillHere) return;
    this.hostId = pid;
    this.players.forEach((p) => (p.isHost = p.id === pid));
    this.broadcast();
    this.persist();
  }

  handleSetDifficulty(
    msg: { difficulty: Difficulty },
    conn: Party.Connection<ConnectionMeta>
  ) {
    if (!this.isHost(conn)) return;
    this.difficulty = msg.difficulty;
    this.broadcast();
  }

  handleStartRound(conn: Party.Connection<ConnectionMeta>) {
    if (!this.isHost(conn)) return;
    if (this.phase !== "lobby" && this.phase !== "replay") return;
    const puzzle = pickPuzzle(this.difficulty);
    if (!puzzle) {
      this.send(conn, {
        t: "error",
        message: `No puzzles available for difficulty ${this.difficulty}.`,
      });
      return;
    }
    this.puzzle = puzzle;
    this.roundNumber += 1;
    this.races = {};
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.races[p.id] = {
        playerId: p.id,
        path: [puzzle.start],
        finished: false,
        hops: 0,
      };
    }
    this.phase = "reveal";
    this.raceStartsAt = Date.now() + REVEAL_DURATION_MS;
    this.raceEndsAt = this.raceStartsAt + RACE_DURATION_MS;
    this.clearTimers();
    this.revealTimer = setTimeout(() => {
      this.phase = "race";
      this.broadcast();
    }, REVEAL_DURATION_MS);
    this.raceTimer = setTimeout(() => {
      this.endRound();
    }, REVEAL_DURATION_MS + RACE_DURATION_MS);
    this.broadcast();
    this.persist();
  }

  handleNextRound(conn: Party.Connection<ConnectionMeta>) {
    if (!this.isHost(conn)) return;
    this.handleStartRound(conn);
  }

  handleBackToLobby(conn: Party.Connection<ConnectionMeta>) {
    if (!this.isHost(conn)) return;
    this.clearTimers();
    this.phase = "lobby";
    this.puzzle = null;
    this.races = {};
    this.raceStartsAt = null;
    this.raceEndsAt = null;
    this.broadcast();
  }

  handleClick(
    msg: { article: string },
    conn: Party.Connection<ConnectionMeta>
  ) {
    const pid = conn.state?.playerId;
    if (!pid) return;
    if (this.phase !== "race") return;
    const race = this.races[pid];
    const puzzle = this.puzzle;
    if (!race || !puzzle) return;
    if (race.finished) return;
    const article = msg.article.trim();
    if (!article) return;
    race.path.push(article);
    race.hops = race.path.length - 1;
    if (normalize(article) === normalize(puzzle.end)) {
      race.finished = true;
      race.finishedAt = Date.now();
    }
    this.broadcast();
    const allDone = Object.values(this.races).every(
      (r) => r.finished || r.givenUp
    );
    if (allDone) {
      this.endRound();
    }
  }

  handleGiveUp(conn: Party.Connection<ConnectionMeta>) {
    const pid = conn.state?.playerId;
    if (!pid) return;
    if (this.phase !== "race") return;
    const race = this.races[pid];
    if (!race || race.finished) return;
    race.givenUp = true;
    this.broadcast();
    const allDone = Object.values(this.races).every(
      (r) => r.finished || r.givenUp
    );
    if (allDone) this.endRound();
  }

  endRound() {
    if (this.phase !== "race" && this.phase !== "reveal") return;
    this.clearTimers();
    if (!this.puzzle) {
      this.phase = "lobby";
      this.broadcast();
      return;
    }
    const scores: RoundScore[] = computeScores(
      this.puzzle,
      Array.from(this.players.values()),
      this.races
    );
    for (const s of scores) {
      const p = this.players.get(s.playerId);
      if (p) p.score += s.points;
    }
    this.lastRound = {
      puzzle: this.puzzle,
      races: JSON.parse(JSON.stringify(this.races)),
      scores,
    };
    this.phase = "replay";
    this.broadcast();
    this.persist();
  }

  clearTimers() {
    if (this.raceTimer) {
      clearTimeout(this.raceTimer);
      this.raceTimer = null;
    }
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  isHost(conn: Party.Connection<ConnectionMeta>): boolean {
    const pid = conn.state?.playerId;
    return !!pid && pid === this.hostId;
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.room.id,
      phase: this.phase,
      players: Array.from(this.players.values()),
      hostId: this.hostId,
      puzzle: this.puzzle,
      difficulty: this.difficulty,
      raceStartsAt: this.raceStartsAt,
      raceEndsAt: this.raceEndsAt,
      races: this.races,
      lastRound: this.lastRound,
      roundNumber: this.roundNumber,
    };
  }

  broadcast() {
    const payload: ServerMessage = { t: "snapshot", snapshot: this.snapshot() };
    this.room.broadcast(JSON.stringify(payload));
  }

  send(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}

function pickPuzzle(difficulty: Difficulty): Puzzle | null {
  const pool = (puzzles as Puzzle[]).filter(
    (p) => p.difficulty === difficulty
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

