"use client";

import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";

export function DataControls(): React.ReactElement {
  const [deleting, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const requestDelete = () => {
    startDelete(async () => {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data: { message?: string; error?: string } = await res.json().catch(() => ({}));
      setMessage(res.ok ? (data.message ?? "Deletion scheduled.") : (data.error ?? "Failed."));
      setConfirmDelete(false);
    });
  };

  return (
    <div className="space-y-4 rounded border p-5" style={{ borderColor: "var(--color-border)" }}>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Export your data</h3>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Download everything we store about you — profile, plan, votes, reviews, and AI
          conversations — as a JSON file.
        </p>
        <a href="/api/account/export" download className="inline-block">
          <Button size="sm" variant="outline" type="button">
            Download my data
          </Button>
        </a>
      </div>

      <div className="space-y-1 pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
        <h3 className="text-sm font-medium" style={{ color: "var(--color-error, #c43d3d)" }}>
          Delete account
        </h3>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Schedules permanent deletion after a 30-day grace period. Sign back in during that window
          to cancel.
        </p>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={deleting}
              onClick={requestDelete}
              style={{ background: "var(--color-error, #c43d3d)", color: "white" }}
            >
              {deleting ? "Scheduling…" : "Yes, delete my account"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" type="button" onClick={() => setConfirmDelete(true)}>
            Delete my account
          </Button>
        )}
        {message && (
          <p className="text-xs pt-1" style={{ color: "var(--color-text-muted)" }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
