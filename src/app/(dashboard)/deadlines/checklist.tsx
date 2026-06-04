"use client";

import { ListChecks, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addChecklistItem, removeChecklistItem, toggleChecklistItem } from "./actions";

export interface ChecklistRow {
  id: string;
  task: string;
  notes: string | null;
  completed: boolean;
}

/**
 * Interactive checklist for /deadlines. Shows imported + manually-added
 * milestones (e.g. the English Writing Test), with add / toggle / remove.
 * Optimistic updates reconciled by the server actions' revalidatePath.
 */
export function Checklist({ initial }: { initial: ChecklistRow[] }): React.ReactElement {
  const [items, setItems] = useState<ChecklistRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [task, setTask] = useState("");
  const [notes, setNotes] = useState("");
  const [, startTransition] = useTransition();

  const add = () => {
    const t = task.trim();
    if (!t) return;
    const tempId = `temp-${t}`;
    setItems((xs) => [
      ...xs,
      { id: tempId, task: t, notes: notes.trim() || null, completed: false },
    ]);
    setTask("");
    setNotes("");
    setAdding(false);
    startTransition(async () => {
      const r = await addChecklistItem({ task: t, notes: notes.trim() || undefined });
      if (!r.success) {
        setItems((xs) => xs.filter((i) => i.id !== tempId));
        toast.error(r.error);
      } else {
        setItems((xs) => xs.map((i) => (i.id === tempId ? { ...i, id: r.data.id } : i)));
        toast.success("Added to your checklist");
      }
    });
  };

  const toggle = (id: string, completed: boolean) => {
    const prev = items;
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, completed } : i)));
    startTransition(async () => {
      const r = await toggleChecklistItem({ id, completed });
      if (!r.success) {
        setItems(prev);
        toast.error(r.error);
      }
    });
  };

  const remove = (id: string) => {
    const prev = items;
    setItems((xs) => xs.filter((i) => i.id !== id));
    startTransition(async () => {
      const r = await removeChecklistItem({ id });
      if (!r.success) {
        setItems(prev);
        toast.error(r.error);
      } else {
        toast.success("Removed");
      }
    });
  };

  return (
    <section className="space-y-3 animate-rise">
      <h2
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg ring-hairline"
          style={{ background: "var(--gradient-accent-soft)" }}
        >
          <ListChecks
            className="h-3.5 w-3.5"
            style={{ color: "var(--color-accent)" }}
            aria-hidden="true"
          />
        </span>
        Your checklist ({items.length})
      </h2>

      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.id}
            className="group flex items-start gap-3 rounded-lg ring-hairline shadow-[var(--shadow-xs)] p-3 transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ background: "var(--color-surface)" }}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={c.completed}
              aria-label={c.completed ? `Mark "${c.task}" not done` : `Mark "${c.task}" done`}
              onClick={() => toggle(c.id, !c.completed)}
              className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border transition-all focus-visible:outline-none focus-visible:ring-2"
              style={{
                borderColor: c.completed ? "transparent" : "var(--color-border-strong)",
                background: c.completed ? "var(--gradient-accent)" : "transparent",
                boxShadow: c.completed ? "0 0 12px var(--color-accent-ring)" : undefined,
              }}
            />
            <div className="min-w-0 flex-1">
              <span
                className="text-sm font-medium"
                style={c.completed ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
              >
                {c.task}
              </span>
              {c.notes && (
                <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {c.notes}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove "${c.task}"`}
              title="Remove"
              onClick={() => remove(c.id)}
              className="hidden h-5 w-5 items-center justify-center rounded text-xs transition-colors group-hover:flex hover:bg-danger/15 focus-visible:flex focus-visible:outline-none"
              style={{ color: "var(--color-text-muted)" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div
          className="space-y-2 rounded-xl ring-hairline shadow-[var(--shadow-sm)] p-3"
          style={{ background: "var(--gradient-surface)" }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: field in a form the user just opened
            autoFocus
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="e.g. Pass the English Writing Test (EWT)"
            maxLength={200}
            className="w-full rounded-lg ring-hairline px-2.5 py-1.5 text-sm transition-shadow focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-accent-ring)]"
            style={{ background: "var(--color-surface-2)" }}
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Notes (optional)"
            maxLength={500}
            className="w-full rounded-lg ring-hairline px-2.5 py-1.5 text-sm transition-shadow focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-accent-ring)]"
            style={{ background: "var(--color-surface-2)" }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={!task.trim()}
              className="pressable rounded-lg px-3.5 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-sm)] disabled:opacity-50"
              style={{ background: "var(--gradient-accent)" }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="pressable rounded-lg ring-hairline px-3.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
              style={{ background: "var(--color-surface)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add EWT / milestone
        </button>
      )}
    </section>
  );
}
