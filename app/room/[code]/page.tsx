"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRoom } from "@/components/useRoom";
import { Lobby } from "@/components/phases/Lobby";
import { Reveal } from "@/components/phases/Reveal";
import { Race } from "@/components/phases/Race";
import { Replay } from "@/components/phases/Replay";

export default function RoomPage() {
  const params = useParams();
  const search = useSearchParams();
  const rawCode = (params.code as string) || "";
  const code = rawCode.toUpperCase();
  const wantsHost = search.get("host") === "1";

  const [name, setName] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("wiki-race:name") || "";
    setName(stored);
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!name) return <NamePrompt onSubmit={setName} />;

  return <Connected code={code} name={name} wantsHost={wantsHost} />;
}

function NamePrompt({ onSubmit }: { onSubmit: (n: string) => void }) {
  const [name, setName] = useState("");
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-ink/60 border border-white/10 rounded-2xl p-6">
        <h2 className="text-xl font-bold mb-4">Set your display name</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Racer"
          maxLength={24}
          className="w-full bg-black/40 border border-white/15 rounded-lg px-4 py-3 text-lg mb-4"
        />
        <button
          onClick={() => {
            const n = name.trim() || "Racer";
            localStorage.setItem("wiki-race:name", n);
            onSubmit(n);
          }}
          className="w-full bg-accent text-ink font-bold py-3 rounded-lg"
        >
          Enter room
        </button>
      </div>
    </main>
  );
}

function Connected({
  code,
  name,
  wantsHost,
}: {
  code: string;
  name: string;
  wantsHost: boolean;
}) {
  const { snapshot, playerId, send, connected, error } = useRoom(code, name);

  useEffect(() => {
    if (!snapshot || !wantsHost) return;
    if (snapshot.hostId === null) {
      send({ t: "claim-host" });
    }
  }, [snapshot, wantsHost, send]);

  if (!connected || !snapshot) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-white/60 text-sm">
          Connecting to room <span className="font-mono">{code}</span>…
        </div>
      </main>
    );
  }

  const me = snapshot.players.find((p) => p.id === playerId);
  const isHost = snapshot.hostId === playerId;

  return (
    <main className="min-h-screen">
      {error && (
        <div className="fixed top-3 right-3 bg-pop text-paper px-4 py-2 rounded-lg text-sm z-50">
          {error}
        </div>
      )}
      {snapshot.phase === "lobby" && (
        <Lobby
          snapshot={snapshot}
          me={me}
          isHost={isHost}
          send={send}
        />
      )}
      {snapshot.phase === "reveal" && (
        <Reveal snapshot={snapshot} />
      )}
      {snapshot.phase === "race" && (
        <Race
          snapshot={snapshot}
          me={me}
          isHost={isHost}
          send={send}
        />
      )}
      {snapshot.phase === "replay" && (
        <Replay
          snapshot={snapshot}
          isHost={isHost}
          send={send}
        />
      )}
    </main>
  );
}
