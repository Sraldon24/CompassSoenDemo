import { CommandPalette } from "@/components/command-palette";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: { children: React.ReactNode }): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
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
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar userName={session.user.name ?? null} userEmail={session.user.email} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
