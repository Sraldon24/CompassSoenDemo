"use client";

import { Button } from "@/components/ui/button";
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
      const data: { summary: DifficultySummary; yourVote: Vote } = await res.json();
      setSummary(data.summary);
      setYourVote(data.yourVote);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((vote) => {
          const isMine = yourVote === vote;
          return (
            <Button
              key={vote}
              size="sm"
              variant={isMine ? "default" : "outline"}
              disabled={pending}
              onClick={() => submit(vote)}
              aria-pressed={isMine}
              className="capitalize"
            >
              {vote}
            </Button>
          );
        })}
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {summary.count === 0
          ? "Be the first to rate."
          : `${summary.count} vote${summary.count === 1 ? "" : "s"} · class avg ${describeAverage(summary)}`}
        {yourVote && summary.count > 0 ? " · you voted " : ""}
        {yourVote && summary.count > 0 ? (
          <span className="font-medium capitalize">{yourVote}</span>
        ) : null}
      </div>
      {error && (
        <div className="text-xs" style={{ color: "var(--color-error, #c43d3d)" }}>
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
