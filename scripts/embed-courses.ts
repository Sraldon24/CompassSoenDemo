/**
 * Generate course embeddings using the local sentence-transformers pipeline.
 *
 * For each course in the `courses` table, build an embedding text
 *   "${code} — ${title}. ${description}"
 * and upsert into `course_embeddings`.
 *
 * Idempotent — re-runs only embed courses whose embedding_text changed.
 *
 *   npx tsx --import ./scripts/load-env.ts scripts/embed-courses.ts
 *   npm run db:embed
 */

import { sql } from "drizzle-orm";
import { embed, embedBatch } from "../src/lib/ai/embeddings";
import { db } from "../src/lib/data/db";
import { courseEmbeddings, courses } from "../src/lib/data/schema";

const BATCH_SIZE = 16;

function makeEmbeddingText(c: {
  code: string;
  title: string;
  description: string | null;
  category: string | null;
}): string {
  const parts = [`${c.code} — ${c.title}`];
  if (c.category) parts.push(`Category: ${c.category}`);
  if (c.description) parts.push(c.description);
  return parts.join(". ");
}

async function main(): Promise<void> {
  console.log("→ Loading courses from DB");
  const allCourses = await db
    .select({
      code: courses.code,
      title: courses.title,
      description: courses.description,
      category: courses.category,
    })
    .from(courses);

  console.log(`  ${allCourses.length} courses found`);

  // Pre-load existing embedding texts to skip unchanged rows.
  const existingRows = await db
    .select({ code: courseEmbeddings.courseCode, text: courseEmbeddings.embeddingText })
    .from(courseEmbeddings);
  const existing = new Map(existingRows.map((r) => [r.code, r.text ?? ""]));

  const toEmbed: { code: string; text: string }[] = [];
  for (const c of allCourses) {
    const text = makeEmbeddingText(c);
    if (existing.get(c.code) !== text) {
      toEmbed.push({ code: c.code, text });
    }
  }

  if (toEmbed.length === 0) {
    console.log("✓ All embeddings up to date — nothing to do.");
    process.exit(0);
  }

  console.log("→ Warming embedding pipeline (first call ~500ms cold start)");
  await embed("warmup");

  console.log(`→ Embedding ${toEmbed.length} courses in batches of ${BATCH_SIZE}`);
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch.map((b) => b.text));

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const vec = vectors[j];
      if (!row || !vec) continue;
      await db
        .insert(courseEmbeddings)
        .values({
          courseCode: row.code,
          embedding: vec,
          embeddingText: row.text,
        })
        .onConflictDoUpdate({
          target: courseEmbeddings.courseCode,
          set: {
            embedding: vec,
            embeddingText: row.text,
            updatedAt: new Date(),
          },
        });
    }
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, toEmbed.length)} / ${toEmbed.length}\r`);
  }

  const [{ count = 0 } = { count: 0 }] = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM course_embeddings`,
  );
  console.log(`\n✓ Done. course_embeddings total: ${count}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Embedding generation failed:", err);
  process.exit(1);
});
