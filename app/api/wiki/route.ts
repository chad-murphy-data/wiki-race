import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 300;

const WIKI_API =
  "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text%7Cdisplaytitle&redirects=1&page=";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title");
  if (!title) {
    return NextResponse.json({ error: "missing title" }, { status: 400 });
  }
  const url = WIKI_API + encodeURIComponent(title);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "wiki-race/0.1 (team onsite game; contact: local)",
      Accept: "application/json",
    },
    next: { revalidate: 300 },
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
  const { html, links } = sanitize(rawHtml);
  return NextResponse.json({
    title: data.parse.title,
    displayTitle: stripTags(data.parse.displaytitle),
    html,
    links,
  });
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function sanitize(html: string): { html: string; links: string[] } {
  let out = html;

  out = out.replace(/<!--([\s\S]*?)-->/g, "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<img[^>]*>/gi, "");
  out = out.replace(/<figure[\s\S]*?<\/figure>/gi, "");
  out = out.replace(/<table[\s\S]*?<\/table>/gi, "");
  out = out.replace(/<audio[\s\S]*?<\/audio>/gi, "");
  out = out.replace(/<video[\s\S]*?<\/video>/gi, "");
  out = out.replace(/<link[^>]*>/gi, "");
  out = out.replace(/<meta[^>]*>/gi, "");

  out = removeByClass(out, "infobox");
  out = removeByClass(out, "navbox");
  out = removeByClass(out, "sidebar");
  out = removeByClass(out, "hatnote");
  out = removeByClass(out, "thumb");
  out = removeByClass(out, "metadata");
  out = removeByClass(out, "mw-editsection");
  out = removeByClass(out, "reference");
  out = removeByClass(out, "references");
  out = removeByClass(out, "reflist");
  out = removeByClass(out, "noprint");
  out = removeByClass(out, "mw-empty-elt");
  out = removeByClass(out, "toc");

  const links = new Set<string>();
  out = out.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, attrs: string, inner: string) => {
      const hrefMatch = attrs.match(/href\s*=\s*"([^"]+)"/i);
      if (!hrefMatch) return stripInner(inner);
      const href = hrefMatch[1];
      const classMatch = attrs.match(/class\s*=\s*"([^"]+)"/i);
      const cls = classMatch ? classMatch[1] : "";
      if (!href.startsWith("/wiki/")) {
        return stripInner(inner);
      }
      if (
        cls.includes("new") ||
        cls.includes("extiw") ||
        cls.includes("external") ||
        cls.includes("image")
      ) {
        return stripInner(inner);
      }
      const rawTitle = decodeURIComponent(
        href.slice("/wiki/".length).split("#")[0].replace(/_/g, " ")
      );
      if (rawTitle.includes(":")) {
        return stripInner(inner);
      }
      links.add(rawTitle);
      return `<a data-wiki-title="${escapeAttr(
        rawTitle
      )}" class="wiki-link">${inner}</a>`;
    }
  );

  out = `<div class="wiki-article">${out}</div>`;
  return { html: out, links: Array.from(links) };
}

function stripInner(inner: string): string {
  return inner;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function removeByClass(html: string, cls: string): string {
  let result = html;
  const tags = ["div", "table", "span", "aside", "ul"];
  for (const tag of tags) {
    const openPattern = new RegExp(
      `<${tag}\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`,
      "i"
    );
    let safety = 0;
    while (safety++ < 200) {
      const openMatch = openPattern.exec(result);
      if (!openMatch) break;
      const start = openMatch.index;
      const afterOpen = start + openMatch[0].length;
      const closeRe = new RegExp(`<\\/${tag}>`, "gi");
      const openRe = new RegExp(`<${tag}\\b`, "gi");
      closeRe.lastIndex = afterOpen;
      openRe.lastIndex = afterOpen;
      let depth = 1;
      let cursor = afterOpen;
      let end = -1;
      while (depth > 0) {
        closeRe.lastIndex = cursor;
        openRe.lastIndex = cursor;
        const nextClose = closeRe.exec(result);
        const nextOpen = openRe.exec(result);
        if (!nextClose) break;
        if (nextOpen && nextOpen.index < nextClose.index) {
          depth++;
          cursor = nextOpen.index + nextOpen[0].length;
        } else {
          depth--;
          cursor = nextClose.index + nextClose[0].length;
          if (depth === 0) {
            end = cursor;
            break;
          }
        }
      }
      if (end === -1) {
        result = result.slice(0, start) + result.slice(afterOpen);
      } else {
        result = result.slice(0, start) + result.slice(end);
      }
    }
  }
  return result;
}
