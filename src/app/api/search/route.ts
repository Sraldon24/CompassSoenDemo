import { embed } from "@/lib/ai/embeddings";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { LIMITS, rateLimitByIp } from "@/lib/rate-limit";
import { ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

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
    return NextResponse.json({ results: [] });
  }

  // Rate limit by IP (cheap protection — anonymous users can still search).
  const session = await getSession();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = rateLimitByIp(
    session?.user.id ?? ip,
    "search",
    LIMITS.search.limit,
    LIMITS.search.windowMs,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Search rate limit reached." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

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

  return NextResponse.json({ results, mode });
}
