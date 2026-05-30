/**
 * LangGraph integration tests.
 *
 * Each test exercises one of the three graphs end-to-end against real Postgres +
 * pgvector + (optionally) Groq. Skipped if GROQ_API_KEY is unset.
 *
 *   - recommend-graph: full pipeline (load → filter → rank → LLM → sanitize)
 *   - email-graph: gather → draft → critique → revise (uses 2 Groq calls)
 *   - research-graph: intake → localRAG → webSearch → crossVerify → report
 *     (webSearch hits real Concordia URLs — skip if no internet)
 */

import { runEmailDraftGraph } from "@/lib/ai/graphs/email-graph";
import { runRecommendationGraph } from "@/lib/ai/graphs/recommend-graph";
import { runResearchGraph } from "@/lib/ai/graphs/research-graph";
import { db } from "@/lib/db";
import { profiles, userCourses, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_GROQ = !!process.env.GROQ_API_KEY;
// The email + research graphs burn extra Groq calls — opt in via env when you
// have budget to spare. Recommendation graph stays always-on (only 1-2 calls).
const HEAVY_OPT_IN = process.env.RUN_HEAVY_GROQ_TESTS === "1";
const GRAPH_USER_ID = `graph-int-${Date.now()}`;

describe.skipIf(!HAS_GROQ)("LangGraph: recommendation graph", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: GRAPH_USER_ID,
      email: `${GRAPH_USER_ID}@compass-test.local`,
      name: "Graph Tester",
      emailVerified: true,
      role: "user",
    });
    await db.insert(profiles).values({
      userId: GRAPH_USER_ID,
      program: "SOEN-General",
      onboardingCompleted: true,
      interests: ["AI", "machine learning"],
    });
    // Give them a post-COMP-352 plan so AI courses are eligible.
    for (const code of ["COMP 232", "COMP 248", "COMP 249", "COMP 352"]) {
      await db.insert(userCourses).values({
        userId: GRAPH_USER_ID,
        courseCode: code,
        term: "Done",
        year: 2025,
        status: "transferred",
      });
    }
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, GRAPH_USER_ID));
  });

  it("runs all 5 nodes and returns 1-5 valid recommendations", async () => {
    const recs = await runRecommendationGraph({
      userId: GRAPH_USER_ID,
      interests: ["AI", "machine learning"],
      categoryFilter: ["soen_elective"],
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(5);
    for (const r of recs) {
      expect(r.code).toMatch(/^[A-Z]{3,4}\s\d{3}$/);
      expect(r.why.length).toBeGreaterThan(0);
      expect(typeof r.score).toBe("number");
      expect(Array.isArray(r.reasons)).toBe(true);
    }
  });

  it("never surfaces courses already in the user's plan (sanitize node)", async () => {
    // Add COMP 472 to the plan temporarily.
    await db.insert(userCourses).values({
      userId: GRAPH_USER_ID,
      courseCode: "COMP 472",
      term: "Winter 2029",
      year: 2029,
      status: "planned",
    });
    try {
      const recs = await runRecommendationGraph({
        userId: GRAPH_USER_ID,
        interests: ["AI"],
        categoryFilter: ["soen_elective"],
      });
      expect(recs.find((r) => r.code === "COMP 472")).toBeUndefined();
    } finally {
      // T1 fix: wrap the wipe + re-seed in a transaction so test order is
      // deterministic. Without this, an insert failure leaves a partial plan
      // and any subsequent test in this describe sees corrupted state.
      await db.transaction(async (tx) => {
        await tx.delete(userCourses).where(eq(userCourses.userId, GRAPH_USER_ID));
        for (const code of ["COMP 232", "COMP 248", "COMP 249", "COMP 352"]) {
          await tx.insert(userCourses).values({
            userId: GRAPH_USER_ID,
            courseCode: code,
            term: "Done",
            year: 2025,
            status: "transferred",
          });
        }
      });
    }
  });
});

describe.skipIf(!HAS_GROQ || !HEAVY_OPT_IN)("LangGraph: email-drafting graph", () => {
  it("runs draft → critique → revise and returns a clean final draft", async () => {
    const result = await runEmailDraftGraph({
      situation:
        "I need to ask my COMP 352 professor for an extension on the midterm scheduled for Nov 15 because I have a medical appointment that morning.",
      recipientRole: "professor",
    });
    expect(result.draft.length).toBeGreaterThan(0);
    expect(result.firstDraft.length).toBeGreaterThan(0);
    expect(result.critique.length).toBeGreaterThan(0);
    // The final draft should mention the course code AND have a subject line.
    expect(result.draft).toMatch(/Subject:/i);
    expect(result.draft).toMatch(/COMP 352/i);
    // Sanity: revised draft shouldn't be character-identical to first draft —
    // would suggest the critique loop did nothing.
    expect(result.draft).not.toBe(result.firstDraft);
  });
});

describe.skipIf(!HAS_GROQ || !HEAVY_OPT_IN)(
  "LangGraph: research graph (uses real Concordia URLs)",
  () => {
    it("extracts course codes from query and produces a structured report", async () => {
      const result = await runResearchGraph("What are the prereqs for COMP 472?");
      expect(result.extractedCodes).toContain("COMP 472");
      expect(result.localHits.length).toBeGreaterThan(0);
      expect(result.webSources.length).toBe(3); // 3 Concordia URLs
      expect(result.finalReport.length).toBeGreaterThan(0);
      // Report should follow the prescribed structure.
      expect(result.finalReport).toMatch(/## Answer/i);
      expect(result.finalReport).toMatch(/## Evidence/i);
      expect(result.finalReport).toMatch(/## Confidence/i);
    }, 60_000); // 60s timeout — web fetches + Groq call
  },
);
