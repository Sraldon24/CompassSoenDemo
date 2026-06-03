/**
 * Seed Postgres with parsed Excel data.
 *
 * Reads:
 *   data/seed/courses.json
 *   data/seed/deficiencies.json  (informational, included in courses)
 *
 * Idempotent — uses ON CONFLICT (code) DO UPDATE to refresh existing rows.
 * Embeddings are NOT generated here (that's a Phase 3 step).
 *
 *   npx tsx scripts/seed-courses.ts
 *   npm run db:seed
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/data/db";
import { courses } from "../src/lib/data/schema";

// Env is loaded by scripts/load-env.ts via the `--import` flag in package.json.

interface SeedCourse {
  code: string;
  title: string;
  credits: number;
  category:
    | "eng_core"
    | "se_core"
    | "eng_nsci_group"
    | "nat_sci_elective"
    | "soen_elective"
    | "gen_ed_humanities"
    | "deficiency"
    | null;
  prereqs: { all?: string[]; any?: string[]; concurrent?: string[]; notes?: string };
  unlocks: string[];
  notes: string | null;
}

async function main(): Promise<void> {
  const path = resolve(process.cwd(), "data/seed/courses.json");
  const raw = readFileSync(path, "utf8");
  const seed: SeedCourse[] = JSON.parse(raw);

  console.log(`→ Seeding ${seed.length} courses from ${path}`);

  let upsertCount = 0;
  for (const c of seed) {
    await db
      .insert(courses)
      .values({
        code: c.code,
        title: c.title,
        credits: c.credits,
        category: c.category ?? undefined,
        prereqs: {
          all: c.prereqs.all,
          any: c.prereqs.any,
          concurrent: c.prereqs.concurrent,
          notes: c.prereqs.notes,
        },
        coreqs: c.prereqs.concurrent ?? [],
        // Defaults for offering — refined later by scraper.
        offeredFall: true,
        offeredWinter: true,
        offeredSummer: false,
      })
      .onConflictDoUpdate({
        target: courses.code,
        set: {
          title: c.title,
          credits: c.credits,
          category: c.category ?? undefined,
          prereqs: {
            all: c.prereqs.all,
            any: c.prereqs.any,
            concurrent: c.prereqs.concurrent,
            notes: c.prereqs.notes,
          },
          coreqs: c.prereqs.concurrent ?? [],
          updatedAt: sql`now()`,
        },
      });
    upsertCount += 1;
  }

  console.log(`✓ Upserted ${upsertCount} courses`);

  const [row] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM courses`,
  );
  console.log(`  Total rows in courses table: ${row?.count ?? "?"}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
