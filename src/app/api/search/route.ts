import { embed } from "@/lib/ai/embeddings";
import { apiOk } from "@/lib/api/response";
import { getSession } from "@/lib/auth/get-session";
import { db } from "@/lib/data/db";
import { courses } from "@/lib/data/schema";
import { denyResponse, guardAiCall } from "@/lib/limits";
import { ilike, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RESULTS = 12;

interface SearchHit {
  code: string;
  title: string;
  credits: number;
  category: string | null;
  description: string | null;
  /** 0-1 relevance. */
  score: number;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const mode = url.searchParams.get("mode") === "semantic" ? "semantic" : "keyword";

  if (query.length === 0) {
    return apiOk({ results: [] });
  }

  // Rate limit by user when authed, else by IP (anonymous users can still search).
  const session = await getSession();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const decision = guardAiCall({
    feature: "search",
    identity: session ? { kind: "user", id: session.user.id } : { kind: "ip", id: ip },
  });
  if (!decision.allowed) return denyResponse(decision);

  let results: SearchHit[] = [];

  if (mode === "semantic") {
    const queryVec = await embed(query);
    const rows = await db.execute<{
      code: string;
      title: string;
      credits: number;
      category: string | null;
      description: string | null;
      distance: number;
    }>(sql`
      SELECT c.code, c.title, c.credits, c.category, c.description,
             ce.embedding <=> ${JSON.stringify(queryVec)}::vector AS distance
      FROM course_embeddings ce
      JOIN courses c ON c.code = ce.course_code
      ORDER BY distance ASC
      LIMIT ${MAX_RESULTS}
    `);
    results = rows.map((r) => ({
      code: r.code,
      title: r.title,
      credits: r.credits,
      category: r.category,
      description: r.description,
      score: Math.max(0, 1 - r.distance),
    }));
  } else {
    const pattern = `%${query}%`;
    const rows = await db
      .select({
        code: courses.code,
        title: courses.title,
        credits: courses.credits,
        category: courses.category,
        description: courses.description,
      })
      .from(courses)
      .where(or(ilike(courses.code, pattern), ilike(courses.title, pattern)))
      .limit(MAX_RESULTS);
    results = rows.map((r) => ({
      code: r.code,
      title: r.title,
      credits: r.credits,
      category: r.category,
      description: r.description,
      // Keyword scores are flat — UI doesn't really need to compare them.
      score: 1,
    }));
  }

  return apiOk({ results, mode });
}
