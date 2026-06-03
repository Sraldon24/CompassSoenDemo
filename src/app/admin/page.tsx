import { Flag, ListChecks, Users } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Admin" };

const SECTIONS = [
  {
    href: "/admin/users",
    label: "Users",
    desc: "Approve or reject invite-only access requests.",
    Icon: Users,
  },
  {
    href: "/admin/moderation",
    label: "Moderation",
    desc: "Review flagged reviews and comments.",
    Icon: Flag,
  },
  {
    href: "/admin/scraped-changes",
    label: "Scraped changes",
    desc: "Review catalog changes detected by the weekly crawler.",
    Icon: ListChecks,
  },
];

/** Admin landing — links to each admin tool (so /admin isn't a dead 404). */
export default function AdminIndexPage(): React.ReactElement {
  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-2xl mx-auto space-y-6">
      <header className="space-y-1 animate-rise">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Owner tools for Compass.
        </p>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger">
        {SECTIONS.map(({ href, label, desc, Icon }, i) => (
          <li key={href} style={{ ["--i" as string]: i }}>
            <Link
              href={href}
              style={{ background: "var(--gradient-surface)" }}
              className="lift flex h-full flex-col gap-2 rounded-xl border p-5 hover:border-accent/40"
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: "var(--gradient-accent-soft)" }}
              >
                <Icon className="h-4 w-4" style={{ color: "var(--color-accent)" }} aria-hidden />
              </span>
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {desc}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
