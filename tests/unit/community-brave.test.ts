/**
 * Unit tests for the Brave Search community source.
 *
 * Critical: the budget guard is the only thing standing between us and a
 * real bill on user's Brave account. These tests pin its behavior.
 *
 * Hits Postgres for the brave_usage table — skipped if DATABASE_URL is unset.
 */

import {
  BraveBudgetExceededError,
  currentMonthKey,
  getOrCreateBraveUsage,
  isBraveBudgetExhausted,
  searchBraveForCourse,
} from "@/lib/community/brave";
import { db } from "@/lib/data/db";
import { braveUsage } from "@/lib/data/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;
const TEST_MONTH = "2999-01"; // Far-future key so we can't collide with real data.

function mockFetchResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const ok = init.ok ?? status < 400;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  });
}

describe("currentMonthKey", () => {
  it("formats UTC year+month as YYYY-MM", () => {
    expect(currentMonthKey(new Date("2026-05-28T12:00:00Z"))).toBe("2026-05");
    expect(currentMonthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(currentMonthKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("uses UTC, not local time (avoids host-tz drift)", () => {
    // Midnight UTC on the 1st should still be month 01 even from PST.
    expect(currentMonthKey(new Date("2026-05-01T00:00:00Z"))).toBe("2026-05");
  });
});

describe.skipIf(!HAS_DB)("Brave budget guard", () => {
  beforeEach(async () => {
    await db.delete(braveUsage).where(eq(braveUsage.monthKey, TEST_MONTH));
  });
  afterAll(async () => {
    await db.delete(braveUsage).where(eq(braveUsage.monthKey, TEST_MONTH));
  });

  it("creates a usage row with default budget of 1000 when none exists", async () => {
    const row = await getOrCreateBraveUsage(TEST_MONTH);
    expect(row.monthKey).toBe(TEST_MONTH);
    expect(row.requestCount).toBe(0);
    expect(row.monthlyBudget).toBe(1000);
  });

  it("isBraveBudgetExhausted returns false when count < budget", async () => {
    await getOrCreateBraveUsage(TEST_MONTH);
    expect(await isBraveBudgetExhausted(TEST_MONTH)).toBe(false);
  });

  it("isBraveBudgetExhausted returns true at exactly the budget ceiling", async () => {
    await db
      .insert(braveUsage)
      .values({ monthKey: TEST_MONTH, requestCount: 1000, monthlyBudget: 1000 });
    expect(await isBraveBudgetExhausted(TEST_MONTH)).toBe(true);
  });
});

describe.skipIf(!HAS_DB)("searchBraveForCourse", () => {
  beforeEach(async () => {
    await db.delete(braveUsage).where(eq(braveUsage.monthKey, currentMonthKey()));
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await db.delete(braveUsage).where(eq(braveUsage.monthKey, currentMonthKey()));
  });

  it("maps Brave web results to CommunityPost shape", async () => {
    global.fetch = mockFetchResponse({
      web: {
        results: [
          {
            title: "COMP 472 review",
            url: "https://example.com/comp472",
            description: "Course description text",
          },
        ],
      },
    }) as unknown as typeof fetch;

    const posts = await searchBraveForCourse("COMP 472");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      courseCode: "COMP 472",
      title: "COMP 472 review",
      body: "Course description text",
      url: "https://example.com/comp472",
      source: "brave",
      author: null,
      score: null,
    });
  });

  it("increments the monthly counter by exactly 1 per successful call", async () => {
    global.fetch = mockFetchResponse({ web: { results: [] } }) as unknown as typeof fetch;
    await searchBraveForCourse("COMP 472");
    const usage = await getOrCreateBraveUsage(currentMonthKey());
    expect(usage.requestCount).toBe(1);

    await searchBraveForCourse("COMP 472");
    const after = await getOrCreateBraveUsage(currentMonthKey());
    expect(after.requestCount).toBe(2);
  });

  it("refuses the call (no HTTP request) when budget is exhausted", async () => {
    await db.insert(braveUsage).values({
      monthKey: currentMonthKey(),
      requestCount: 1000,
      monthlyBudget: 1000,
    });

    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(searchBraveForCourse("COMP 472")).rejects.toBeInstanceOf(BraveBudgetExceededError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refunds the reserved slot when Brave returns a non-2xx", async () => {
    global.fetch = mockFetchResponse(
      { error: "server" },
      { status: 500, ok: false },
    ) as unknown as typeof fetch;

    await expect(searchBraveForCourse("COMP 472")).rejects.toThrow();
    const usage = await getOrCreateBraveUsage(currentMonthKey());
    expect(usage.requestCount).toBe(0); // reserved then refunded
  });

  it("respects BRAVE_MONTHLY_BUDGET env override when creating a new month row", async () => {
    process.env.BRAVE_MONTHLY_BUDGET = "500";
    await db.delete(braveUsage).where(eq(braveUsage.monthKey, "2998-12"));
    const row = await getOrCreateBraveUsage("2998-12");
    expect(row.monthlyBudget).toBe(500);
    await db.delete(braveUsage).where(eq(braveUsage.monthKey, "2998-12"));
    process.env.BRAVE_MONTHLY_BUDGET = "";
  });
});
