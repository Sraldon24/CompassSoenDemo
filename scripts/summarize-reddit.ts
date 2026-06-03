/**
 * summarize-reddit.ts
 *
 * Walks every course with scraped Reddit posts and (re)generates its summary
 * via the LangGraph summarize chain. Idempotent — uses regenerateSummary()
 * which upserts.
 *
 * Designed to run on a weekly cron in production. Locally:
 *   npm run summarize:reddit                       # all courses
 *   npm run summarize:reddit -- --code "COMP 472"  # one course
 *   npm run summarize:reddit -- --only-stale       # skip courses with fresh cache
 */

import { isStale, regenerateSummary } from "../src/lib/community/summaries";
import { db } from "../src/lib/data/db";
import { redditPosts } from "../src/lib/data/schema";

interface CliOptions {
  code?: string;
  onlyStale: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { onlyStale: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--code") opts.code = argv[++i];
    else if (arg === "--only-stale") opts.onlyStale = true;
  }
  return opts;
}

async function getCandidateCourses(opts: CliOptions): Promise<string[]> {
  if (opts.code) return [opts.code];

  // Find every course code that has at least one Reddit post.
  const rows = await db
    .select({ code: redditPosts.courseCode })
    .from(redditPosts)
    .groupBy(redditPosts.courseCode);

  return rows.map((r) => r.code).filter((c): c is string => c !== null);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const codes = await getCandidateCourses(opts);

  if (codes.length === 0) {
    console.log("[summarize] No courses with Reddit posts. Run scrape:reddit first.");
    return;
  }

  console.log(`[summarize] ${codes.length} course(s) to consider…`);

  const results: Array<{ code: string; status: string; error?: string }> = [];
  for (const code of codes) {
    if (opts.onlyStale) {
      const stale = await isStale(code);
      if (!stale) {
        results.push({ code, status: "skipped (fresh)" });
        console.log(`  ${code.padEnd(10)} → skipped (fresh)`);
        continue;
      }
    }

    try {
      const row = await regenerateSummary(code);
      if (row) {
        const c = row.summary;
        const profs = c.profMentions.length;
        const cites = c.citations.length;
        const status = `${c.sentiment}/${c.difficultyEstimate} (${profs} profs, ${cites} cites)`;
        results.push({ code, status });
        console.log(`  ${code.padEnd(10)} → ${status}`);
      } else {
        results.push({ code, status: "no posts" });
        console.log(`  ${code.padEnd(10)} → no posts`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ code, status: "error", error: msg });
      console.error(`  ${code.padEnd(10)} → ERROR ${msg}`);
    }

    // Gentle pacing — 1 summary ≈ 5 Groq calls, free tier is 30 RPM on 70B.
    // Sleep 2s between courses so we never hit the per-minute ceiling.
    await new Promise((r) => setTimeout(r, 2_000));
  }

  const summary = {
    total: results.length,
    succeeded: results.filter((r) => r.status.includes("/")).length,
    skipped: results.filter((r) => r.status.startsWith("skipped")).length,
    noPosts: results.filter((r) => r.status === "no posts").length,
    errored: results.filter((r) => r.status === "error").length,
  };
  console.log("\n[summarize] Done.", summary);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[summarize] Fatal:", err);
    process.exit(1);
  });
