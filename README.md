# wiki-race

Multiplayer Wikipedia racing game for team onsites. Start on one article, race to
a target article using only internal Wikipedia links. Fewest clicks wins the
round. Points accumulate — no elimination.

## Stack

- **Next.js 14** (App Router) — UI, Wikipedia proxy route
- **PartyKit** — real-time room state, player sync, round lifecycle
- **Tailwind** — styling
- **Wikipedia action API** (`action=parse`) — article HTML source
- **Netlify** — hosting (static + edge functions); PartyKit hosts the realtime layer

## Run locally

```bash
npm install
npm run dev            # Next.js on http://localhost:3000
npm run dev:party      # PartyKit on http://127.0.0.1:1999
```

Open the app in two browser windows/tabs (or devices on the same LAN). The first
player to join a room automatically becomes the host.

The Next.js app talks to PartyKit via `NEXT_PUBLIC_PARTYKIT_HOST`. For local dev
it defaults to `127.0.0.1:1999`. For deployment, set:

```
NEXT_PUBLIC_PARTYKIT_HOST=wiki-race.<your-partykit-username>.partykit.dev
```

## Deploy

```bash
npm run deploy:party   # partykit deploy (first-time: `npx partykit login`)
```

Then deploy the Next.js app to Netlify. Set `NEXT_PUBLIC_PARTYKIT_HOST` as a
build-time env var to the PartyKit URL printed by the deploy command.

## Puzzle bank

`public/puzzles.json` ships with a seed of hand-crafted puzzles across the three
difficulty tiers so the app works out of the box.

To generate a full bank from Wikipedia:

```bash
node scripts/generate-puzzles.js --count 200
```

This samples random article pairs, runs BFS through Wikipedia's internal link
graph (depth ≤ 8), and writes puzzles tagged with `optimalPath`, `optimalHops`,
`pathCount`, and `difficulty`. The script appends to the existing file, so you
can stop and resume. Expect long run times — each BFS makes many API calls.

## Game flow

1. **Lobby** — host creates a room and gets a 6-letter code. Players join.

2. **Reveal** — dramatic `START → END` card with a 5-second countdown.
3. **Race** — 3-minute timer, in-app Wikipedia article reader. Clicks are synced
   to PartyKit. The host sees a live spectator panel of every racer's current
   article and hop count.
4. **Replay** — BFS optimal path shown as "par", each player's path rendered
   below, divergence highlighted, badges awarded (Speed Runner / Longest Route /
   Most Creative), cumulative leaderboard updated.
5. **Next round** — host advances manually. Play as many rounds as you like.

## Scoring

| Performance                   | Points |
| ----------------------------- | ------ |
| Matched optimal hop count     | 10     |
| +1 over optimal               | 8      |
| +2 over optimal               | 6      |
| +3 over optimal               | 4      |
| Finished, more than +3 over   | 3      |
| Did not finish                | 1      |

## Layout

```
app/
  page.tsx              home (create/join)
  room/[code]/page.tsx  connected room (phase router)
  api/wiki/route.ts     Wikipedia proxy + HTML sanitizer
components/
  useRoom.ts            PartyKit client hook
  WikiArticle.tsx       article renderer with click hijacking
  phases/
    Lobby.tsx
    Reveal.tsx
    Race.tsx
    Replay.tsx
party/
  server.ts             PartyKit room server
shared/
  types.ts              shared client/server types
  scoring.ts            BFS-aware scoring + badges
  colors.ts             per-player color palette
scripts/
  generate-puzzles.js   offline puzzle bank generator
public/
  puzzles.json          committed puzzle bank
```
