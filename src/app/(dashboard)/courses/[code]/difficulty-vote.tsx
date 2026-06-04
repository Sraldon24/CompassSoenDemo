"use client";

import type { DifficultySummary, DifficultyVote as Vote } from "@/lib/community/difficulty";
import { useState, useTransition } from "react";

interface Props {
  courseCode: string;
  initialSummary: DifficultySummary;
  initialUserVote: Vote | null;
}

const OPTIONS: Vote[] = ["easy", "medium", "hard"];

export function DifficultyVote({
  courseCode,
  initialSummary,
  initialUserVote,
}: Props): React.ReactElement {
  const [summary, setSummary] = useState(initialSummary);
  const [yourVote, setYourVote] = useState<Vote | null>(initialUserVote);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (vote: Vote) => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/courses/${encodeURIComponent(courseCode)}/difficulty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      const data: { payload: { summary: DifficultySummary; yourVote: Vote } } = await res.json();
      setSummary(data.payload.summary);
      setYourVote(data.payload.yourVote);
    });
  };

  return (
    <div className="space-y-3">
      <div
        className="inline-flex flex-wrap items-center gap-1 rounded-xl p-1 ring-hairline"
        style={{ background: "var(--color-surface-2)" }}
      >
        {OPTIONS.map((vote) => {
          const isMine = yourVote === vote;
          return (
            <button
              key={vote}
              type="button"
              disabled={pending}
              onClick={() => submit(vote)}
              aria-pressed={isMine}
              className="pressable rounded-lg px-3.5 py-1.5 text-sm font-medium capitalize transition-all disabled:opacity-60"
              style={
                isMine
                  ? {
                      backgroundImage: "var(--gradient-accent)",
                      color: "#fff",
                      boxShadow: "0 0 14px var(--color-accent-ring)",
                    }
                  : { color: "var(--color-text-muted)" }
              }
            >
              {vote}
            </button>
          );
        })}
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {summary.count === 0 ? (
          "Be the first to rate."
        ) : (
          <>
            <span className="mono tnum">{summary.count}</span> vote
            {summary.count === 1 ? "" : "s"} · class avg{" "}
            <span style={{ color: "var(--color-accent)" }}>{describeAverage(summary)}</span>
          </>
        )}
        {yourVote && summary.count > 0 ? " · you voted " : ""}
        {yourVote && summary.count > 0 ? (
          <span className="font-medium capitalize" style={{ color: "var(--color-text)" }}>
            {yourVote}
          </span>
        ) : null}
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function describeAverage(s: DifficultySummary): string {
  if (s.avg === null || s.bucket === null) return "—";
  return `${s.bucket} (${s.avg.toFixed(2)})`;
}
