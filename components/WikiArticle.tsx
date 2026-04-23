"use client";

import { useEffect, useRef, useState } from "react";

interface WikiResponse {
  title: string;
  displayTitle: string;
  html: string;
  links: string[];
}

interface Props {
  title: string;
  onLinkClick: (nextTitle: string) => void;
  onResolved?: (resolvedTitle: string) => void;
}

export function WikiArticle({ title, onLinkClick, onResolved }: Props) {
  const [data, setData] = useState<WikiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/wiki?title=${encodeURIComponent(title)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        return (await r.json()) as WikiResponse;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
        if (onResolved && d.title && d.title !== title) {
          onResolved(d.title);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e.message || e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [title, onResolved]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data) return;
    container.scrollTop = 0;
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(
        "a[data-wiki-title]"
      ) as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      const next = target.getAttribute("data-wiki-title");
      if (next) onLinkClick(next);
    };
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [data, onLinkClick]);

  if (loading) {
    return (
      <div className="p-8 text-white/50 text-sm">Loading {title}…</div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-pop text-sm">
        Could not load {title}: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 md:px-10 py-6"
    >
      <h1
        className="text-3xl md:text-4xl font-black mb-4"
        dangerouslySetInnerHTML={{ __html: data.displayTitle }}
      />
      <div dangerouslySetInnerHTML={{ __html: data.html }} />
    </div>
  );
}
