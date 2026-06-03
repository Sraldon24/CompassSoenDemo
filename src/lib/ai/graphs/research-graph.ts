/**
 * Research / verification graph (LangGraph v1).
 *
 * State machine:
 *   START → intake → localRAG → webSearch → crossVerify → report → END
 *
 * Used by `scripts/research.ts` to cross-check AI claims against authoritative
 * Concordia calendar pages. Same logic the previous hand-rolled CLI ran, now
 * as observable graph nodes so a future contributor can hook a checkpointer
 * or fan-out to additional sources (Reddit, RateMyProfessors search URL, etc.).
 */

import { db } from "@/lib/data/db";
import { END, START, StateGraph } from "@langchain/langgraph";
import { sql } from "drizzle-orm";
import { embed } from "../embeddings";
import { AIError, generateResponse } from "../provider";

interface CourseHit {
  code: string;
  title: string;
  description: string | null;
  credits: number;
  category: string | null;
  distance: number;
}

interface WebSource {
  url: string;
  summary: string;
}

interface GraphState {
  query: string;
  extractedCodes?: string[];
  localHits?: CourseHit[];
  webSources?: WebSource[];
  finalReport?: string;
}

const CONCORDIA_PAGES = [
  "https://www.concordia.ca/academics/undergraduate/calendar/current/section-71-gina-cody-school-of-engineering-and-computer-science/section-71-70-department-of-computer-science-and-software-engineering/section-71-70-9-degree-requirements-for-the-beng-in-software-engineering.html",
  "https://www.concordia.ca/academics/undergraduate/calendar/current/section-71-gina-cody-school-of-engineering-and-computer-science/section-71-70-department-of-computer-science-and-software-engineering/section-71-70-10-computer-science-and-software-engineering-courses.html",
  "https://www.concordia.ca/ginacody/computer-science-software-eng/programs/software-eng/bachelor/course-sequences.html",
];

const COURSE_CODE_RE = /\b([A-Z]{3,4})\s*(\d{3})\b/g;

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

// ---------- Node implementations -------------------------------------------

async function intakeNode(state: GraphState): Promise<Partial<GraphState>> {
  const seen = new Set<string>();
  for (const m of state.query.matchAll(COURSE_CODE_RE)) {
    seen.add(`${m[1]} ${m[2]}`);
  }
  return { extractedCodes: [...seen] };
}

async function localRAGNode(state: GraphState): Promise<Partial<GraphState>> {
  const vec = await embed(state.query);
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
  return { localHits: rows as CourseHit[] };
}

async function webSearchNode(state: GraphState): Promise<Partial<GraphState>> {
  const codes = state.extractedCodes ?? [];
  if (codes.length === 0) {
    return {
      webSources: CONCORDIA_PAGES.map((url) => ({
        url,
        summary: "Concordia BEng SOEN reference (not fetched — no codes in query)",
      })),
    };
  }

  // Fetch all Concordia pages concurrently — they're independent and each can
  // take up to 15s, so serial fetching needlessly serialized the timeouts.
  const out = await Promise.all(
    CONCORDIA_PAGES.map(async (url): Promise<WebSource> => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "SOEN-Compass-Research/1.0 (sraldon24@gmail.com)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          return { url, summary: `[fetch failed: HTTP ${res.status}]` };
        }
        const html = await res.text();
        const mentions = codes.filter((code) => html.includes(code));
        if (mentions.length > 0) {
          const firstCode = mentions[0] ?? "";
          const idx = html.indexOf(firstCode);
          const excerpt = html
            .slice(Math.max(0, idx - 200), idx + 600)
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return { url, summary: excerpt.slice(0, 800) };
        }
        return { url, summary: "(no direct mention of queried codes)" };
      } catch (err) {
        return {
          url,
          summary: `[fetch error: ${err instanceof Error ? err.message : "unknown"}]`,
        };
      }
    }),
  );
  return { webSources: out };
}

async function crossVerifyNode(state: GraphState): Promise<Partial<GraphState>> {
  const localBlock = (state.localHits ?? [])
    .map(
      (h) =>
        `[LOCAL:${h.code}] ${h.title} (${h.credits}cr, ${h.category ?? "?"})\n${(h.description ?? "").slice(0, 500)}`,
    )
    .join("\n\n");

  const webBlock = (state.webSources ?? []).map((w) => `[WEB:${w.url}]\n${w.summary}`).join("\n\n");

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
    return { finalReport: text };
  } catch (err) {
    if (err instanceof AIError) {
      return {
        finalReport: `**AI unavailable** (${err.status}). Raw context:\n\n${localBlock}\n\n${webBlock}`,
      };
    }
    throw err;
  }
}

// `report` is a passthrough — placeholder for a future formatting/export step.
async function reportNode(state: GraphState): Promise<Partial<GraphState>> {
  return { finalReport: state.finalReport };
}

// ---------- Graph construction ---------------------------------------------

const channels = {
  query: null,
  extractedCodes: null,
  localHits: null,
  webSources: null,
  finalReport: null,
};

const builder = new StateGraph<GraphState>({ channels })
  .addNode("intakeStep", intakeNode)
  .addNode("localRAGStep", localRAGNode)
  .addNode("webSearchStep", webSearchNode)
  .addNode("crossVerifyStep", crossVerifyNode)
  .addNode("reportStep", reportNode)
  .addEdge(START, "intakeStep")
  .addEdge("intakeStep", "localRAGStep")
  .addEdge("localRAGStep", "webSearchStep")
  .addEdge("webSearchStep", "crossVerifyStep")
  .addEdge("crossVerifyStep", "reportStep")
  .addEdge("reportStep", END);

export const researchGraph = builder.compile();

// ---------- Public entry point ---------------------------------------------

export interface ResearchOutput {
  query: string;
  extractedCodes: string[];
  localHits: CourseHit[];
  webSources: WebSource[];
  finalReport: string;
}

export async function runResearchGraph(query: string): Promise<ResearchOutput> {
  const result = (await researchGraph.invoke({ query })) as unknown as GraphState;
  return {
    query,
    extractedCodes: result.extractedCodes ?? [],
    localHits: result.localHits ?? [],
    webSources: result.webSources ?? [],
    finalReport: result.finalReport ?? "(no report generated)",
  };
}
