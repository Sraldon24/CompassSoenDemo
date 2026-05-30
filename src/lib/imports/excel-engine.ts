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
    const status = cellStr(r[5] ?? r[4]);
    let notes = cellStr(r[6] ?? r[5]) || null;

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
      errors.push(`"${code}" is not a valid course code`);
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
