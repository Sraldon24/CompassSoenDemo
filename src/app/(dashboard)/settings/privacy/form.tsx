"use client";

import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";
import { updatePrivacy } from "./actions";

interface Props {
  initial: { isPublic: boolean; slug: string; showFuturePlan: boolean };
  suggestedSlug: string;
}

export function PrivacyForm({ initial, suggestedSlug }: Props): React.ReactElement {
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [slug, setSlug] = useState(initial.slug || suggestedSlug);
  const [showFuturePlan, setShowFuturePlan] = useState(initial.showFuturePlan);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await updatePrivacy({ isPublic, slug, showFuturePlan });
      if (res.ok) {
        if (res.slug) setSlug(res.slug);
        setMessage({ kind: "ok", text: "Saved." });
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  };

  const profileUrl = slug ? `/u/${slug}` : null;

  return (
    <div className="space-y-5 rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        Make my profile public
      </label>

      <div className="space-y-1">
        <label
          className="block text-xs uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          Profile URL
        </label>
        <div className="flex items-center gap-1 text-sm">
          <span style={{ color: "var(--color-text-muted)" }}>/u/</span>
          <input
            className="flex-1 rounded border px-2 py-1"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="your-handle"
            disabled={!isPublic}
          />
        </div>
        {isPublic && profileUrl && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
          >
            Preview {profileUrl}
          </a>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showFuturePlan}
          onChange={(e) => setShowFuturePlan(e.target.checked)}
          disabled={!isPublic}
        />
        Show my planned (future) courses, not just completed ones
      </label>

      {message && (
        <div
          className="text-xs"
          style={{
            color:
              message.kind === "ok"
                ? "var(--color-accent, #2f7d5b)"
                : "var(--color-error, #c43d3d)",
          }}
        >
          {message.text}
        </div>
      )}

      <Button size="sm" disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
