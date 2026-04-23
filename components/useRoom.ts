"use client";

import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import type {
  ClientMessage,
  RoomSnapshot,
  ServerMessage,
} from "@/shared/types";

function getPartyHost(): string {
  if (typeof window === "undefined") return "localhost:1999";
  const env = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  if (env) return env;
  return "127.0.0.1:1999";
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

export function useRoom(code: string, name: string): UseRoom {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<PartySocket | null>(null);
  const playerId = useRef<string>("");
  if (!playerId.current) playerId.current = persistedId();

  useEffect(() => {
    if (!code) return;
    const socket = new PartySocket({
      host: getPartyHost(),
      room: code.toLowerCase(),
    });
    socketRef.current = socket;

    const helloName = name || persistedName("Racer") || "Racer";
    const onOpen = () => {
      setConnected(true);
      const hello: ClientMessage = {
        t: "hello",
        playerId: playerId.current,
        name: helloName,
      };
      socket.send(JSON.stringify(hello));
    };
    const onClose = () => setConnected(false);
    const onMessage = (ev: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.t === "snapshot") setSnapshot(msg.snapshot);
        else if (msg.t === "error") setError(msg.message);
      } catch {
        // ignore
      }
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("message", onMessage);

    return () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("message", onMessage);
      socket.close();
      socketRef.current = null;
    };
  }, [code, name]);

  const send = (msg: ClientMessage) => {
    const s = socketRef.current;
    if (!s) return;
    s.send(JSON.stringify(msg));
  };

  return { snapshot, playerId: playerId.current, send, connected, error };
}
