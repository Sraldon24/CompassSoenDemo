/**
 * Cache layer for Reddit course summaries.
 *
 * Wraps the summarize-graph with a 7-day TTL backed by the reddit_summaries
 * table. The course detail page calls getCourseSummary(code) — that returns
 * a cached row instantly OR triggers a fresh LLM pass if stale/missing.
 *
 * Why DB cache (not memory): each summary costs ~5 Groq calls (~3-5K tokens
 * total). With 124 courses and a 1K-RPD limit on 70B, naive on-demand
 * regeneration would burn the daily budget in one user's pageview spree.
 */

import { db } from "@/lib/data/db";
import { redditPosts, redditSummaries } from "@/lib/data/schema";
import { desc, eq } from "drizzle-orm";
import {
  type CourseSummary,
  type SummarizeInput,
  type SummarizePost,
  runSummarizeGraph,
} from "../ai/graphs/summarize-graph";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_POSTS = 8;

export interface SummaryRow {
  courseCode: string;
  summary: CourseSummary;
  generatedAt: Date;
  isStale: boolean;
}

/** A stored cache row + its post count (what getCached needs to reconstruct).
 * The persisted JSON omits `postsConsidered` — it's derived from postCount at
 * read time — so the stored shape is CourseSummary minus that field. */
export interface StoredSummary {
  courseCode: string;
  summary: Omit<CourseSummary, "postsConsidered">;
  postCount: number;
  generatedAt: Date;
}

/**
 * The external dependencies of the cache layer, bundled so they can be swapped
 * in tests. Production wires `defaultDeps` (real DB + the LangGraph chain +
 * Date.now); tests inject fakes to exercise the stale-while-revalidate branches
 * with no DB and no Groq. Never exposed to normal callers.
 */
export interface SummaryDeps {
  loadStored: (courseCode: string) => Promise<StoredSummary | null>;
  loadPosts: (courseCode: string) => Promise<SummarizePost[]>;
  runGraph: (input: SummarizeInput) => Promise<CourseSummary>;
  saveRow: (courseCode: string, summary: CourseSummary, postCount: number) => Promise<void>;
  deleteRow: (courseCode: string) => Promise<void>;
  now: () => number;
}

const defaultDeps: SummaryDeps = {
  loadStored: async (courseCode) => {
    const rows = await db
      .select()
      .from(redditSummaries)
      .where(eq(redditSummaries.courseCode, courseCode));
    const row = rows[0];
    if (!row) return null;
    return {
      courseCode: row.courseCode,
      summary: row.summary,
      postCount: row.postCount,
      generatedAt: row.generatedAt,
    };
  },
  loadPosts: async (courseCode) => {
    const posts = await db
      .select({
        id: redditPosts.id,
        title: redditPosts.title,
        body: redditPosts.body,
        score: redditPosts.score,
        url: redditPosts.url,
      })
      .from(redditPosts)
      .where(eq(redditPosts.courseCode, courseCode))
      .orderBy(desc(redditPosts.score));
    return posts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body ?? "",
      score: p.score,
      permalink: p.url ?? "",
    }));
  },
  runGraph: runSummarizeGraph,
  saveRow: async (courseCode, summary, postCount) => {
    await db
      .insert(redditSummaries)
      .values({
        courseCode,
        summary,
        postCount,
        model: "groq-llama-3.3-70b",
        generatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: redditSummaries.courseCode,
        set: { summary, postCount, model: "groq-llama-3.3-70b", generatedAt: new Date() },
      });
  },
  deleteRow: async (courseCode) => {
    await db.delete(redditSummaries).where(eq(redditSummaries.courseCode, courseCode));
  },
  now: () => Date.now(),
};

// ---------- Internal (deps-injected) implementations -----------------------

async function _getCached(courseCode: string, deps: SummaryDeps): Promise<SummaryRow | null> {
  const stored = await deps.loadStored(courseCode);
  if (!stored) return null;
  const isStaleRow = deps.now() - stored.generatedAt.getTime() > TTL_MS;
  return {
    courseCode: stored.courseCode,
    summary: { ...stored.summary, postsConsidered: stored.postCount },
    generatedAt: stored.generatedAt,
    isStale: isStaleRow,
  };
}

async function _regenerate(courseCode: string, deps: SummaryDeps): Promise<SummaryRow | null> {
  const posts = await deps.loadPosts(courseCode);
  if (posts.length === 0) {
    // Wipe any stale row so the UI shows "no community data" instead of an
    // old summary against zero current posts.
    await deps.deleteRow(courseCode);
    return null;
  }
  // Cap to the top N posts — beyond that, signal-per-token drops sharply.
  const top = posts.slice(0, MAX_POSTS);
  const summary = await deps.runGraph({ courseCode, posts: top });
  await deps.saveRow(courseCode, summary, top.length);
  return { courseCode, summary, generatedAt: new Date(deps.now()), isStale: false };
}

async function _getCourseSummary(
  courseCode: string,
  deps: SummaryDeps,
): Promise<SummaryRow | null> {
  const cached = await _getCached(courseCode, deps);
  if (cached && !cached.isStale) return cached;
  if (cached?.isStale) {
    // Stale-while-revalidate: fire and forget. The cached value is still
    // useful even if regeneration fails.
    _regenerate(courseCode, deps).catch((err) => {
      console.warn(`[summaries] background regen failed for ${courseCode}:`, err);
    });
    return cached;
  }
  return _regenerate(courseCode, deps); // cold cache
}

// ---------- Public surface (unchanged signatures, default deps) ------------

/** Returns the latest cached summary if any (regardless of staleness). */
export async function getCachedSummary(courseCode: string): Promise<SummaryRow | null> {
  return _getCached(courseCode, defaultDeps);
}

/** Returns true if the cached row is missing OR older than 7 days. */
export async function isStale(courseCode: string): Promise<boolean> {
  const cached = await getCachedSummary(courseCode);
  return !cached || cached.isStale;
}

/** Force a fresh LLM pass and persist. Used by the cron + admin "regenerate". */
export async function regenerateSummary(courseCode: string): Promise<SummaryRow | null> {
  return _regenerate(courseCode, defaultDeps);
}

/** Read-or-regenerate (stale-while-revalidate). The UI's primary entry point. */
export async function getCourseSummary(courseCode: string): Promise<SummaryRow | null> {
  return _getCourseSummary(courseCode, defaultDeps);
}

/** TEST-ONLY: run the cache logic against injected deps (no DB, no Groq). */
export const _deps = {
  getCached: _getCached,
  regenerate: _regenerate,
  getCourseSummary: _getCourseSummary,
};
