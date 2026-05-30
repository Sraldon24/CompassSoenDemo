/**
 * /admin/scraped-changes — review queue for changes proposed by the weekly
 * Concordia scraper.
 *
 * Each row shows the change type + entity + old/new values + Approve / Reject
 * buttons that call the server actions. Approving mutates the live courses
 * table inside a transaction; rejecting just dismisses the proposal.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { scrapedChanges } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { ApproveRejectButtons } from "./buttons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Scraped Changes — Admin",
};

interface ScrapedChangeRow {
  id: string;
  source: string;
  entityType: string;
  entityId: string;
  changeType: string;
  oldValue: unknown;
  newValue: unknown;
  status: string;
  createdAt: Date;
}

export default async function ScrapedChangesPage(): Promise<React.ReactElement> {
  const pending = await db
    .select()
    .from(scrapedChanges)
    .where(eq(scrapedChanges.status, "pending"))
    .orderBy(desc(scrapedChanges.createdAt));

  const recent = await db
    .select()
    .from(scrapedChanges)
    .orderBy(desc(scrapedChanges.createdAt))
    .limit(20);

  const resolved = recent.filter((r) => r.status !== "pending").slice(0, 10);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[1280px] mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Scraped changes</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Proposed updates from the weekly Concordia calendar scraper. Approve to apply to the live
          catalog, reject to dismiss.
        </p>
      </header>

      <section className="space-y-3">
        <h2
          className="text-sm font-medium uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent
              className="py-8 text-center text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              No pending changes. Run <code className="font-mono">npm run scrape:courses</code> to
              fetch the latest from Concordia.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => (
              <ChangeRow key={row.id} change={row} />
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="space-y-3">
          <h2
            className="text-sm font-medium uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Recently resolved
          </h2>
          <div className="space-y-2">
            {resolved.map((row) => (
              <ResolvedRow key={row.id} change={row} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ChangeRow({ change }: { change: ScrapedChangeRow }): React.ReactElement {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg font-mono">{change.entityId}</CardTitle>
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span className={badgeClass(change.changeType)}>{change.changeType}</span>
            <span>·</span>
            <span>{change.source}</span>
            <span>·</span>
            <time>{change.createdAt.toISOString().slice(0, 10)}</time>
          </div>
        </div>
        <ApproveRejectButtons changeId={change.id} />
      </CardHeader>
      <CardContent className="pt-0 space-y-2 text-sm">
        <ValueDiff label="Old" raw={change.oldValue} />
        <ValueDiff label="New" raw={change.newValue} highlight />
      </CardContent>
    </Card>
  );
}

function ResolvedRow({ change }: { change: ScrapedChangeRow }): React.ReactElement {
  const isApproved = change.status === "approved";
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 rounded border"
      style={{ borderColor: "var(--color-border)" }}
    >
      <span className={statusBadgeClass(change.status)}>{change.status}</span>
      <span className="font-mono text-sm">{change.entityId}</span>
      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {change.changeType}
      </span>
      <span className="text-xs ml-auto" style={{ color: "var(--color-text-muted)" }}>
        {isApproved ? "applied to catalog" : "dismissed"} ·{" "}
        {change.createdAt.toISOString().slice(0, 10)}
      </span>
    </div>
  );
}

function ValueDiff({
  label,
  raw,
  highlight,
}: {
  label: string;
  raw: unknown;
  highlight?: boolean;
}): React.ReactElement {
  const display = formatValue(raw);
  return (
    <div
      className="flex gap-3 px-3 py-2 rounded text-sm font-mono"
      style={{
        background: highlight ? "rgba(34, 197, 94, 0.08)" : "var(--color-surface-muted)",
        color: display === "—" ? "var(--color-text-muted)" : "var(--color-text)",
      }}
    >
      <span
        className="shrink-0 text-xs uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span className="break-words">{display}</span>
    </div>
  );
}

function formatValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  if (typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    const v = (raw as { value: unknown }).value;
    return v === null || v === undefined ? "—" : String(v);
  }
  return String(raw);
}

function badgeClass(kind: string): string {
  const base =
    "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider";
  const palette: Record<string, string> = {
    added: "bg-emerald-100 text-emerald-800",
    removed: "bg-red-100 text-red-800",
    title: "bg-blue-100 text-blue-800",
    credits: "bg-amber-100 text-amber-800",
    prereq: "bg-violet-100 text-violet-800",
    description: "bg-slate-100 text-slate-800",
  };
  return `${base} ${palette[kind] ?? "bg-gray-100 text-gray-800"}`;
}

function statusBadgeClass(status: string): string {
  const base =
    "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider";
  if (status === "approved") return `${base} bg-emerald-100 text-emerald-800`;
  if (status === "rejected") return `${base} bg-gray-200 text-gray-700`;
  return `${base} bg-amber-100 text-amber-800`;
}
