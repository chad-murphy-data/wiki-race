"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CODE_LEN = 6;

function randomCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  function persistName(n: string) {
    if (n) localStorage.setItem("wiki-race:name", n);
  }

  function create() {
    const n = name.trim() || "Racer";
    persistName(n);
    const c = randomCode();
    router.push(`/room/${c}?host=1`);
  }

  function join() {
    const c = code.trim().toUpperCase();
    if (c.length !== CODE_LEN) return;
    const n = name.trim() || "Racer";
    persistName(n);
    router.push(`/room/${c}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-5xl font-black tracking-tight text-paper">
            wiki<span className="text-accent">race</span>
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Team onsite Wikipedia racing. First to the target article wins.
          </p>
        </div>

        <div className="bg-ink/60 border border-white/10 rounded-2xl p-6 space-y-6">
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-white/60 mb-2">
              Your name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Racer"
              maxLength={24}
              className="w-full bg-black/40 border border-white/15 rounded-lg px-4 py-3 text-lg focus:border-accent focus:outline-none"
            />
          </label>

          <button
            onClick={create}
            className="w-full bg-accent hover:bg-accent2 transition text-ink font-bold text-lg py-3 rounded-lg"
          >
            Host a new room
          </button>

          <div className="flex items-center gap-3 text-white/40 text-xs">
            <div className="flex-1 h-px bg-white/10" />
            <span>or join one</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().slice(0, CODE_LEN))
              }
              placeholder="CODE"
              maxLength={CODE_LEN}
              className="flex-1 bg-black/40 border border-white/15 rounded-lg px-4 py-3 text-2xl tracking-[0.3em] text-center font-mono uppercase focus:border-cool focus:outline-none"
            />
            <button
              onClick={join}
              disabled={code.length !== CODE_LEN}
              className="bg-cool hover:bg-cool/80 disabled:opacity-30 disabled:cursor-not-allowed text-ink font-bold px-6 rounded-lg"
            >
              Join
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          No accounts. No tracking. Just the room code.
        </p>
      </div>
    </main>
  );
}
