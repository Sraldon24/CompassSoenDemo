/**
 * scrape-reddit.ts
 *
 * Phase 4 community scraper. For each course in the catalog:
 *   1. Try Reddit (old.reddit.com/r/Concordia search.json) — primary, free.
 *   2. If Reddit returns 0 OR errors, fall back to Brave Search — budget-gated.
 *   3. Upsert results into `reddit_posts` table.
 *
 * Designed to be idempotent — running twice on the same day produces the
 * same rows (upsert on post id).
 *
 * CLI:
 *   npm run scrape:reddit             # scrape all courses
 *   npm run scrape:reddit -- --code "COMP 472"   # one course
 *   npm run scrape:reddit -- --limit 10          # cap per course
 *   npm run scrape:reddit -- --no-fallback       # Reddit only, skip Brave
 */

import { sql } from "drizzle-orm";
import { braveSource } from "../src/lib/community/brave";
import { concordiaCoursesSource } from "../src/lib/community/concordia-courses";
import { fetchPostsForCourse } from "../src/lib/community/fetch-posts";
import { redditSource } from "../src/lib/community/reddit";
import type { CommunityPost } from "../src/lib/community/source";
import { db } from "../src/lib/data/db";
import { courses, redditPosts } from "../src/lib/data/schema";

interface CliOptions {
  code?: string;
  limit: number;
  fallback: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { limit: 25, fallback: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--code") opts.code = argv[++i];
    else if (arg === "--limit") opts.limit = Number.parseInt(argv[++i] ?? "25", 10);
    else if (arg === "--no-fallback") opts.fallback = false;
  }
  return opts;
}

async function getCoursesToScrape(opts: CliOptions): Promise<string[]> {
  if (opts.code) return [opts.code];
  const rows = await db.select({ code: courses.code }).from(courses);
  return rows.map((r) => r.code);
}

interface PerCourseResult {
  code: string;
  source: "concordia-courses" | "reddit" | "brave" | "none";
  count: number;
  error: string | null;
  /** True when Brave's monthly budget is exhausted — main() stops the loop. */
  budgetStop: boolean;
}

async function scrapeOne(code: string, opts: CliOptions): Promise<PerCourseResult> {
  // Source order: concordia.courses (richest) → reddit → brave. The pure
  // fetchPostsForCourse() owns the fallback decision; this shell persists posts.
  const result = await fetchPostsForCourse(
    code,
    redditSource,
    braveSource,
    { limit: opts.limit, useFallback: opts.fallback },
    concordiaCoursesSource,
  );

  if (!result.ok) {
    const error =
      result.reason === "budget_exhausted"
        ? `Brave budget exhausted (${result.used}/${result.budget})`
        : result.message;
    return {
      code,
      source: "none",
      count: 0,
      error,
      budgetStop: result.reason === "budget_exhausted",
    };
  }

  if (result.posts.length > 0) await persistPosts(result.posts);
  return {
    code,
    source: result.source,
    count: result.posts.length,
    error: null,
    budgetStop: false,
  };
}

async function persistPosts(posts: CommunityPost[]): Promise<void> {
  // Upsert on id so re-running the scraper is idempotent.
  await db
    .insert(redditPosts)
    .values(
      posts.map((p) => ({
        id: p.id,
        courseCode: p.courseCode,
        title: p.title,
        body: p.body,
        author: p.author,
        score: p.score,
        numComments: p.numComments,
        url: p.url,
        postedAt: p.postedAt,
      })),
    )
    .onConflictDoUpdate({
      target: redditPosts.id,
      set: {
        title: sql`excluded.title`,
        body: sql`excluded.body`,
        score: sql`excluded.score`,
        numComments: sql`excluded.num_comments`,
        fetchedAt: new Date(),
      },
    });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const codes = await getCoursesToScrape(opts);
  console.log(`[scrape-reddit] Scraping ${codes.length} course(s)…`);

  const results: PerCourseResult[] = [];
  for (const code of codes) {
    // One course's failure (timeout, network blip) must NOT abort the whole
    // run — log it and move on so a 124-course scrape always completes.
    let result: PerCourseResult;
    try {
      result = await scrapeOne(code, opts);
    } catch (err) {
      result = {
        code,
        source: "none",
        count: 0,
        error: err instanceof Error ? err.message : String(err),
        budgetStop: false,
      };
    }
    results.push(result);
    const status = result.error
      ? `ERR ${result.error}`
      : `${result.source} (${result.count} post${result.count === 1 ? "" : "s"})`;
    console.log(`  ${code.padEnd(10)} → ${status}`);

    // Brave's monthly budget is gone — stop hitting it for the rest of the run.
    if (result.budgetStop) {
      console.warn("[scrape-reddit] Brave budget exhausted — stopping early.");
      break;
    }

    // Be a polite citizen: ~1 req/sec to Reddit so we don't get rate-limited.
    await new Promise((r) => setTimeout(r, 1_100));
  }

  const summary = {
    total: results.length,
    concordiaCourses: results.filter((r) => r.source === "concordia-courses").length,
    reddit: results.filter((r) => r.source === "reddit").length,
    brave: results.filter((r) => r.source === "brave").length,
    empty: results.filter((r) => r.source === "none" && !r.error).length,
    errored: results.filter((r) => r.error).length,
  };
  console.log("\n[scrape-reddit] Done.", summary);
}

main().catch((err) => {
  console.error("[scrape-reddit] Fatal:", err);
  process.exit(1);
});
