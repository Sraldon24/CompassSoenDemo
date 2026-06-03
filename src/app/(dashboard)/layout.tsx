import { CommandPalette } from "@/components/common/command-palette";
import { KeyboardShortcuts } from "@/components/common/keyboard-shortcuts";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { getSession } from "@/lib/auth/get-session";
import { isAdmin } from "@/lib/auth/is-admin";
import { db } from "@/lib/data/db";
import { profiles, users } from "@/lib/data/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: { children: React.ReactNode }): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Access gate (invite-only): non-approved accounts can't reach the app.
  const [account] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (account && account.status !== "approved") {
    redirect("/pending");
  }

  // Onboarding gate: route incomplete users to /onboarding for any /dashboard,
  // /plan, etc. visit. Dev users seeded via scripts/seed-user-plan are pre-marked complete.
  const [profile] = await db
    .select({ done: profiles.onboardingCompleted })
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1);
  if (!profile || !profile.done) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg)" }}>
      <Sidebar isAdmin={isAdmin(session)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar userName={session.user.name ?? null} userEmail={session.user.email} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandPalette />
      <KeyboardShortcuts />
    </div>
  );
}
