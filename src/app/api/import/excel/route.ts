/**
 * Excel import endpoint.
 *
 * Thin orchestration: auth, rate-limit, size cap, then hand the buffer to the
 * pure `parseExcelPlan` engine and persist the result. Parse + validate logic
 * lives in `@/lib/imports/excel-engine` (unit-tested without DB/HTTP).
 */

import { getSession } from "@/lib/auth/get-session";
import { db } from "@/lib/data/db";
import { checklistItems, courses, importJobs, userCourses } from "@/lib/data/schema";
import { extractMilestones, parseExcelPlan } from "@/lib/imports/excel-engine";
import { denyResponse, guardAiCall } from "@/lib/limits";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const decision = guardAiCall({
    feature: "import",
    identity: { kind: "user", id: session.user.id },
  });
  if (!decision.allowed) return denyResponse(decision);

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

  const parsed = parseExcelPlan(buf, validCodes);

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

  // Optional per-row selection: the client may send the row indices the user
  // ticked in the preview. When present, only those rows are imported; when
  // absent (older client / "commit all"), every parsed row is eligible.
  const selectedRaw = form.get("selectedIndices");
  const selected =
    typeof selectedRaw === "string" && selectedRaw.length > 0
      ? new Set(selectedRaw.split(",").map((n) => Number(n)))
      : null;

  const chosen = selected ? parsed.filter((r) => selected.has(r.index)) : parsed;
  const usable = skipErrors ? chosen.filter((r) => r.errors.length === 0) : chosen;
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
  // Non-course milestones (e.g. EWT) land on the Deadlines checklist, not the
  // planner board. Only routed when the user is committing the whole file
  // (no explicit row selection) so a partial course import doesn't silently
  // add checklist items the user didn't choose.
  const milestones = selected ? [] : extractMilestones(buf, validCodes);

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
      // Upsert milestones as checklist items (skip dupes by task text).
      for (const m of milestones) {
        const existing = await tx
          .select({ id: checklistItems.id })
          .from(checklistItems)
          .where(and(eq(checklistItems.userId, session.user.id), eq(checklistItems.task, m.task)))
          .limit(1);
        if (existing.length === 0) {
          await tx.insert(checklistItems).values({
            userId: session.user.id,
            task: m.task,
            category: "Imported milestone",
            notes: m.notes,
          });
        }
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
