/**
 * Brave Search community source — fallback backend.
 *
 * Only invoked when Reddit returns 0 results or errors. Brave charges
 * $5 per 1,000 requests but gives a $5/mo credit, so effectively 1,000
 * requests/month free. We hard-cap usage at BRAVE_MONTHLY_BUDGET (default
 * 1,000) and refuse calls once that ceiling is reached.
 *
 * The cap is enforced in *code* against the `brave_usage` table, NOT just
 * by Brave's dashboard settings — even if their cap fails or we forget to
 * set it, we cannot bill the card.
 */

import { db } from "@/lib/data/db";
import { braveUsage } from "@/lib/data/schema";
import { eq, sql } from "drizzle-orm";
import type { CommunityPost, CommunitySource } from "./source";

const BRAVE_API = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_BUDGET = 1_000;

export class BraveBudgetExceededError extends Error {
  used: number;
  budget: number;
  constructor(used: number, budget: number) {
    super(`Brave Search monthly budget exhausted (${used}/${budget})`);
    this.name = "BraveBudgetExceededError";
    this.used = used;
    this.budget = budget;
  }
}

export class BraveSearchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BraveSearchError";
    this.status = status;
  }
}

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

/** YYYY-MM in UTC — keyed independent of the host machine's timezone. */
export function currentMonthKey(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export interface BraveUsageRow {
  monthKey: string;
  requestCount: number;
  monthlyBudget: number;
  lastRequestAt: Date | null;
  createdAt: Date;
}

/** Reads current usage row for `month`, creating it with default budget if missing. */
export async function getOrCreateBraveUsage(
  month: string = currentMonthKey(),
): Promise<BraveUsageRow> {
  const existing = await db.select().from(braveUsage).where(eq(braveUsage.monthKey, month));
  if (existing[0]) return existing[0] as BraveUsageRow;

  const budget = Number.parseInt(process.env.BRAVE_MONTHLY_BUDGET || "", 10);
  const monthlyBudget = Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET;
  const rows = await db
    .insert(braveUsage)
    .values({ monthKey: month, requestCount: 0, monthlyBudget })
    .returning();
  if (!rows[0]) {
    throw new Error(`Failed to create brave_usage row for ${month}`);
  }
  return rows[0] as BraveUsageRow;
}

/** Returns true when the current month has burned its full request budget. */
export async function isBraveBudgetExhausted(month: string = currentMonthKey()): Promise<boolean> {
  const usage = await getOrCreateBraveUsage(month);
  return usage.requestCount >= usage.monthlyBudget;
}

/**
 * Atomic increment-and-check: reserves one request before the API call.
 * Returns the new count. Throws BraveBudgetExceededError if no headroom.
 *
 * Why reserve-before-call: if we incremented *after* the API response,
 * a crash mid-request would let us call Brave again for the same money.
 * Better to "spend" the slot, then refund it via decrement on error.
 */
async function reserveBraveSlot(month: string): Promise<number> {
  const usage = await getOrCreateBraveUsage(month);
  if (usage.requestCount >= usage.monthlyBudget) {
    throw new BraveBudgetExceededError(usage.requestCount, usage.monthlyBudget);
  }
  const updated = await db
    .update(braveUsage)
    .set({
      requestCount: sql`${braveUsage.requestCount} + 1`,
      lastRequestAt: new Date(),
    })
    .where(eq(braveUsage.monthKey, month))
    .returning();
  if (!updated[0]) {
    throw new Error(`Failed to increment brave_usage for ${month}`);
  }
  return updated[0].requestCount;
}

async function refundBraveSlot(month: string): Promise<void> {
  await db
    .update(braveUsage)
    .set({ requestCount: sql`GREATEST(${braveUsage.requestCount} - 1, 0)` })
    .where(eq(braveUsage.monthKey, month));
}

/**
 * Query Brave Search. Returns up to `limit` web results mapped to
 * CommunityPost shape. Subject to the monthly budget guard.
 */
export async function searchBraveForCourse(
  courseCode: string,
  limit = 10,
): Promise<CommunityPost[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new BraveSearchError("BRAVE_SEARCH_API_KEY is not set", 500);
  }

  const month = currentMonthKey();
  await reserveBraveSlot(month);

  try {
    // Bias the query toward Concordia + Reddit-style discussion. Brave honors
    // `count` up to 20; we keep it small to stretch the monthly budget.
    const query = encodeURIComponent(`"${courseCode}" Concordia reddit OR review OR difficulty`);
    const url = `${BRAVE_API}?q=${query}&count=${Math.min(limit, 20)}`;
    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
      // Don't let a hung Brave connection stall the scrape (the reserved budget
      // slot is refunded by the catch below on any throw).
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      await refundBraveSlot(month);
      throw new BraveSearchError(
        `Brave search failed for ${courseCode}: ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    const json = (await res.json()) as BraveSearchResponse;
    const results = json?.web?.results ?? [];
    return results.map((r, i) => mapBraveResultToCommunity(r, courseCode, i));
  } catch (err) {
    // refundBraveSlot is best-effort; swallow its errors so the original
    // exception still propagates.
    if (!(err instanceof BraveBudgetExceededError)) {
      await refundBraveSlot(month).catch(() => {});
    }
    throw err;
  }
}

function mapBraveResultToCommunity(
  result: BraveWebResult,
  courseCode: string,
  index: number,
): CommunityPost {
  // No stable id from Brave — derive one from URL + index so re-runs
  // collide deterministically on the same result.
  const id = `brave-${hashString(result.url)}-${index}`;
  return {
    id,
    courseCode,
    title: result.title,
    body: result.description ?? "",
    author: null,
    score: null,
    numComments: null,
    url: result.url,
    postedAt: null,
    source: "brave",
  };
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export const braveSource: CommunitySource = {
  name: "brave",
  async search(courseCode, limit = 10) {
    return searchBraveForCourse(courseCode, limit);
  },
};
