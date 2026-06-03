"use client";

import { Command } from "cmdk";
import { Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SearchHit {
  code: string;
  title: string;
  credits: number;
  category: string | null;
  description: string | null;
  score: number;
}

const PAGE_ITEMS = [
  { id: "/dashboard", label: "Dashboard" },
  { id: "/plan", label: "My Plan" },
  { id: "/map", label: "Prereq Map" },
  { id: "/requirements", label: "Requirements" },
  { id: "/chat", label: "Ask Compass" },
  { id: "/deadlines", label: "Deadlines" },
  { id: "/emails", label: "Email Templates" },
  { id: "/settings", label: "Settings" },
] as const;

export function CommandPalette(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic">("keyword");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⌘K / Ctrl+K trigger.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `/api/search?q=${encodeURIComponent(query)}&mode=${mode}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { results: SearchHit[] };
        setHits(data.results);
      } catch {
        // ignore
      }
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, open]);

  const select = useCallback(
    (value: string) => {
      setOpen(false);
      setQuery("");
      router.push(value);
    },
    [router],
  );

  const filteredPages = useMemo(() => {
    if (query.trim().length === 0) return PAGE_ITEMS;
    const q = query.toLowerCase();
    return PAGE_ITEMS.filter((p) => p.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Global command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
    >
      {/* Backdrop — button so it satisfies a11y rules + supports Esc/Enter natively */}
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(0,0,0,0.4)", border: 0 }}
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-xl rounded-lg border shadow-lg overflow-hidden"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div
          className="flex items-center gap-2 px-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-muted)" }} />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search courses, pages…"
            className="flex-1 py-3 bg-transparent outline-none text-sm"
            style={{ color: "var(--color-text)" }}
          />
          <button
            type="button"
            onClick={() => setMode((m) => (m === "keyword" ? "semantic" : "keyword"))}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors"
            style={{
              borderColor: mode === "semantic" ? "var(--color-accent)" : "var(--color-border)",
              color: mode === "semantic" ? "var(--color-accent)" : "var(--color-text-muted)",
            }}
            title={mode === "semantic" ? "AI semantic search" : "Keyword (exact) search"}
          >
            <Sparkles className="h-3 w-3" />
            {mode === "semantic" ? "Smart" : "Keyword"}
          </button>
        </div>
        <Command.List
          className="max-h-[60vh] overflow-y-auto p-2"
          style={{ color: "var(--color-text)" }}
        >
          <Command.Empty
            className="px-3 py-6 text-sm text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            No results. Try a different query or switch to{" "}
            {mode === "keyword" ? "Smart" : "Keyword"} mode.
          </Command.Empty>

          {filteredPages.length > 0 && (
            <Command.Group heading="Pages">
              {filteredPages.map((p) => (
                <Command.Item
                  key={p.id}
                  value={p.id}
                  onSelect={() => select(p.id)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer aria-selected:bg-accent/10 text-sm"
                >
                  <span>{p.label}</span>
                  <span
                    className="ml-auto text-[10px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Go →
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {hits.length > 0 && (
            <Command.Group heading="Courses">
              {hits.map((c) => (
                <Command.Item
                  key={c.code}
                  value={`course:${c.code}:${c.title}`}
                  onSelect={() => select(`/plan?course=${encodeURIComponent(c.code)}`)}
                  className="flex flex-col items-start gap-0.5 rounded-md px-3 py-2 cursor-pointer aria-selected:bg-accent/10"
                >
                  <div className="flex items-baseline w-full gap-2">
                    <span className="mono tnum text-sm font-semibold">{c.code}</span>
                    <span className="text-sm flex-1 min-w-0 truncate">{c.title}</span>
                    <span
                      className="text-[10px] mono tnum"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {c.credits}cr
                    </span>
                  </div>
                  {c.description && (
                    <p
                      className="text-[11px] line-clamp-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {c.description}
                    </p>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div
          className="border-t px-3 py-2 text-[10px] flex items-center justify-between"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <span>↑↓ navigate · Enter select · Esc close</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </Command.Dialog>
  );
}
