"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  RoomSnapshot,
  ServerMessage,
} from "@/shared/types";

function getWorkerUrl(code: string): string {
  const host = process.env.NEXT_PUBLIC_WORKER_HOST;
  if (!host) {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return `ws://127.0.0.1:8787/room/${code}`;
    }
    return `ws://127.0.0.1:8787/room/${code}`;
  }
  const scheme = host.startsWith("localhost") || host.startsWith("127.")
    ? "ws"
    : "wss";
  return `${scheme}://${host}/room/${code}`;
}

function persistedId(): string {
  if (typeof window === "undefined") return "";
  const key = "wiki-race:playerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function persistedName(defaultName?: string): string {
  if (typeof window === "undefined") return defaultName || "";
  const key = "wiki-race:name";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  if (defaultName) localStorage.setItem(key, defaultName);
  return defaultName || "";
}

export function setPersistedName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("wiki-race:name", name);
}

export interface UseRoom {
  snapshot: RoomSnapshot | null;
  playerId: string;
  send: (msg: ClientMessage) => void;
  connected: boolean;
  error: string | null;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export function useRoom(code: string, name: string): UseRoom {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playerId = useRef<string>("");
  if (!playerId.current) playerId.current = persistedId();

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const helloName = name || persistedName("Racer") || "Racer";

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(getWorkerUrl(code));
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        attempt = 0;
        setConnected(true);
        const hello: ClientMessage = {
          t: "hello",
          playerId: playerId.current,
          name: helloName,
        };
        ws.send(JSON.stringify(hello));
      });

      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as ServerMessage;
          if (msg.t === "snapshot") setSnapshot(msg.snapshot);
          else if (msg.t === "error") setError(msg.message);
        } catch {
          // ignore malformed
        }
      });

      ws.addEventListener("close", () => {
        setConnected(false);
        if (cancelled) return;
        const delay =
          RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      });

      ws.addEventListener("error", () => {
        // close handler will reconnect
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState <= 1) ws.close();
    };
  }, [code, name]);

  const send = (msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify(msg));
  };

  return { snapshot, playerId: playerId.current, send, connected, error };
}
