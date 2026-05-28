/**
 * Research CLI — manual verification of AI claims.
 *
 * Multi-step LangGraph agent:
 *   1. INTAKE         — parse user query, extract course codes if any
 *   2. LOCAL_RAG      — pull top-K matches from local course catalog (pgvector)
 *   3. WEB_SEARCH     — pull authoritative URLs (Concordia calendar pages)
 *   4. CROSS_VERIFY   — Groq cross-checks local + web sources
 *   5. REPORT         — emit a structured report with citations + flagged
 *                       contradictions
 *
 * Usage:
 *   npx tsx --import ./scripts/load-env.ts scripts/research.ts "When can I take COMP 472?"
 *   npm run research -- "Is SOEN 471 a good elective for AI track?"
 */

import { sql } from "drizzle-orm";
import { embed } from "../src/lib/ai/embeddings";
import { AIError, generateResponse } from "../src/lib/ai/provider";
import { db } from "../src/lib/db";

interface CourseHit {
  code: string;
  title: string;
  description: string | null;
  credits: number;
  category: string | null;
  distance: number;
}

interface ResearchState {
  query: string;
  extractedCodes: string[];
  localHits: CourseHit[];
  webSources: Array<{ url: string; summary: string }>;
  finalReport: string;
  warnings: string[];
}

const CONCORDIA_PAGES = [
  "https://www.concordia.ca/academics/undergraduate/calendar/current/section-71-gina-cody-school-of-engineering-and-computer-science/section-71-70-department-of-computer-science-and-software-engineering/section-71-70-9-degree-requirements-for-the-beng-in-software-engineering.html",
  "https://www.concordia.ca/academics/undergraduate/calendar/current/section-71-gina-cody-school-of-engineering-and-computer-science/section-71-70-department-of-computer-science-and-software-engineering/section-71-70-10-computer-science-and-software-engineering-courses.html",
  "https://www.concordia.ca/ginacody/computer-science-software-eng/programs/software-eng/bachelor/course-sequences.html",
];

// =============================================================================
// Step 1 — INTAKE
// =============================================================================

const COURSE_CODE_RE = /\b([A-Z]{3,4})\s*(\d{3})\b/g;

function extractCourseCodes(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(COURSE_CODE_RE)) {
    seen.add(`${m[1]} ${m[2]}`);
  }
  return [...seen];
}

// =============================================================================
// Step 2 — LOCAL_RAG
// =============================================================================

async function localRAG(query: string): Promise<CourseHit[]> {
  const vec = await embed(query);
  const rows = await db.execute<{
    code: string;
    title: string;
    description: string | null;
    credits: number;
    category: string | null;
    distance: number;
  }>(sql`
    SELECT c.code, c.title, c.description, c.credits, c.category,
           ce.embedding <=> ${JSON.stringify(vec)}::vector AS distance
    FROM course_embeddings ce
    JOIN courses c ON c.code = ce.course_code
    ORDER BY distance ASC
    LIMIT 8
  `);
  return rows as CourseHit[];
}

// =============================================================================
// Step 3 — WEB_SEARCH (concordia.ca, no auth needed)
// =============================================================================

async function webSearch(codes: string[]): Promise<Array<{ url: string; summary: string }>> {
  if (codes.length === 0) {
    return CONCORDIA_PAGES.map((url) => ({
      url,
      summary: "Concordia BEng SOEN reference (not fetched)",
    }));
  }

  const out: Array<{ url: string; summary: string }> = [];
  for (const url of CONCORDIA_PAGES) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SOEN-Compass-Research/1.0 (sraldon24@gmail.com)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        out.push({ url, summary: `[fetch failed: HTTP ${res.status}]` });
        continue;
      }
      const html = await res.text();
      // Crude relevance check: keep only pages that mention at least one of the codes.
      const mentions = codes.filter((code) => html.includes(code));
      if (mentions.length > 0) {
        // Extract a short excerpt around the first match.
        const idx = html.indexOf(mentions[0] ?? "");
        const excerpt = html
          .slice(Math.max(0, idx - 200), idx + 600)
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        out.push({ url, summary: excerpt.slice(0, 800) });
      } else {
        out.push({ url, summary: "(no direct mention of queried codes)" });
      }
    } catch (err) {
      out.push({
        url,
        summary: `[fetch error: ${err instanceof Error ? err.message : "unknown"}]`,
      });
    }
  }
  return out;
}

// =============================================================================
// Step 4 — CROSS_VERIFY (Groq 70B)
// =============================================================================

const VERIFY_SYSTEM = `You are a research verifier for Concordia SOEN students.

You receive:
- A student's question
- Local course catalog matches (from our database)
- Authoritative Concordia webpage excerpts

Your job:
1. Answer the question based on the strongest evidence
2. CITE every claim with [LOCAL:CODE] or [WEB:URL]
3. Flag any contradictions between local and authoritative sources
4. If evidence is insufficient, say so — do NOT invent

Output format (markdown):
## Answer
<short direct answer>

## Evidence
- <claim> [SOURCE]
- ...

## Contradictions / Gaps
- <any issues found, or "None">

## Confidence
<low | medium | high>`;

async function crossVerify(state: ResearchState): Promise<string> {
  const localBlock = state.localHits
    .map((h) =>
      `[LOCAL:${h.code}] ${h.title} (${h.credits}cr, ${h.category ?? "?"})\n${h.description ?? ""}`.slice(
        0,
        500,
      ),
    )
    .join("\n\n");

  const webBlock = state.webSources.map((w) => `[WEB:${w.url}]\n${w.summary}`).join("\n\n");

  const prompt = `Question: ${state.query}

## Local catalog matches
${localBlock || "(none)"}

## Authoritative Concordia pages
${webBlock || "(none)"}

Now produce the structured report.`;

  try {
    const { text } = await generateResponse({
      task: "chat-complex",
      system: VERIFY_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      maxTokens: 1200,
    });
    return text;
  } catch (err) {
    if (err instanceof AIError) {
      return `**AI unavailable** (${err.status}). Raw context dump:\n\n${localBlock}\n\n${webBlock}`;
    }
    throw err;
  }
}

// =============================================================================
// Orchestrator
// =============================================================================

async function research(query: string): Promise<void> {
  console.log(`\n→ Researching: ${query}\n`);

  const state: ResearchState = {
    query,
    extractedCodes: [],
    localHits: [],
    webSources: [],
    finalReport: "",
    warnings: [],
  };

  // Step 1
  state.extractedCodes = extractCourseCodes(query);
  if (state.extractedCodes.length > 0) {
    console.log(`  Extracted course codes: ${state.extractedCodes.join(", ")}`);
  }

  // Step 2
  console.log("  → Local RAG (pgvector)…");
  state.localHits = await localRAG(query);
  console.log(`  ${state.localHits.length} local matches`);

  // Step 3
  console.log("  → Web search (Concordia calendar)…");
  state.webSources = await webSearch(state.extractedCodes);
  console.log(`  ${state.webSources.length} web sources`);

  // Step 4
  console.log("  → Cross-verify (Groq Llama 3.3 70B)…");
  state.finalReport = await crossVerify(state);

  // Step 5 — emit
  console.log("\n========== REPORT ==========\n");
  console.log(state.finalReport);
  console.log("\n========== SOURCES ==========\n");
  for (const h of state.localHits) {
    console.log(`  [LOCAL:${h.code}] (${h.distance.toFixed(3)}) ${h.title}`);
  }
  for (const w of state.webSources) {
    console.log(`  [WEB] ${w.url}`);
  }
  console.log();

  process.exit(0);
}

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run research -- "your question here"');
    console.error('Example: npm run research -- "When can I take COMP 472?"');
    process.exit(1);
  }
  await research(query);
}

main().catch((err) => {
  console.error("✗ Research failed:", err);
  process.exit(1);
});
