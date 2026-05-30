/**
 * /settings/privacy — controls the public profile (#89) + (later) GDPR
 * export/delete (#94 appends here).
 */

import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { DataControls } from "./data-controls";
import { PrivacyForm } from "./form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Privacy — Settings" };

export default async function PrivacySettingsPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const [profile] = await db
    .select({
      isPublic: profiles.isPublic,
      publicSlug: profiles.publicSlug,
      showFuturePlan: profiles.showFuturePlan,
    })
    .from(profiles)
    .where(eq(profiles.userId, session.user.id));

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-2xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Control your public profile. When public, anyone with the link can see your degree
          progress — no Compass account needed.
        </p>
      </header>

      <PrivacyForm
        initial={{
          isPublic: profile?.isPublic ?? false,
          slug: profile?.publicSlug ?? "",
          showFuturePlan: profile?.showFuturePlan ?? true,
        }}
        suggestedSlug={slugFromName(session.user.name ?? session.user.email)}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your data</h2>
        <DataControls />
      </section>
    </div>
  );
}

function slugFromName(name: string): string {
  return name
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
