/**
 * Excel import endpoint.
 *
 * Accepts a multipart upload, parses with the same logic as scripts/parse-excel.ts,
 * and returns a preview. The caller separately confirms which rows to commit.
 */

import { db } from "@/lib/db";
import { courses, importJobs, userCourses } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { LIMITS, rateLimitByUserId } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = (string | number | null)[];

interface ImportRow {
  index: number;
  courseCode: string;
  term: string;
  year: number;
  status: "planned" | "enrolled" | "completed" | "transferred" | "dropped" | "disc" | "failed";
  notes: string | null;
  /** Issues blocking commit; non-empty = will be skipped. */
  errors: string[];
}

function cellStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function statusFromString(s: string): ImportRow["status"] {
  const t = s.toLowerCase();
  if (t.includes("done") || t.includes("transfer")) return "transferred";
  if (t.includes("in progress") || t.includes("enrolled")) return "enrolled";
  if (t.includes("disc")) return "disc";
  if (t.includes("drop")) return "dropped";
  if (t.includes("fail")) return "failed";
  return "planned";
}

function termYear(t: string): number {
  const m = t.match(/(\d{4})/);
  return m?.[1] ? Number(m[1]) : 0;
}

async function parseWorkbook(
  buf: ArrayBuffer,
  validCourseCodes: Set<string>,
): Promise<ImportRow[]> {
  const wb = XLSX.read(buf, { type: "array" });

  // Look for the "Term Plan" sheet first (Excel v6 format); fall back to the
  // first sheet with a column header containing "Term" + "Course".
  const target =
    wb.SheetNames.find((n) => n.toLowerCase().includes("term plan")) ?? wb.SheetNames[0];
  if (!target) return [];
  const ws = wb.Sheets[target];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null });

  const out: ImportRow[] = [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!r) continue;
    if (
      cellStr(r[0]).toLowerCase().includes("term") &&
      cellStr(r[1]).toLowerCase().includes("course")
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 2;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const term = cellStr(r[0]).trim();
    const code = cellStr(r[1]).trim();
    if (!code) continue;
    const status = cellStr(r[5] ?? r[4]);
    const notes = cellStr(r[6] ?? r[5]) || null;

    const errors: string[] = [];
    if (!/^[A-Z]{3,4}\s*\d{3}$/.test(code)) {
      errors.push(`"${code}" is not a valid course code`);
    }
    if (!/^(Fall|Winter|Summer)\s+\d{4}$/.test(term)) {
      errors.push(`"${term}" is not a recognized term (need "Fall 2026")`);
    }
    if (errors.length === 0 && !validCourseCodes.has(code)) {
      errors.push(`${code} is not in the course catalog yet`);
    }

    out.push({
      index: i,
      courseCode: code,
      term,
      year: termYear(term),
      status: statusFromString(status),
      notes,
      errors,
    });
  }

  return out;
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limit = rateLimitByUserId(
    session.user.id,
    "import",
    LIMITS.import.limit,
    LIMITS.import.windowMs,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Hourly import limit reached." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const mode = (form.get("mode") as "preview" | "commit") ?? "preview";
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  // Hard size cap. Real Concordia plans are <100 KB; 5 MB gives plenty of headroom
  // while protecting against accidental or malicious oversized uploads from OOMing Node.
  const MAX_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`,
      },
      { status: 413 },
    );
  }

  const buf = await file.arrayBuffer();

  // Pull all valid course codes for validation.
  const catalogRows = await db.select({ code: courses.code }).from(courses);
  const validCodes = new Set(catalogRows.map((r) => r.code));

  const parsed = await parseWorkbook(buf, validCodes);

  if (mode === "preview") {
    return NextResponse.json({
      total: parsed.length,
      ok: parsed.filter((r) => r.errors.length === 0).length,
      errored: parsed.filter((r) => r.errors.length > 0).length,
      rows: parsed,
    });
  }

  // Commit mode — open a job row, replace user's plan with valid rows.
  const skipErrors = form.get("skipErrors") === "true";
  const usable = skipErrors ? parsed.filter((r) => r.errors.length === 0) : parsed;
  const hasErrors = usable.some((r) => r.errors.length > 0);
  if (hasErrors) {
    return NextResponse.json(
      { error: "Some rows have errors. Re-submit with skipErrors=true to ignore them." },
      { status: 400 },
    );
  }

  const [job] = await db
    .insert(importJobs)
    .values({
      userId: session.user.id,
      source: "excel",
      filename: file.name,
      status: "processing",
      rowsProcessed: parsed.length,
    })
    .returning({ id: importJobs.id });

  if (!job) {
    return NextResponse.json({ error: "Failed to create import job" }, { status: 500 });
  }

  // Wipe-and-replace the plan inside a transaction so a partial-insert failure
  // rolls back the wipe — never leave the user with a half-corrupted plan.
  let inserted = 0;
  try {
    inserted = await db.transaction(async (tx) => {
      await tx.delete(userCourses).where(eq(userCourses.userId, session.user.id));
      let count = 0;
      for (const r of usable) {
        await tx.insert(userCourses).values({
          userId: session.user.id,
          courseCode: r.courseCode,
          term: r.term,
          year: r.year,
          status: r.status,
          notes: r.notes,
        });
        count += 1;
      }
      return count;
    });
  } catch (err) {
    // The transaction rolled back the wipe; mark the job as failed and surface a 500.
    await db
      .update(importJobs)
      .set({
        status: "failed",
        rowsImported: 0,
        errors: [{ row: 0, message: err instanceof Error ? err.message : "Unknown DB error" }],
        completedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id));
    return NextResponse.json(
      { error: "Import failed and was rolled back. Your existing plan is unchanged." },
      { status: 500 },
    );
  }

  await db
    .update(importJobs)
    .set({
      status: "complete",
      rowsImported: inserted,
      completedAt: new Date(),
    })
    .where(eq(importJobs.id, job.id));

  return NextResponse.json({ jobId: job.id, imported: inserted });
}
