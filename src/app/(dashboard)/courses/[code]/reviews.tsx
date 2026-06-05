"use client";

/**
 * Professor reviews block on the course detail page.
 *
 * Shows aggregate (avg rating, avg difficulty, would-take-again %) + the list
 * of reviews, with a collapsible form to add one. Reviews default to anonymous;
 * the author can toggle that off. The submit posts to
 * /api/courses/[code]/reviews and optimistically refreshes the list.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicReview, ReviewSummary } from "@/lib/community/reviews";
import { useState, useTransition } from "react";

interface Props {
  courseCode: string;
  initial: ReviewSummary;
}

/** Meridian star rating — partial-fill via a clipped overlay (ported from the design source). */
function Stars({ value, size = 15 }: { value: number; size?: number }): React.ReactElement {
  return (
    <span className="inline-flex" style={{ gap: 2, color: "var(--warn)" }} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i)) * 100;
        return (
          <span key={i} className="relative inline-flex" style={{ lineHeight: 1 }}>
            <span style={{ fontSize: size, color: "var(--line-strong)" }}>★</span>
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fill}%`, color: "var(--warn)" }}
            >
              <span style={{ fontSize: size, color: "var(--warn)" }}>★</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ProfessorReviews({ courseCode, initial }: Props): React.ReactElement {
  const [summary, setSummary] = useState<ReviewSummary>(initial);
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    const res = await fetch(`/api/courses/${encodeURIComponent(courseCode)}/reviews`);
    if (res.ok) {
      const data: { payload: ReviewSummary } = await res.json();
      setSummary(data.payload);
    }
  };

  return (
    <div className="space-y-4">
      {summary.count > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MetricStat
            label="Avg rating"
            value={fmt(summary.averageRating)}
            sub="out of 5"
            color="var(--warn)"
          />
          <MetricStat
            label="Avg difficulty"
            value={fmt(summary.averageDifficulty)}
            sub="out of 5"
            color="var(--bad)"
          />
          <MetricStat
            label="Would take again"
            value={
              summary.wouldTakeAgainPct == null
                ? "—"
                : `${Math.round(summary.wouldTakeAgainPct * 100)}%`
            }
            color="var(--ok)"
          />
          <MetricStat label="Reviews" value={String(summary.count)} />
        </div>
      ) : (
        <div
          className="flex flex-col items-center gap-3 rounded-[var(--r-md)] border-[1.5px] border-dashed px-6 py-10 text-center"
          style={{ borderColor: "var(--line-strong)", background: "var(--surface-2)" }}
        >
          <span
            className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--r-md)] border-[1.5px]"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent-deep)",
              borderColor: "var(--line)",
            }}
            aria-hidden
          >
            ★
          </span>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>
            No reviews yet. Be the first to share your experience.
          </p>
        </div>
      )}

      <ul className="space-y-2.5 stagger">
        {summary.reviews.map((r, i) => (
          <ReviewItem key={r.id} review={r} index={i} />
        ))}
      </ul>

      {showForm ? (
        <ReviewForm
          courseCode={courseCode}
          onDone={async () => {
            setShowForm(false);
            await refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
          Write a review
        </Button>
      )}
    </div>
  );
}

function MetricStat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}): React.ReactElement {
  return (
    <div
      className="rounded-[var(--r-md)] border-[1.5px] px-2 py-3 text-center"
      style={{ background: "var(--surface-2)", borderColor: "var(--line)" }}
    >
      <div
        className="mono tnum text-[22px] font-bold leading-none"
        style={{ color: color ?? "var(--ink)" }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </div>
      {sub && value !== "—" ? (
        <div className="text-[10.5px]" style={{ color: "var(--ink-3)" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function ReviewItem({
  review,
  index,
}: { review: PublicReview; index: number }): React.ReactElement {
  const [flagged, setFlagged] = useState(false);
  const [flagging, setFlagging] = useState(false);

  const flag = async () => {
    const reason = window.prompt("Why are you flagging this review? (min 3 chars)");
    if (!reason || reason.trim().length < 3) return;
    setFlagging(true);
    const res = await fetch("/api/moderation/flag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "professor_review",
        entityId: review.id,
        reason: reason.trim(),
      }),
    });
    setFlagging(false);
    if (res.ok) setFlagged(true);
    else alert("Could not submit flag. Please try again.");
  };

  return (
    <li
      className="card space-y-2 p-3.5 transition-shadow hover:shadow-[var(--hard-shadow)]"
      style={{ ["--i" as string]: index, background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
          {review.professorName}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Stars value={review.rating} size={14} />
          <span className="mono tnum text-[12.5px] font-bold" style={{ color: "var(--ink)" }}>
            {review.rating}
          </span>
        </span>
      </div>
      {review.comment && (
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {review.comment}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {review.difficulty ? (
          <Badge variant="destructive">
            Difficulty <span className="mono tnum">{review.difficulty}</span>
          </Badge>
        ) : null}
        {review.wouldTakeAgain != null && (
          <Badge variant={review.wouldTakeAgain ? "success" : "secondary"}>
            {review.wouldTakeAgain ? "would take again" : "would not retake"}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-3)" }}>
        <span>Anonymous student</span>
        {review.term && <span>· {review.term}</span>}
        <span className="mono tnum">
          · {review.createdAt ? new Date(review.createdAt).toISOString().slice(0, 10) : ""}
        </span>
        <button
          type="button"
          className="ml-auto rounded-md px-2 py-0.5 transition-colors hover:text-[var(--bad)] disabled:opacity-50"
          disabled={flagged || flagging}
          onClick={flag}
        >
          {flagged ? "flagged" : flagging ? "flagging…" : "flag"}
        </button>
      </div>
    </li>
  );
}

function ReviewForm({
  courseCode,
  onDone,
  onCancel,
}: {
  courseCode: string;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  const [professorName, setProfessorName] = useState("");
  const [rating, setRating] = useState(4);
  const [difficulty, setDifficulty] = useState(3);
  const [term, setTerm] = useState("");
  const [wouldTakeAgain, setWouldTakeAgain] = useState(true);
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    if (comment.trim().length < 30) {
      setError("Comment must be at least 30 characters.");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/courses/${encodeURIComponent(courseCode)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professorName: professorName.trim(),
          rating,
          difficulty,
          term: term.trim() || null,
          wouldTakeAgain,
          comment: comment.trim(),
          isAnonymous,
        }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      await onDone();
    });
  };

  return (
    <div
      className="rounded-xl p-4 space-y-3 ring-hairline shadow-[var(--shadow-sm)] animate-rise"
      style={{ background: "var(--color-surface-2)" }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm space-y-1">
          <span
            className="block text-xs uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Professor name
          </span>
          <input
            className="w-full rounded-lg px-2.5 py-1.5 text-sm ring-hairline transition-shadow focus:shadow-[0_0_0_3px_var(--color-accent-ring)]"
            style={{ background: "var(--color-surface)" }}
            value={professorName}
            onChange={(e) => setProfessorName(e.target.value)}
            placeholder="e.g. Leila Kosseim"
          />
        </label>
        <label className="text-sm space-y-1">
          <span
            className="block text-xs uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Term (optional)
          </span>
          <input
            className="w-full rounded-lg px-2.5 py-1.5 text-sm ring-hairline transition-shadow focus:shadow-[0_0_0_3px_var(--color-accent-ring)]"
            style={{ background: "var(--color-surface)" }}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="e.g. Fall 2025"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <RangeField label="Rating" value={rating} onChange={setRating} />
        <RangeField label="Difficulty" value={difficulty} onChange={setDifficulty} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={wouldTakeAgain}
          onChange={(e) => setWouldTakeAgain(e.target.checked)}
          style={{ accentColor: "var(--color-accent)" }}
        />
        Would take this professor again
      </label>

      <label className="text-sm space-y-1 block">
        <span
          className="block text-xs uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          Comment (min 30 chars)
        </span>
        <textarea
          className="w-full rounded-lg px-2.5 py-1.5 text-sm ring-hairline transition-shadow focus:shadow-[0_0_0_3px_var(--color-accent-ring)]"
          style={{ background: "var(--color-surface)" }}
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="How were the lectures, assignments, exams?"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          style={{ accentColor: "var(--color-accent)" }}
        />
        Post anonymously
      </label>

      {error && (
        <div className="text-xs" style={{ color: "var(--color-danger)" }}>
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !professorName.trim()} onClick={submit}>
          {pending ? "Posting…" : "Post review"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}): React.ReactElement {
  return (
    <label className="text-sm space-y-1">
      <span
        className="block text-xs uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}: <span className="mono tnum">{value}/5</span>
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--color-accent)" }}
      />
    </label>
  );
}

function fmt(n: number | null): string {
  return n == null ? "—" : n.toFixed(1);
}
