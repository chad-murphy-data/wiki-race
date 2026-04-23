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
  ServerMessage,
} from "../shared/types";

const RACE_DURATION_MS = 3 * 60 * 1000;
const REVEAL_DURATION_MS = 5 * 1000;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const NAME_MAX_LEN = 24;

interface Env {
  ROOMS: DurableObjectNamespace;
}

function sanitizeName(input: string): string {
  const cleaned = (input || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX_LEN);
  return cleaned || "Racer";
}

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Upgrade",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]+)\/?$/);
    if (!match) {
      return new Response("not found", {
        status: 404,
        headers: corsHeaders(origin),
      });
    }
    const code = match[1].toUpperCase();
    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);
    return stub.fetch(req);
  },
};

interface ConnState {
  playerId: string;
}

export class RoomDO {
  private state: DurableObjectState;
  private players: Map<string, Player> = new Map();
  private hostId: string | null = null;
  private phase: GamePhase = "lobby";
  private puzzle: Puzzle | null = null;
  private difficulty: Difficulty = "medium";
  private raceStartsAt: number | null = null;
  private raceEndsAt: number | null = null;
  private races: Record<string, PlayerRace> = {};
  private lastRound: RoomSnapshot["lastRound"] = null;
  private roundNumber = 0;
  private code = "";
  private loaded = false;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private raceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const saved = await this.state.storage.get<{
      players: [string, Player][];
      hostId: string | null;
      roundNumber: number;
      lastActivity?: number;
    }>("roomMeta");
    if (!saved) return;
    const age = Date.now() - (saved.lastActivity ?? 0);
    if (age > ROOM_TTL_MS) {
      await this.state.storage.deleteAll();
      return;
    }
    saved.players.forEach(([id, p]) =>
      this.players.set(id, { ...p, connected: false })
    );
    this.hostId = saved.hostId;
    this.roundNumber = saved.roundNumber ?? 0;
  }

  private persist() {
    void this.state.storage.put("roomMeta", {
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      roundNumber: this.roundNumber,
      lastActivity: Date.now(),
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]+)\/?$/);
    if (match) this.code = match[1].toUpperCase();

    await this.ensureLoaded();

    const upgrade = req.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();

    const conn: ConnState = { playerId: "" };
    server.addEventListener("message", (ev) => {
      let data: string;
      if (typeof ev.data === "string") data = ev.data;
      else return;
      this.handleMessage(server, conn, data);
    });
    server.addEventListener("close", () => this.handleClose(conn));
    server.addEventListener("error", () => this.handleClose(conn));

    this.send(server, { t: "snapshot", snapshot: this.snapshot() });

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(ws: WebSocket, conn: ConnState, raw: string) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case "hello":
        return this.handleHello(ws, conn, msg);
      case "rename":
        return this.handleRename(conn, msg);
      case "claim-host":
        return this.handleClaimHost(conn);
      case "set-difficulty":
        return this.handleSetDifficulty(conn, msg);
      case "start-round":
        return this.handleStartRound(ws, conn);
      case "next-round":
        return this.handleStartRound(ws, conn);
      case "back-to-lobby":
        return this.handleBackToLobby(conn);
      case "click":
        return this.handleClick(conn, msg);
      case "give-up":
        return this.handleGiveUp(conn);
    }
  }

  private handleHello(
    ws: WebSocket,
    conn: ConnState,
    msg: { playerId: string; name: string }
  ) {
    const cleanName = sanitizeName(msg.name);
    const existing = this.players.get(msg.playerId);
    if (existing) {
      existing.connected = true;
      existing.name = cleanName;
    } else {
      const usedColors = new Set(
        Array.from(this.players.values()).map((p) => p.color)
      );
      const firstPlayer = this.players.size === 0;
      const player: Player = {
        id: msg.playerId,
        name: cleanName,
        color: pickColor(usedColors),
        isHost: firstPlayer || this.hostId === msg.playerId,
        connected: true,
        score: 0,
      };
      this.players.set(msg.playerId, player);
      if (firstPlayer) this.hostId = msg.playerId;
    }
    conn.playerId = msg.playerId;
    this.connBy.set(msg.playerId, ws);
    this.send(ws, { t: "you", playerId: msg.playerId });
    this.broadcast();
    this.persist();
  }

  private handleRename(conn: ConnState, msg: { name: string }) {
    if (!conn.playerId) return;
    const p = this.players.get(conn.playerId);
    if (!p) return;
    p.name = sanitizeName(msg.name);
    this.broadcast();
    this.persist();
  }

  private handleClaimHost(conn: ConnState) {
    if (!conn.playerId) return;
    const hostStillHere =
      this.hostId && this.players.get(this.hostId)?.connected;
    if (hostStillHere) return;
    this.hostId = conn.playerId;
    this.players.forEach((p) => (p.isHost = p.id === conn.playerId));
    this.broadcast();
    this.persist();
  }

  private handleSetDifficulty(
    conn: ConnState,
    msg: { difficulty: Difficulty }
  ) {
    if (conn.playerId !== this.hostId) return;
    this.difficulty = msg.difficulty;
    this.broadcast();
  }

  private handleStartRound(ws: WebSocket, conn: ConnState) {
    if (conn.playerId !== this.hostId) return;
    if (this.phase !== "lobby" && this.phase !== "replay") return;
    const puzzle = pickPuzzle(this.difficulty);
    if (!puzzle) {
      this.send(ws, {
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

  private handleBackToLobby(conn: ConnState) {
    if (conn.playerId !== this.hostId) return;
    this.clearTimers();
    this.phase = "lobby";
    this.puzzle = null;
    this.races = {};
    this.raceStartsAt = null;
    this.raceEndsAt = null;
    this.broadcast();
  }

  private handleClick(conn: ConnState, msg: { article: string }) {
    if (!conn.playerId) return;
    if (this.phase !== "race") return;
    const race = this.races[conn.playerId];
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
    if (allDone) this.endRound();
  }

  private handleGiveUp(conn: ConnState) {
    if (!conn.playerId) return;
    if (this.phase !== "race") return;
    const race = this.races[conn.playerId];
    if (!race || race.finished) return;
    race.givenUp = true;
    this.broadcast();
    const allDone = Object.values(this.races).every(
      (r) => r.finished || r.givenUp
    );
    if (allDone) this.endRound();
  }

  private endRound() {
    if (this.phase !== "race" && this.phase !== "reveal") return;
    this.clearTimers();
    if (!this.puzzle) {
      this.phase = "lobby";
      this.broadcast();
      return;
    }
    const scores = computeScores(
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

  private clearTimers() {
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
    if (this.raceTimer) {
      clearTimeout(this.raceTimer);
      this.raceTimer = null;
    }
  }

  private handleClose(conn: ConnState) {
    if (!conn.playerId) return;
    this.connBy.delete(conn.playerId);
    const p = this.players.get(conn.playerId);
    if (p) {
      p.connected = false;
      this.broadcast();
      this.persist();
    }
  }

  private snapshot(): RoomSnapshot {
    return {
      code: this.code,
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

  private connBy: Map<string, WebSocket> = new Map();

  private broadcast() {
    const payload: ServerMessage = {
      t: "snapshot",
      snapshot: this.snapshot(),
    };
    const json = JSON.stringify(payload);
    for (const ws of this.connBy.values()) {
      try {
        ws.send(json);
      } catch {
        // ignore broken sockets; close handler will clean up
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }
}

function pickPuzzle(difficulty: Difficulty): Puzzle | null {
  const pool = (puzzles as Puzzle[]).filter(
    (p) => p.difficulty === difficulty
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
