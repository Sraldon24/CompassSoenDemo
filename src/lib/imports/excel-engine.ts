/**
 * Excel import engine — pure parse + validate.
 *
 * Buffer in, validated rows out. No DB, no auth, no HTTP. `XLSX.read` runs on
 * the in-memory buffer, so this whole module is in-process and unit-testable
 * with a fabricated workbook. The route owns the I/O boundary (catalog fetch,
 * transaction, importJobs, rate-limit) and passes the known-code set in.
 */

import { cellStr, isCourseCode, statusFromString } from "@/lib/courses/code";
import type { UserCourseStatus } from "@/lib/courses/code";
import { TERM_REGEX, termYear } from "@/lib/term";
import * as XLSX from "xlsx";

type Row = (string | number | null)[];

export interface ImportRow {
  index: number;
  courseCode: string;
  term: string;
  year: number;
  status: UserCourseStatus;
  notes: string | null;
  /** Issues blocking commit; non-empty = will be skipped. */
  errors: string[];
}

/**
 * Parse a Concordia "Term Plan"-style workbook into validated import rows.
 *
 * `knownCodes` is the catalog set, passed in so the engine stays pure. Format
 * validation runs first; the catalog-membership check only fires once a row's
 * format is clean (so a malformed code surfaces one clear error, not two).
 */
export function parseExcelPlan(buffer: ArrayBuffer, knownCodes: ReadonlySet<string>): ImportRow[] {
  const wb = XLSX.read(buffer, { type: "array" });

  // Prefer the "Term Plan" sheet (Excel v6 format); else the first sheet.
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
    const rawCode = cellStr(r[1]).trim();
    if (!rawCode) continue;
    const type = cellStr(r[4]); // "Type" column — may say "Transfer"/"Transferred"
    const rawStatus = cellStr(r[5] ?? r[4]);
    let notes = cellStr(r[6] ?? r[5]) || null;

    // A row counts as transferred credit when either the Status or the Type
    // column mentions transfer (e.g. CEGEP credits). statusFromString already
    // maps "transfer" -> "transferred"; fold Type in so Type="Transfer" wins.
    const status = /transfer/i.test(type) ? "transferred" : rawStatus;

    // Some planners split a capstone into "SOEN 490a"/"490b". The catalog only
    // has the base "SOEN 490", so fold a trailing letter onto the base code
    // when (and only when) the base is a real catalog entry.
    let code = rawCode.toUpperCase();
    if (!knownCodes.has(code)) {
      const base = code.replace(/([A-Z]{3,4}\s\d{3,4})[A-Z]$/, "$1");
      if (base !== code && knownCodes.has(base)) {
        notes = notes ? `${notes} (was ${rawCode})` : `Imported as ${rawCode}`;
        code = base;
      }
    }

    const errors: string[] = [];
    if (!isCourseCode(code)) {
      // Echo what the user actually typed, not the upper-cased/folded form.
      errors.push(`"${rawCode}" is not a valid course code`);
    }
    if (!TERM_REGEX.test(term)) {
      errors.push(`"${term}" is not a recognized term (need "Fall 2026")`);
    }
    if (errors.length === 0 && !knownCodes.has(code)) {
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

export interface ImportMilestone {
  /** Short label shown as a checklist task, e.g. "EWT retake". */
  task: string;
  /** Optional free-text detail from the Notes column. */
  notes: string | null;
}

/**
 * Extract non-course milestones (e.g. the English Writing Test) from the same
 * Term Plan sheet. These are rows whose "Course" cell isn't a real course code
 * but represent a tracked requirement — they belong on the Deadlines checklist,
 * not the planner board. Kept separate from parseExcelPlan so that function
 * stays a pure course parser and its existing tests are unaffected.
 */
export function extractMilestones(
  buffer: ArrayBuffer,
  knownCodes: ReadonlySet<string>,
): ImportMilestone[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const target =
    wb.SheetNames.find((n) => n.toLowerCase().includes("term plan")) ?? wb.SheetNames[0];
  if (!target) return [];
  const ws = wb.Sheets[target];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null });

  const out: ImportMilestone[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    const label = cellStr(r[1]).trim();
    if (!label) continue;
    const type = cellStr(r[4]);
    const notes = cellStr(r[6] ?? r[5]) || null;

    // A milestone is a non-course row that's either explicitly "Required" in the
    // Type column or mentions the EWT. Skip anything that IS a real course code
    // (those are handled by parseExcelPlan) and obvious header rows.
    const upper = label.toUpperCase();
    const looksLikeCourse = isCourseCode(upper) || knownCodes.has(upper);
    const isMilestone = !looksLikeCourse && (/required/i.test(type) || /\bEWT\b/i.test(label));
    if (!isMilestone) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ task: label, notes });
  }
  return out;
}
