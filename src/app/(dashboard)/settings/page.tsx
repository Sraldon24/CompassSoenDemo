/**
 * /settings — the settings hub. Links to each settings sub-page. The sidebar
 * footer links here, so this must exist (previously 404'd).
 */

import { getSession } from "@/lib/auth/get-session";
import { FileSpreadsheet, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/settings/import",
    title: "Import plan from Excel",
    description: "Upload a .xlsx term plan to replace your current courses.",
    icon: FileSpreadsheet,
  },
  {
    href: "/settings/privacy",
    title: "Privacy & data",
    description: "Public profile, GDPR data export, and account deletion.",
    icon: ShieldCheck,
  },
] as const;

export default async function SettingsPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-[960px] mx-auto space-y-8">
      <header
        className="relative overflow-hidden rounded-2xl ring-hairline shadow-[var(--shadow-md)] p-6 sm:p-8 animate-rise"
        style={{ background: "var(--gradient-surface)" }}
      >
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div className="relative space-y-2">
          <p className="eyebrow">Settings</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Settings</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Signed in as <span className="mono">{session.user.email}</span>.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 stagger">
        {SECTIONS.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              style={{ ["--i" as string]: i, background: "var(--gradient-surface)" }}
              className="lift group flex flex-col gap-3 rounded-xl ring-hairline shadow-[var(--shadow-sm)] p-5 transition-shadow hover:shadow-[var(--shadow-glow)]"
            >
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl ring-hairline"
                style={{ background: "var(--gradient-accent-soft)" }}
              >
                <Icon
                  className="h-5 w-5"
                  style={{ color: "var(--color-accent)" }}
                  aria-hidden="true"
                />
              </span>
              <span className="text-sm font-semibold tracking-[-0.01em]">{s.title}</span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {s.description}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
