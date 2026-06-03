/**
 * Pure Reddit→Brave fallback decision for one course.
 *
 * Extracted from scripts/scrape-reddit.ts so the fallback branching (Reddit
 * empty/error → Brave; Brave budget exhausted → stop) is unit-testable with
 * fake CommunitySources — no network, no DB, no CLI. The script keeps the
 * persistence + CLI shell; this owns the decision.
 *
 * Sources are injected (the CommunitySource port), so production passes the
 * real redditSource/braveSource singletons and tests pass plain fakes.
 */

import { BraveBudgetExceededError } from "./brave";
import { ConcordiaCoursesError } from "./concordia-courses";
import { RedditSearchError } from "./reddit";
import type { CommunityPost, CommunitySource } from "./source";

/** Brave is always capped at 10 results regardless of the primary limit — it
 * draws on a tight monthly budget (see brave.ts). */
const BRAVE_MAX = 10;

export interface FetchPostsOptions {
  limit: number;
  /** When false, skip the fallback source even if primary returns 0. */
  useFallback: boolean;
}

export type FetchPostsResult =
  | { ok: true; posts: CommunityPost[]; source: "concordia-courses" | "reddit" | "brave" | "none" }
  | { ok: false; source: "none"; reason: "budget_exhausted"; used: number; budget: number }
  | { ok: false; source: "none"; reason: "error"; message: string };

/**
 * Resolve posts for one course code via primary → fallback.
 *
 * Contract (preserved from the original scrapeOne):
 *  - Try primary.search(code, limit).
 *  - A RedditSearchError from the primary is non-fatal → fall through to Brave.
 *  - Any OTHER throw from the primary re-throws (genuine bug, don't swallow).
 *  - If primary yields 0 and useFallback, try fallback.search(code, ≤10).
 *  - BraveBudgetExceededError → ok:false, reason:"budget_exhausted" (caller stops).
 *  - Any other fallback error → ok:false, reason:"error".
 */
export async function fetchPostsForCourse(
  code: string,
  primary: CommunitySource,
  fallback: CommunitySource,
  opts: FetchPostsOptions,
  /** Optional richest source (concordia.courses), tried BEFORE reddit. A
   * ConcordiaCoursesError is non-fatal → fall through to reddit→brave. */
  richPrimary?: CommunitySource,
): Promise<FetchPostsResult> {
  // 0) concordia.courses — densest Concordia-specific reviews. Try first.
  if (richPrimary) {
    try {
      const rich = await richPrimary.search(code, opts.limit);
      if (rich.length > 0) return { ok: true, posts: rich, source: "concordia-courses" };
    } catch (err) {
      if (!(err instanceof ConcordiaCoursesError)) throw err; // genuine bug — surface it
      // expected (rate-limit/network/4xx) → fall through to reddit→brave.
    }
  }

  let posts: CommunityPost[] = [];

  try {
    posts = await primary.search(code, opts.limit);
  } catch (err) {
    if (!(err instanceof RedditSearchError)) throw err; // genuine bug — surface it
    // RedditSearchError is expected (rate-limit/4xx) → fall through to Brave.
  }

  if (posts.length > 0) return { ok: true, posts, source: "reddit" };

  if (!opts.useFallback) return { ok: true, posts: [], source: "none" };

  try {
    const bravePosts = await fallback.search(code, Math.min(opts.limit, BRAVE_MAX));
    return bravePosts.length > 0
      ? { ok: true, posts: bravePosts, source: "brave" }
      : { ok: true, posts: [], source: "none" };
  } catch (err) {
    if (err instanceof BraveBudgetExceededError) {
      return {
        ok: false,
        source: "none",
        reason: "budget_exhausted",
        used: err.used,
        budget: err.budget,
      };
    }
    return {
      ok: false,
      source: "none",
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
