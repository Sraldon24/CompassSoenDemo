/**
 * Seed the user's real plan from data/seed/user-plan-amir.json.
 *
 * Behavior:
 *   - If the caller passes --email <addr>, the script attaches the plan to that
 *     existing user. The user MUST already exist (signed up via /signup).
 *   - Otherwise it creates a deterministic dev-only user `dev@compass.local`
 *     so you can log in as them and immediately see the populated plan.
 *
 *   npx tsx --import ./scripts/load-env.ts scripts/seed-user-plan.ts
 *   npx tsx --import ./scripts/load-env.ts scripts/seed-user-plan.ts --email me@example.com
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { profiles, userCourses, users } from "../src/lib/db/schema";

interface SeedPlanEntry {
  courseCode: string;
  term: string;
  year: number;
  status: "planned" | "enrolled" | "completed" | "transferred" | "dropped" | "disc" | "failed";
  notes: string | null;
}

async function main(): Promise<void> {
  const emailFlag = process.argv.indexOf("--email");
  const email = emailFlag >= 0 ? process.argv[emailFlag + 1] : "dev@compass.local";
  if (!email) {
    console.error("✗ --email value required");
    process.exit(1);
  }

  // Ensure a user row exists (dev only — real users are created by Better Auth).
  // We do NOT touch the accounts/sessions tables here, so this dev user cannot sign in
  // unless they're created via /signup in the browser first.
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let userId: string;
  if (existing.length === 0 && email === "dev@compass.local") {
    userId = `devuser-${Date.now()}`;
    await db.insert(users).values({
      id: userId,
      email,
      emailVerified: true,
      name: "Amir Ghadimi",
      role: "user",
    });
    await db.insert(profiles).values({
      userId,
      program: "SOEN-General",
      entryTerm: "Fall 2026",
      expectedGraduation: "Winter 2030",
      onboardingCompleted: true,
      onboardingStep: 5,
    });
    console.log(`✓ Created dev user ${email} (id: ${userId})`);
  } else if (existing.length === 0) {
    console.error(`✗ User ${email} does not exist. Sign up via /signup first.`);
    process.exit(1);
  } else {
    const firstUser = existing[0];
    if (!firstUser) {
      console.error("✗ User row missing after select");
      process.exit(1);
    }
    userId = firstUser.id;
    console.log(`→ Attaching plan to existing user ${email}`);
  }

  // Wipe existing user_courses for this user so the seed is reproducible.
  await db.delete(userCourses).where(eq(userCourses.userId, userId));

  const path = resolve(process.cwd(), "data/seed/user-plan-amir.json");
  const raw = readFileSync(path, "utf8");
  const entries: SeedPlanEntry[] = JSON.parse(raw);

  let inserted = 0;
  for (const e of entries) {
    await db.insert(userCourses).values({
      userId,
      courseCode: e.courseCode,
      term: e.term,
      year: e.year,
      status: e.status,
      notes: e.notes,
    });
    inserted += 1;
  }

  const [row] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM user_courses WHERE user_id = ${userId}`,
  );
  console.log(`✓ Seeded ${inserted} user_courses rows (DB count: ${row?.count})`);

  process.exit(0);
}

main().catch((err) => {
  console.error("✗ User plan seed failed:", err);
  process.exit(1);
});
