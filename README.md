# wiki-race

Multiplayer Wikipedia racing game for team onsites. Start on one article, race
to a target article using only internal Wikipedia links. Fewest clicks wins the
round. Points accumulate — no elimination.

## Stack

- **Next.js 14** (App Router) — UI, Wikipedia proxy route
- **Cloudflare Workers + Durable Objects** — real-time room state, player sync,
  round lifecycle (one Durable Object per room)
- **Tailwind** — styling
- **Wikipedia action API** (`action=parse`) — article HTML source
- **Netlify** — hosts the Next.js front-end
- **`wrangler`** — Cloudflare's CLI for deploying the Worker

## Run locally

```bash
npm install
npm run dev            # Next.js on http://localhost:3000
npm run dev:worker     # Cloudflare Worker on http://127.0.0.1:8787
```

Open the app in two browser windows/tabs (or devices on the same LAN). The
first player to join a room automatically becomes the host.

The Next.js app finds the Worker via `NEXT_PUBLIC_WORKER_HOST`. For local dev
it defaults to `127.0.0.1:8787`. For deployment, set it to whatever `wrangler
deploy` prints (without the scheme), e.g.
`wiki-race.your-subdomain.workers.dev`.

## Deploy

### 1. Cloudflare Worker (room server)

```bash
# One-time auth: either of these works
npx wrangler login                       # interactive (browser)
# OR for headless / CI:
export CLOUDFLARE_API_TOKEN=<your-token> # from dash.cloudflare.com → My Profile → API Tokens

npx wrangler deploy                      # alias: npm run deploy:worker
```

The first deploy will print a URL like
`https://wiki-race.your-subdomain.workers.dev`. Copy the hostname.

### 2. Next.js front-end (Netlify)

Connect this repo in the Netlify dashboard. Netlify auto-detects Next.js via
`netlify.toml`. Then set the env var:

```
NEXT_PUBLIC_WORKER_HOST=wiki-race.your-subdomain.workers.dev
```

(Site settings → Environment variables, then trigger a redeploy.)

## Puzzle bank

`public/puzzles.json` ships with a seed of hand-crafted puzzles across the
three difficulty tiers so the app works out of the box.

To generate a full bank from Wikipedia:

```bash
node scripts/generate-puzzles.js --count 200
```

Samples random article pairs, runs BFS through Wikipedia's internal link graph
(depth ≤ 8), writes puzzles tagged with `optimalPath`, `optimalHops`,
`pathCount`, and `difficulty`. The script appends to the existing file, so you
can stop and resume. Expect long run times — each BFS makes many API calls.

## Game flow

1. **Lobby** — host creates a room and gets a 6-letter code. Players join.
2. **Reveal** — dramatic `START → END` card with a 5-second countdown.
3. **Race** — 3-minute timer, in-app Wikipedia article reader. Clicks are
   synced through the Worker's Durable Object. The host sees a live spectator
   panel of every racer's current article and hop count.
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
  api/wiki/route.ts     Wikipedia proxy + sanitize-html sanitizer + rate limit
components/
  useRoom.ts            WebSocket client hook (with reconnect)
  WikiArticle.tsx       article renderer with click hijacking
  phases/
    Lobby.tsx
    Reveal.tsx
    Race.tsx
    Replay.tsx
worker/
  index.ts              Cloudflare Worker + RoomDO Durable Object
shared/
  types.ts              shared client/server types
  scoring.ts            BFS-aware scoring + badges
  colors.ts             per-player color palette
scripts/
  generate-puzzles.js   offline puzzle bank generator
public/
  puzzles.json          committed puzzle bank
wrangler.toml           Cloudflare Worker config
netlify.toml            Netlify build config (Next.js)
```

## Hardening notes

- Wikipedia HTML is sanitized server-side with `sanitize-html` (strict
  whitelist + `transformTags` for link rewriting + `exclusiveFilter` for
  blocked classes like `infobox`, `navbox`, `mw-editsection`).
- `/api/wiki` is rate-limited to 60 req/min per IP.
- Player names are stripped of control characters and capped at 24 chars.
- Room storage auto-clears after 24h of inactivity to prevent zombie state.
- Room codes are 6 letters from a confusable-stripped alphabet (~191M
  combinations, brute-force resistant for friend-group use).
