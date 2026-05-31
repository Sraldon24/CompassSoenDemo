import { db } from "@/lib/db";
import { checklistItems, deadlines } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { asc, eq } from "drizzle-orm";
import { CalendarClock, Download } from "lucide-react";
import { redirect } from "next/navigation";
import { Checklist } from "./checklist";

export const metadata = {
  title: "Deadlines",
};

export const dynamic = "force-dynamic";

/** Format a deadline date for display (e.g. "Sep 3, 2026"). */
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export default async function DeadlinesPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const [rows, checklist] = await Promise.all([
    db.select().from(deadlines).orderBy(asc(deadlines.date)),
    db
      .select({
        id: checklistItems.id,
        task: checklistItems.task,
        notes: checklistItems.notes,
        completed: checklistItems.completed,
      })
      .from(checklistItems)
      .where(eq(checklistItems.userId, session.user.id))
      .orderBy(asc(checklistItems.createdAt)),
  ]);
  const now = Date.now();
  const upcoming = rows.filter((r) => r.date.getTime() >= now);
  const past = rows.filter((r) => r.date.getTime() < now);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[960px] mx-auto space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Deadlines</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Key academic dates and the start of each term in your plan.
          </p>
        </div>
        <a
          href="/api/export/ics"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/10"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Add my plan to calendar (.ics)
        </a>
      </header>

      <Checklist initial={checklist} />

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && <DeadlineSection title="Upcoming" rows={upcoming} />}
          {past.length > 0 && <DeadlineSection title="Past" rows={past} muted />}
        </div>
      )}
    </div>
  );
}

interface DeadlineRow {
  id: string;
  title: string;
  category: string | null;
  date: Date;
  description: string | null;
  url: string | null;
}

function DeadlineSection({
  title,
  rows,
  muted = false,
}: {
  title: string;
  rows: DeadlineRow[];
  muted?: boolean;
}): React.ReactElement {
  return (
    <section className="space-y-3">
      <h2
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title} ({rows.length})
      </h2>
      <ul className="space-y-2" style={muted ? { opacity: 0.6 } : undefined}>
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-3 rounded-lg border p-3"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <CalendarClock
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: "var(--color-accent)" }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{r.title}</span>
                <span className="mono tnum text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {formatDate(r.date)}
                </span>
              </div>
              {r.description && (
                <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {r.description}
                </p>
              )}
              {r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs underline"
                  style={{ color: "var(--color-accent)" }}
                >
                  Details →
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center"
      style={{ borderColor: "var(--color-border)" }}
    >
      <CalendarClock
        className="h-8 w-8"
        style={{ color: "var(--color-text-muted)" }}
        aria-hidden="true"
      />
      <h2 className="text-sm font-semibold">No deadlines yet</h2>
      <p className="max-w-sm text-xs" style={{ color: "var(--color-text-muted)" }}>
        Concordia key dates will appear here once the academic calendar is published. In the
        meantime, export your plan to your own calendar.
      </p>
      <a
        href="/api/export/ics"
        className="mt-2 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/10"
        style={{ borderColor: "var(--color-border)" }}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export plan (.ics)
      </a>
    </div>
  );
}
