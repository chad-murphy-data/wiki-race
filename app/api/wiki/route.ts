import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";

export const runtime = "nodejs";
export const revalidate = 600;

const WIKI_API =
  "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text%7Cdisplaytitle&redirects=1&page=";

const RATE_LIMIT_PER_MIN = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return { ok: true, retryAfterSec: 0 };
  }
  if (bucket.count >= RATE_LIMIT_PER_MIN) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true, retryAfterSec: 0 };
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateBuckets) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }, 60_000).unref?.();
}

const BLOCKED_CLASSES = new Set([
  "infobox",
  "navbox",
  "sidebar",
  "hatnote",
  "thumb",
  "metadata",
  "mw-editsection",
  "reference",
  "references",
  "reflist",
  "noprint",
  "mw-empty-elt",
  "toc",
  "navigation-not-searchable",
  "portal",
  "vcard",
  "succession-box",
]);

function hasBlockedClass(attribs: Record<string, string>): boolean {
  const cls = attribs.class;
  if (!cls) return false;
  const tokens = cls.split(/\s+/);
  for (const t of tokens) if (BLOCKED_CLASSES.has(t)) return true;
  return false;
}

function sanitize(html: string): string {
  const cleaned = sanitizeHtml(html, {
    allowedTags: [
      "p",
      "div",
      "span",
      "a",
      "b",
      "i",
      "em",
      "strong",
      "u",
      "ul",
      "ol",
      "li",
      "dl",
      "dt",
      "dd",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "br",
      "hr",
      "code",
      "pre",
    ],
    allowedAttributes: {
      a: ["data-wiki-title", "class"],
      div: ["class"],
      span: ["class"],
      "*": [],
    },
    allowedSchemes: [],
    disallowedTagsMode: "discard",
    exclusiveFilter: (frame) => {
      if (frame.tag === "span" || frame.tag === "div") {
        if (hasBlockedClass(frame.attribs)) return true;
      }
      return false;
    },
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href || "";
        const cls = attribs.class || "";
        const drop = { tagName: "span", attribs: {} as Record<string, string> };
        if (!href.startsWith("/wiki/")) return drop;
        if (
          cls.includes("new") ||
          cls.includes("extiw") ||
          cls.includes("external") ||
          cls.includes("image")
        ) {
          return drop;
        }
        let rawTitle: string;
        try {
          rawTitle = decodeURIComponent(
            href.slice("/wiki/".length).split("#")[0].replace(/_/g, " ")
          );
        } catch {
          return drop;
        }
        if (rawTitle.includes(":")) return drop;
        return {
          tagName: "a",
          attribs: {
            "data-wiki-title": rawTitle,
            class: "wiki-link",
          },
        };
      },
    },
  });
  return `<div class="wiki-article">${cleaned}</div>`;
}

function stripTags(s: string): string {
  return sanitizeHtml(s, { allowedTags: [], allowedAttributes: {} });
}

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title");
  if (!title) {
    return NextResponse.json({ error: "missing title" }, { status: 400 });
  }

  const ip = clientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      }
    );
  }

  const url = WIKI_API + encodeURIComponent(title);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "wiki-race/0.1 (team onsite game; contact: local)",
      Accept: "application/json",
    },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `wiki fetch failed (${res.status})` },
      { status: 502 }
    );
  }
  const data = (await res.json()) as {
    parse?: {
      title: string;
      displaytitle: string;
      text: { "*": string };
    };
    error?: { info: string };
  };
  if (!data.parse) {
    return NextResponse.json(
      { error: data.error?.info ?? "unknown wiki error" },
      { status: 404 }
    );
  }

  const rawHtml = data.parse.text["*"];
  const html = sanitize(rawHtml);

  return NextResponse.json(
    {
      title: data.parse.title,
      displayTitle: stripTags(data.parse.displaytitle),
      html,
    },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=600, stale-while-revalidate=3600",
      },
    }
  );
}
