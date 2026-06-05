/**
 * DEV/SCREENSHOT ONLY — create a real, loginable demo account.
 *
 * Signs up demo@compass.local through Better Auth's server API (so the password
 * is hashed correctly + a credential account row is created), then promotes it
 * to `approved` and marks onboarding complete so it lands straight on the app.
 * Run `npm run seed:user-plan -- --email demo@compass.local` afterwards to give
 * it the sample plan. Not part of the product; used to capture README shots.
 */

import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/data/db";
import { profiles, users } from "@/lib/data/schema";
import { eq } from "drizzle-orm";

const EMAIL = "demo@compass.local";
const PASSWORD = "DemoCompass!2026";
const NAME = "Demo Student";

async function main(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));

  if (existing.length === 0) {
    await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: NAME } });
    console.log(`✓ Signed up ${EMAIL}`);
  } else {
    console.log(`• ${EMAIL} already exists — promoting`);
  }

  // Promote to approved (invite-gate) + ensure onboarding is marked complete.
  await db.update(users).set({ status: "approved" }).where(eq(users.email, EMAIL));

  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  if (u) {
    const prof = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    if (prof.length === 0) {
      await db.insert(profiles).values({
        userId: u.id,
        program: "SOEN-General",
        entryTerm: "Fall 2026",
        onboardingCompleted: true,
        onboardingStep: 3,
      });
    } else {
      await db
        .update(profiles)
        .set({ onboardingCompleted: true, onboardingStep: 3 })
        .where(eq(profiles.userId, u.id));
    }
  }

  console.log(`✓ ${EMAIL} approved + onboarded. Login: ${EMAIL} / ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
