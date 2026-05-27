import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "./wizard";

export const metadata = {
  title: "Welcome",
};

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

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
