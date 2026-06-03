import { db } from "@/lib/data/db";
import { users } from "@/lib/data/schema";
import { asc, desc } from "drizzle-orm";
import { UserStatusButtons } from "./buttons";

export const metadata = { title: "Users — Admin" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  pending: "var(--color-warning)",
  approved: "var(--color-success)",
  rejected: "var(--color-danger)",
};

function fmt(d: Date): string {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Admin → Users: approve / reject invite-only access requests. */
export default async function AdminUsersPage(): Promise<React.ReactElement> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      status: users.status,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    // Pending first (need action), then most-recent.
    .orderBy(asc(users.status), desc(users.createdAt));

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Users</h1>
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
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No one is waiting. 🎉
          </p>
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
          All users ({others.length})
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
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{u.name || u.email}</span>
          <span
            className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5"
            style={{ color: STATUS_STYLE[u.status] ?? "var(--color-text-muted)" }}
          >
            {u.status}
          </span>
          {u.role === "admin" && (
            <span
              className="text-[10px] uppercase tracking-wide"
              style={{ color: "var(--color-accent)" }}
            >
              admin
            </span>
          )}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
          {u.email} · joined {fmt(u.createdAt)}
        </div>
      </div>
      <UserStatusButtons userId={u.id} status={u.status} />
    </li>
  );
}
