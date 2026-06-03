import { getSession } from "@/lib/auth/get-session";
import { db } from "@/lib/data/db";
import { profiles, users } from "@/lib/data/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "./wizard";

export const metadata = {
  title: "Welcome",
};

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  // Access gate: unapproved invite-only accounts can't onboard either.
  const [account] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (account && account.status !== "approved") redirect("/pending");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1);

  if (profile?.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <OnboardingWizard
      initialStep={profile?.onboardingStep ?? 0}
      defaultProgram={profile?.program ?? "SOEN-General"}
      defaultEntryTerm={profile?.entryTerm ?? "Fall 2026"}
      defaultStudentId={profile?.studentId ?? ""}
      userName={session.user.name ?? null}
    />
  );
}
