/**
 * Seed additional Concordia BEng SOEN catalog courses that aren't in the user's Excel.
 *
 * Sources:
 *   - Concordia 2025-26 undergraduate calendar §71.70.10 (course descriptions)
 *   - r/Concordia community references for popular SOEN/COMP electives
 *
 * Idempotent — uses ON CONFLICT DO UPDATE so re-runs refresh prereqs but
 * never duplicate.
 *
 *   npx tsx --import ./scripts/load-env.ts scripts/seed-supplementary.ts
 *   npm run seed:catalog
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/data/db";
import { courses } from "../src/lib/data/schema";

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
  const path = resolve(process.cwd(), "data/seed/courses-supplementary.json");
  const seed: SeedCourse[] = JSON.parse(readFileSync(path, "utf8"));
  console.log(`→ Seeding ${seed.length} supplementary courses from ${path}`);

  // Deduplicate by code in case the JSON has accidental duplicates.
  const dedup = new Map<string, SeedCourse>();
  for (const c of seed) {
    dedup.set(c.code, c);
  }
  const unique = [...dedup.values()];

  let upserts = 0;
  let inserts = 0;
  for (const c of unique) {
    const [row] = await db.execute<{ existed: boolean }>(
      sql`SELECT EXISTS(SELECT 1 FROM courses WHERE code = ${c.code}) AS existed`,
    );
    const existed = !!row?.existed;
    await db
      .insert(courses)
      .values({
        code: c.code,
        title: c.title,
        credits: c.credits,
        category: c.category ?? undefined,
        prereqs: {
          all: c.prereqs.all ?? [],
          any: c.prereqs.any ?? [],
          concurrent: c.prereqs.concurrent ?? [],
          notes: c.prereqs.notes,
        },
        coreqs: c.prereqs.concurrent ?? [],
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
            all: c.prereqs.all ?? [],
            any: c.prereqs.any ?? [],
            concurrent: c.prereqs.concurrent ?? [],
            notes: c.prereqs.notes,
          },
          coreqs: c.prereqs.concurrent ?? [],
          updatedAt: sql`now()`,
        },
      });
    upserts += 1;
    if (!existed) inserts += 1;
  }

  const [count] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM courses`,
  );
  console.log(`✓ Processed ${upserts} (${inserts} new). Catalog total: ${count?.count}`);

  // Suggest re-running embeddings if we added new rows.
  if (inserts > 0) {
    console.log("  → Run: npm run db:embed");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
