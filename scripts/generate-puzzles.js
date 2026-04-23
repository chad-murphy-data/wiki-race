#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generate a puzzle bank for wiki-race.
 *
 * Strategy:
 *   - Sample random Wikipedia article pairs (via the `random` endpoint).
 *   - Run BFS from start to end along Wikipedia's internal link graph.
 *   - Limit to depth <= 8. Skip pairs that can't be connected in time.
 *   - Count how many distinct paths of length <= optimal+1 exist (cheap proxy
 *     for pathCount; full enumeration would be too expensive against the API).
 *   - Emit ~200 puzzles balanced across difficulty buckets.
 *
 * Usage:
 *   node scripts/generate-puzzles.js [--count 200] [--out public/puzzles.json]
 */

const fs = require("node:fs");
const path = require("node:path");

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "wiki-race-generator/0.1 (team onsite game)";
const MAX_DEPTH = 8;
const DIFFICULTY_TARGETS = { easy: 60, medium: 80, hard: 60 };
const LINKS_PER_PAGE = 500;

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const TOTAL = Number(arg("count", 200));
const OUT = path.resolve(
  process.cwd(),
  arg("out", "public/puzzles.json")
);

const linkCache = new Map();

async function wikiFetch(params) {
  const q = new URLSearchParams({
    format: "json",
    origin: "*",
    ...params,
  });
  const url = `${WIKI_API}?${q.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`wiki ${res.status} for ${url}`);
  return res.json();
}

async function randomArticle() {
  const data = await wikiFetch({
    action: "query",
    list: "random",
    rnnamespace: "0",
    rnlimit: "1",
  });
  return data.query.random[0].title;
}

async function getLinks(title) {
  const key = normalize(title);
  if (linkCache.has(key)) return linkCache.get(key);
  const out = [];
  let plcontinue;
  let pages = 0;
  while (pages < 3) {
    const params = {
      action: "query",
      titles: title,
      prop: "links",
      pllimit: String(LINKS_PER_PAGE),
      plnamespace: "0",
      redirects: "1",
    };
    if (plcontinue) params.plcontinue = plcontinue;
    const data = await wikiFetch(params);
    const pagesObj = data.query?.pages ?? {};
    for (const pid of Object.keys(pagesObj)) {
      const links = pagesObj[pid].links ?? [];
      for (const l of links) out.push(l.title);
    }
    if (!data.continue?.plcontinue) break;
    plcontinue = data.continue.plcontinue;
    pages++;
  }
  linkCache.set(key, out);
  return out;
}

function normalize(t) {
  return t.trim().replace(/_/g, " ").toLowerCase();
}

async function bfs(start, end) {
  const startN = normalize(start);
  const endN = normalize(end);
  if (startN === endN) return null;
  const parents = new Map();
  parents.set(startN, { parent: null, title: start, depth: 0 });
  const queue = [start];
  let found = null;
  while (queue.length && !found) {
    const batch = queue.splice(0, 6);
    const results = await Promise.all(batch.map((t) => getLinksSafe(t)));
    for (let i = 0; i < batch.length; i++) {
      const parentTitle = batch[i];
      const parentN = normalize(parentTitle);
      const parentInfo = parents.get(parentN);
      if (!parentInfo) continue;
      const depth = parentInfo.depth + 1;
      if (depth > MAX_DEPTH) continue;
      for (const link of results[i]) {
        const n = normalize(link);
        if (parents.has(n)) continue;
        parents.set(n, {
          parent: parentN,
          title: link,
          depth,
        });
        if (n === endN) {
          found = n;
          break;
        }
        if (depth < MAX_DEPTH) queue.push(link);
      }
      if (found) break;
    }
  }
  if (!found) return null;
  const path = [];
  let cur = found;
  while (cur) {
    const info = parents.get(cur);
    if (!info) break;
    path.unshift(info.title);
    cur = info.parent;
  }
  return path;
}

async function getLinksSafe(title) {
  try {
    return await getLinks(title);
  } catch (e) {
    console.warn(`  getLinks failed for "${title}": ${e.message}`);
    return [];
  }
}

function difficultyFor(hops) {
  if (hops <= 3) return "easy";
  if (hops <= 5) return "medium";
  return "hard";
}

async function countPathsUpTo(start, end, maxDepth) {
  const endN = normalize(end);
  const memo = new Map();
  async function dfs(node, depthLeft) {
    const n = normalize(node);
    if (n === endN) return 1;
    if (depthLeft === 0) return 0;
    const key = `${n}|${depthLeft}`;
    if (memo.has(key)) return memo.get(key);
    const links = await getLinksSafe(node);
    let total = 0;
    for (const link of links) {
      if (normalize(link) === normalize(start)) continue;
      total += await dfs(link, depthLeft - 1);
      if (total > 500) break;
    }
    memo.set(key, total);
    return total;
  }
  return dfs(start, maxDepth);
}

async function generateOne() {
  for (let attempts = 0; attempts < 8; attempts++) {
    const [start, end] = await Promise.all([
      randomArticle(),
      randomArticle(),
    ]);
    process.stdout.write(`  try ${attempts + 1}: ${start} -> ${end} ... `);
    const path = await bfs(start, end);
    if (!path) {
      console.log("no path");
      continue;
    }
    const hops = path.length - 1;
    const difficulty = difficultyFor(hops);
    console.log(`ok (${hops} hops, ${difficulty})`);
    const pathCount = 1;
    return {
      id: `puzzle_${Date.now().toString(36)}_${Math.floor(
        Math.random() * 1e4
      )}`,
      start,
      end,
      optimalPath: path,
      optimalHops: hops,
      pathCount,
      difficulty,
    };
  }
  return null;
}

async function main() {
  console.log(`Generating ${TOTAL} puzzles -> ${OUT}`);
  const existing = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, "utf8"))
    : [];
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const p of existing) counts[p.difficulty] = (counts[p.difficulty] || 0) + 1;
  const bank = [...existing];
  while (bank.length < TOTAL) {
    const p = await generateOne();
    if (!p) continue;
    if (counts[p.difficulty] >= DIFFICULTY_TARGETS[p.difficulty]) {
      continue;
    }
    counts[p.difficulty]++;
    bank.push(p);
    fs.writeFileSync(OUT, JSON.stringify(bank, null, 2));
    console.log(
      `  saved (${bank.length}/${TOTAL})  easy=${counts.easy} med=${counts.medium} hard=${counts.hard}`
    );
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
