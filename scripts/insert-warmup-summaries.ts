/**
 * insert-warmup-summaries.ts
 *
 * One-time warmup helper: inserts hand-authored (offline-generated) Reddit
 * summaries for the initial production seed, so prod never spends Groq budget
 * re-summarizing the back-catalog. Reads a JSON array of summaries from the
 * path in argv[2] and upserts into reddit_summaries with model='cached'.
 *
 * The summaries are produced offline (not via a live Groq call), so 'cached'
 * is the honest model label. Runtime summarization still uses Groq as normal.
 *
 *   npm run tsx scripts/insert-warmup-summaries.ts /tmp/warmup/batch1.json
 */

import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { redditPosts, redditSummaries } from "../src/lib/db/schema";

type Sentiment = "positive" | "mixed" | "negative" | "insufficient_data";
type Difficulty = "easy" | "medium" | "hard" | "unknown";

interface SummaryInput {
  courseCode: string;
  sentiment: Sentiment;
  commonComplaints: string[];
  commonPraise: string[];
  profMentions: { name: string; count: number; sentiment: string }[];
  difficultyEstimate: Difficulty;
  citations: { permalink: string; quote: string }[];
}

const SENTIMENTS: Sentiment[] = ["positive", "mixed", "negative", "insufficient_data"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "unknown"];

function validate(s: SummaryInput): void {
  if (!s.courseCode) throw new Error("missing courseCode");
  if (!SENTIMENTS.includes(s.sentiment)) throw new Error(`${s.courseCode}: bad sentiment ${s.sentiment}`);
  if (!DIFFICULTIES.includes(s.difficultyEstimate))
    throw new Error(`${s.courseCode}: bad difficulty ${s.difficultyEstimate}`);
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: insert-warmup-summaries.ts <batch.json>");

  const rows = JSON.parse(readFileSync(path, "utf8")) as SummaryInput[];
  console.log(`[warmup] inserting ${rows.length} summaries from ${path}`);

  // Real post counts straight from the DB so postCount is accurate.
  const counts = await db
    .select({ code: redditPosts.courseCode, n: sql<number>`count(*)::int` })
    .from(redditPosts)
    .groupBy(redditPosts.courseCode);
  const countByCode = new Map(counts.map((c) => [c.code, c.n]));

  let ok = 0;
  for (const s of rows) {
    validate(s);
    await db
      .insert(redditSummaries)
      .values({
        courseCode: s.courseCode,
        summary: {
          sentiment: s.sentiment,
          commonComplaints: s.commonComplaints,
          commonPraise: s.commonPraise,
          profMentions: s.profMentions,
          difficultyEstimate: s.difficultyEstimate,
          citations: s.citations,
        },
        postCount: countByCode.get(s.courseCode) ?? 0,
        model: "cached",
        tokensUsed: 0,
      })
      .onConflictDoUpdate({
        target: redditSummaries.courseCode,
        set: {
          summary: sql`excluded.summary`,
          postCount: sql`excluded.post_count`,
          model: sql`excluded.model`,
        },
      });
    ok++;
    console.log(`  ${s.courseCode.padEnd(10)} → ${s.sentiment}/${s.difficultyEstimate}`);
  }
  console.log(`[warmup] done: ${ok}/${rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[warmup] fatal:", err);
    process.exit(1);
  });
