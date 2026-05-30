"use client";

/**
 * Professor reviews block on the course detail page.
 *
 * Shows aggregate (avg rating, avg difficulty, would-take-again %) + the list
 * of reviews, with a collapsible form to add one. Reviews default to anonymous;
 * the author can toggle that off. The submit posts to
 * /api/courses/[code]/reviews and optimistically refreshes the list.
 */

import { Button } from "@/components/ui/button";
import type { PublicReview, ReviewSummary } from "@/lib/community/reviews";
import { useState, useTransition } from "react";

interface Props {
  courseCode: string;
  initial: ReviewSummary;
}

export function ProfessorReviews({ courseCode, initial }: Props): React.ReactElement {
  const [summary, setSummary] = useState<ReviewSummary>(initial);
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    const res = await fetch(`/api/courses/${encodeURIComponent(courseCode)}/reviews`);
    if (res.ok) setSummary(await res.json());
  };

  return (
    <div className="space-y-4">
      {summary.count > 0 ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <Stat label="Avg rating" value={fmt(summary.averageRating)} suffix="/5" />
          <Stat label="Avg difficulty" value={fmt(summary.averageDifficulty)} suffix="/5" />
          <Stat
            label="Would take again"
            value={
              summary.wouldTakeAgainPct == null
                ? "—"
                : `${Math.round(summary.wouldTakeAgainPct * 100)}%`
            }
          />
          <Stat label="Reviews" value={String(summary.count)} />
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No reviews yet. Be the first to share your experience.
        </p>
      )}

      <ul className="space-y-3">
        {summary.reviews.map((r) => (
          <ReviewItem key={r.id} review={r} />
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

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}): React.ReactElement {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className="text-lg font-semibold">
        {value}
        {suffix && value !== "—" ? <span className="text-sm font-normal">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ReviewItem({ review }: { review: PublicReview }): React.ReactElement {
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
    <li className="rounded border p-3 space-y-1" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{review.professorName}</span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          ★ {review.rating}/5{review.difficulty ? ` · difficulty ${review.difficulty}/5` : ""}
        </span>
      </div>
      {review.comment && <p className="text-sm leading-relaxed">{review.comment}</p>}
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <span>Anonymous student</span>
        {review.term && <span>· {review.term}</span>}
        {review.wouldTakeAgain != null && (
          <span>· {review.wouldTakeAgain ? "would take again" : "would not retake"}</span>
        )}
        <span>
          · {review.createdAt ? new Date(review.createdAt).toISOString().slice(0, 10) : ""}
        </span>
        <button
          type="button"
          className="ml-auto underline disabled:opacity-50"
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
        const data: { error?: string; detail?: string } = await res.json().catch(() => ({}));
        setError(data.detail ?? data.error ?? `Request failed (${res.status})`);
        return;
      }
      await onDone();
    });
  };

  return (
    <div className="rounded border p-4 space-y-3" style={{ borderColor: "var(--color-border)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm space-y-1">
          <span
            className="block text-xs uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Professor name
          </span>
          <input
            className="w-full rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
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
            className="w-full rounded border px-2 py-1 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
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
          className="w-full rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
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
        />
        Post anonymously
      </label>

      {error && (
        <div className="text-xs" style={{ color: "var(--color-error, #c43d3d)" }}>
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
        {label}: {value}/5
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function fmt(n: number | null): string {
  return n == null ? "—" : n.toFixed(1);
}
