import { db } from "@/lib/data/db";
import { users } from "@/lib/data/schema";
import { count, desc, eq, ne } from "drizzle-orm";
import { UserStatusButtons } from "./buttons";

export const metadata = { title: "Users — Admin" };
export const dynamic = "force-dynamic";

/** Cap the "all users" list so the admin page stays bounded as signups grow.
 * Pending requests (which need action) are always shown in full. */
const RECENT_LIMIT = 100;

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  pending: { color: "var(--color-warning)", bg: "var(--color-warning-soft)" },
  approved: { color: "var(--color-success)", bg: "var(--color-success-soft)" },
  rejected: { color: "var(--color-danger)", bg: "var(--color-danger-soft)" },
};

function fmt(d: Date): string {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Admin → Users: approve / reject invite-only access requests. */
export default async function AdminUsersPage(): Promise<React.ReactElement> {
  const cols = {
    id: users.id,
    email: users.email,
    name: users.name,
    status: users.status,
    role: users.role,
    createdAt: users.createdAt,
  };

  // Status filter pushed to SQL (uses idx_users_status). Pending shown in full;
  // everyone else is capped to the most recent RECENT_LIMIT to bound the query.
  const [pending, others, [otherTotal]] = await Promise.all([
    db.select(cols).from(users).where(eq(users.status, "pending")).orderBy(desc(users.createdAt)),
    db
      .select(cols)
      .from(users)
      .where(ne(users.status, "pending"))
      .orderBy(desc(users.createdAt))
      .limit(RECENT_LIMIT),
    db.select({ n: count() }).from(users).where(ne(users.status, "pending")),
  ]);
  const othersTotalCount = otherTotal?.n ?? others.length;

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto space-y-8 animate-rise">
      <header className="space-y-1">
        <p className="eyebrow">Admin</p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Users</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Compass is invite-only. Approve or reject access requests here.
        </p>
      </header>

      <section className="space-y-3">
        <h2
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          Pending approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            No one is waiting. 🎉
          </div>
        ) : (
          <ul className="space-y-2">
            {pending.map((u) => (
              <UserRow key={u.id} u={u} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          All users{" "}
          {othersTotalCount > others.length
            ? `(showing ${others.length} of ${othersTotalCount})`
            : `(${others.length})`}
        </h2>
        <ul className="space-y-2">
          {others.map((u) => (
            <UserRow key={u.id} u={u} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function UserRow({
  u,
}: {
  u: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    role: string;
    createdAt: Date;
  };
}): React.ReactElement {
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg ring-hairline shadow-[var(--shadow-xs)] p-3 transition-colors hover:bg-[var(--color-surface-2)]"
      style={{ background: "var(--color-surface)" }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{u.name || u.email}</span>
          <span
            className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ring-hairline"
            style={{
              color: STATUS_STYLE[u.status]?.color ?? "var(--color-text-muted)",
              background: STATUS_STYLE[u.status]?.bg ?? "var(--color-surface-2)",
            }}
          >
            {u.status}
          </span>
          {u.role === "admin" && (
            <span
              className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ring-hairline"
              style={{ color: "var(--color-accent)", background: "var(--color-accent-soft)" }}
            >
              admin
            </span>
          )}
        </div>
        <div className="text-xs truncate mono" style={{ color: "var(--color-text-muted)" }}>
          {u.email} · joined {fmt(u.createdAt)}
        </div>
      </div>
      <UserStatusButtons userId={u.id} status={u.status} />
    </li>
  );
}
