"use client";

// Local mirror of the route's response type — avoids importing a server route
// (with its server-only deps) into the client bundle.
interface ReviewSuggestion {
  kind: "workload" | "sequencing" | "elective";
  title: string;
  detail?: string;
}
import { CalendarClock, GraduationCap, RefreshCw, Sparkles, Workflow } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const KIND_META: Record<ReviewSuggestion["kind"], { label: string; Icon: typeof Workflow }> = {
  workload: { label: "Workload", Icon: CalendarClock },
  sequencing: { label: "Sequencing", Icon: Workflow },
  elective: { label: "Elective", Icon: GraduationCap },
};

/**
 * "AI Review" — proactive, LLM-generated suggestions for the user's plan.
 * Runs once per page load (on mount) and on the Refresh button. Quality-first
 * model (70B → Gemini fallback) via /api/ai/review.
 */
export function AIReview(): React.ReactElement {
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guard against double-fetch in React StrictMode dev double-mount.
  const fetchedRef = useRef(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = refresh ? "/api/ai/review?refresh=1" : "/api/ai/review";
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `AI Review failed (${res.status})`);
      }
      const data = (await res.json()) as { payload: { suggestions: ReviewSuggestion[] } };
      setSuggestions(data.payload?.suggestions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI Review unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void load();
  }, [load]);

  return (
    <section
      className="animate-rise relative overflow-hidden rounded-2xl ring-hairline p-5"
      style={{
        background: "var(--gradient-surface)",
        boxShadow: "var(--shadow-glow)",
      }}
      aria-label="AI Review"
    >
      <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
      <header className="relative flex items-center justify-between gap-2 pb-4">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-white shadow-[0_0_14px_var(--color-accent-ring)]"
            style={{ backgroundImage: "var(--gradient-accent)" }}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          AI Review
        </h2>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          aria-label="Refresh AI Review"
          className="pressable inline-flex items-center gap-1.5 rounded-lg ring-hairline px-2.5 py-1 text-xs transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50 focus-visible:outline-none"
          style={{ background: "var(--color-surface)", color: "var(--color-text-muted)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </header>

      {loading ? (
        <div
          className="relative flex items-center gap-2 text-sm"
          style={{ color: "var(--color-text-muted)" }}
          aria-live="polite"
        >
          <span className="flex gap-1" aria-hidden>
            <span
              className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.3s]"
              style={{ background: "var(--color-accent)" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.15s]"
              style={{ background: "var(--color-accent)" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full animate-bounce"
              style={{ background: "var(--color-accent)" }}
            />
          </span>
          Reviewing your plan…
        </div>
      ) : error ? (
        <p className="relative text-sm" style={{ color: "var(--color-text-muted)" }}>
          {error}{" "}
          <button type="button" onClick={() => load(true)} className="underline">
            Try again
          </button>
        </p>
      ) : suggestions && suggestions.length > 0 ? (
        <ul className="relative space-y-2 stagger">
          {suggestions.map((s, i) => {
            const meta = KIND_META[s.kind];
            const Icon = meta.Icon;
            return (
              <li
                key={`${s.kind}-${i}`}
                style={{ ["--i" as string]: i, background: "var(--color-surface)" }}
                className="lift flex items-start gap-3 rounded-xl ring-hairline shadow-[var(--shadow-sm)] p-3 hover:shadow-[var(--shadow-glow)]"
              >
                <span
                  className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ring-hairline"
                  style={{
                    background: "var(--gradient-accent-soft)",
                    color: "var(--color-accent)",
                  }}
                  title={meta.label}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.title}</p>
                  {s.detail && (
                    <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {s.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="relative text-sm" style={{ color: "var(--color-text-muted)" }}>
          No suggestions right now — your plan looks solid. 🎉
        </p>
      )}
    </section>
  );
}
