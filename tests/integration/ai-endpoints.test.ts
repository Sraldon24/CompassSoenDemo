/**
 * AI endpoint integration tests.
 *
 * Exercises the AI pipeline (Groq + RAG + DB) end-to-end at the function level.
 * Does NOT spin up the Next.js HTTP server — calls the underlying modules
 * directly so tests run in <30s. The HTTP-level smoke tests live in Playwright.
 *
 * Requires: GROQ_API_KEY in .env.local + Docker Postgres + course_embeddings populated.
 * If Groq is unavailable, tests are skipped with a clear message.
 */

import { db } from "@/lib/db";
import { profiles, userCourses, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const AI_USER_ID = `ai-int-${Date.now()}`;
const HAS_GROQ = !!process.env.GROQ_API_KEY;

describe.skipIf(!HAS_GROQ)("AI endpoint integration (Groq + RAG + DB)", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: AI_USER_ID,
      email: `${AI_USER_ID}@compass-test.local`,
      name: "AI Int Tester",
      emailVerified: true,
      role: "user",
    });
    await db.insert(profiles).values({
      userId: AI_USER_ID,
      program: "SOEN-General",
      entryTerm: "Fall 2026",
      onboardingCompleted: true,
      interests: ["AI", "machine learning"],
    });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, AI_USER_ID));
  });

  // ============================================================================
  // RAG pipeline
  // ============================================================================

  it("RAG: explicit course code in query is forced into context", async () => {
    const { buildRAGContext } = await import("@/lib/ai/rag");
    const result = await buildRAGContext({
      query: "Tell me about COMP 472",
      userId: AI_USER_ID,
    });
    expect(result.text).toContain("COMP 472");
    expect(result.sources.find((s) => s.id === "course:COMP 472")).toBeTruthy();
  });

  it("RAG: pure semantic query (no explicit codes) still returns sources", async () => {
    const { buildRAGContext } = await import("@/lib/ai/rag");
    const result = await buildRAGContext({
      query: "what should I take to learn neural networks",
      userId: AI_USER_ID,
    });
    expect(result.sources.length).toBeGreaterThan(0);
    // Semantic search should surface ML/AI-relevant courses.
    const codes = result.sources.map((s) => s.id.replace("course:", ""));
    const hasAICourse = codes.some((c) =>
      ["COMP 432", "COMP 472", "COMP 474", "COMP 433"].includes(c),
    );
    expect(hasAICourse).toBe(true);
  });

  it("RAG: handles non-existent course code gracefully (no crash)", async () => {
    const { buildRAGContext } = await import("@/lib/ai/rag");
    const result = await buildRAGContext({
      query: "Tell me about COMP 999 and COMP 472",
      userId: AI_USER_ID,
    });
    // Real one should be in context; fake one is silently skipped.
    expect(result.text).toContain("COMP 472");
    expect(result.text).not.toContain("COMP 999 —"); // no E1/E2 entry
  });

  // ============================================================================
  // Recommendations
  // ============================================================================

  it("recommend: returns 5 courses for AI-focused user (no hallucinations)", async () => {
    const { runRecommendationGraph } = await import("@/lib/ai/graphs/recommend-graph");
    const recs = await runRecommendationGraph({
      userId: AI_USER_ID,
      interests: ["AI", "machine learning"],
      categoryFilter: ["soen_elective"],
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(5);
    // Every recommended code MUST exist in our catalog.
    const { sql } = await import("drizzle-orm");
    for (const r of recs) {
      const [row] = await db.execute<{ exists: boolean }>(
        sql`SELECT EXISTS(SELECT 1 FROM courses WHERE code = ${r.code}) AS exists`,
      );
      expect(row?.exists).toBe(true);
    }
  });

  it("recommend: never suggests a course already in user's plan", async () => {
    // Add COMP 472 to user's plan.
    await db.insert(userCourses).values({
      userId: AI_USER_ID,
      courseCode: "COMP 472",
      term: "Winter 2029",
      year: 2029,
      status: "planned",
    });
    try {
      const { runRecommendationGraph } = await import("@/lib/ai/graphs/recommend-graph");
      const recs = await runRecommendationGraph({
        userId: AI_USER_ID,
        interests: ["AI"],
        categoryFilter: ["soen_elective"],
      });
      expect(recs.find((r) => r.code === "COMP 472")).toBeUndefined();
    } finally {
      await db.delete(userCourses).where(eq(userCourses.userId, AI_USER_ID));
    }
  });

  // ============================================================================
  // Provider
  // ============================================================================

  it("provider: generateResponse returns text + token usage", async () => {
    const { generateResponse } = await import("@/lib/ai/provider");
    const result = await generateResponse({
      task: "chat-simple",
      system: "You are a test assistant. Respond with exactly the word 'pong'.",
      messages: [{ role: "user", content: "ping" }],
      temperature: 0,
      maxTokens: 20,
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.model).toMatch(/llama-3\.1-8b/);
    expect(result.usage.tokens).toBeGreaterThan(0);
  });

  it("provider: selectModel routes simple tasks → 8B, complex → 70B", async () => {
    const { selectModel } = await import("@/lib/ai/provider");
    expect(selectModel("chat-simple")).toBe("llama-3.1-8b-instant");
    expect(selectModel("search")).toBe("llama-3.1-8b-instant");
    expect(selectModel("chat-complex")).toBe("llama-3.3-70b-versatile");
    expect(selectModel("recommend")).toBe("llama-3.3-70b-versatile");
    expect(selectModel("email-draft")).toBe("llama-3.3-70b-versatile");
  });
});
