/**
 * Excel → JSON seed files.
 *
 * Reads the user's hand-curated `Concordia_SOEN_Degree_Planner_v6.xlsx` and
 * emits structured JSON for the SOEN Compass seed pipeline.
 *
 *   Inputs:  ~/Downloads/Concordia_SOEN_Degree_Planner_v6.xlsx  (default; override with --in)
 *   Outputs: data/seed/courses.json
 *            data/seed/deficiencies.json
 *            data/seed/electives.json
 *            data/seed/user-plan-amir.json
 *
 * Idempotent. Re-run anytime the source spreadsheet changes.
 *
 * Run with:  npx tsx scripts/parse-excel.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

// ---------- Types --------------------------------------------------------

type Row = (string | number | null)[];

interface ParsedCourse {
  code: string;
  title: string;
  credits: number;
  category:
    | "eng_core"
    | "se_core"
    | "eng_nsci_group"
    | "nat_sci_elective"
    | "soen_elective"
    | "gen_ed_humanities"
    | "deficiency"
    | null;
  prereqs: { all?: string[]; any?: string[]; concurrent?: string[]; notes?: string };
  unlocks: string[];
  notes: string | null;
}

interface ParsedDeficiency {
  code: string;
  title: string;
  credits: number;
  prereqText: string | null;
  plannedTerm: string | null;
  status: string;
}

interface ParsedElective {
  code: string;
  title: string;
  credits: number;
  category: "nat_sci_elective" | "soen_elective" | "eng_nsci_group";
  prereqText: string | null;
  difficulty: "light" | "medium" | "hard" | null;
  notes: string | null;
}

interface ParsedUserCourse {
  courseCode: string;
  term: string;
  year: number;
  status: "planned" | "enrolled" | "completed" | "transferred" | "dropped" | "disc" | "failed";
  notes: string | null;
}

// ---------- Helpers ------------------------------------------------------

function readSheet(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) {
    throw new Error(`Sheet "${name}" not found`);
  }
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null });
}

const COURSE_CODE_RE = /\b([A-Z]{3,4})\s*(\d{3})\b/g;

function cellStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function extractCourseCodes(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(COURSE_CODE_RE)) {
    const code = `${m[1]} ${m[2]}`;
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/**
 * Parse the freeform "Notes" / "Unlocks" / "Prereq" cells in the spreadsheet.
 * Examples we handle:
 *   "Needs MATH 205"                       → all: [MATH 205]
 *   "Needs SOEN 341+ENCS 282"              → all: [SOEN 341, ENCS 282]
 *   "Needs COMP 232+249"                   → all: [COMP 232, COMP 249]
 *   "Needs SOEN 345+357 (concurrent OK)"   → concurrent: [SOEN 345, SOEN 357]
 *   "COMP 352 (concurrent OK)"             → concurrent: [COMP 352]
 *   "MATH 203"                             → all: [MATH 203]
 *   "BIOL 201/202"                         → any: [BIOL 201, BIOL 202]
 */
function parsePrereqText(raw: string): {
  all: string[];
  any: string[];
  concurrent: string[];
  notes?: string;
} {
  const result = { all: [] as string[], any: [] as string[], concurrent: [] as string[] };
  if (!raw || raw.toLowerCase().includes("none")) {
    return result;
  }

  const text = raw.replace(/\s+/g, " ").trim();
  const isConcurrent = /concurrent ok|co-?req|coreq/i.test(text);

  // Handle "X/Y" patterns first (alternative prereqs).
  const slashPart = text.match(/\b[A-Z]{3,4}\s*\d{3}(?:\/\d{3})+/g);
  if (slashPart) {
    for (const part of slashPart) {
      const m = part.match(/^([A-Z]{3,4})\s*(\d{3})((?:\/\d{3})+)/);
      if (!m) continue;
      const prefix = m[1] ?? "";
      const first = m[2] ?? "";
      const rest = (m[3] ?? "").split("/").filter(Boolean);
      const codes = [`${prefix} ${first}`, ...rest.map((d) => `${prefix} ${d}`)];
      result.any.push(...codes);
    }
  }

  // Handle "X+Y" or "X + Y" patterns (sibling prereqs).
  const plusSegments = text.split(/[,+]/).flatMap((s) => s.split(" and "));
  const allCodes = new Set<string>();
  for (const segment of plusSegments) {
    for (const code of extractCourseCodes(segment)) {
      // Skip the codes we already routed to `any`.
      if (!result.any.includes(code)) {
        allCodes.add(code);
      }
    }
  }

  // Distribute between `all` and `concurrent` based on the concurrent hint.
  for (const c of allCodes) {
    if (isConcurrent) {
      result.concurrent.push(c);
    } else {
      result.all.push(c);
    }
  }

  return result;
}

function categoryFromString(s: string | null): ParsedCourse["category"] {
  if (!s) return null;
  const t = s.toUpperCase().trim();
  if (t.includes("ENG CORE")) return "eng_core";
  if (t.includes("SE CORE")) return "se_core";
  if (t.includes("ENG&NSCI") || t.includes("ENG & NAT SCI") || t.includes("ENG&NAT"))
    return "eng_nsci_group";
  if (t.includes("NAT SCI")) return "nat_sci_elective";
  if (t.includes("SOEN ELEC")) return "soen_elective";
  if (t.includes("GEN ED")) return "gen_ed_humanities";
  if (t.includes("DEFICIENCY")) return "deficiency";
  return null;
}

function statusFromString(s: string | null): ParsedUserCourse["status"] {
  if (!s) return "planned";
  const t = s.toLowerCase();
  if (t.includes("done") || t.includes("transfer")) return "transferred";
  if (t.includes("in progress") || t.includes("enrolled")) return "enrolled";
  if (t.includes("disc")) return "disc";
  if (t.includes("drop")) return "dropped";
  if (t.includes("fail")) return "failed";
  return "planned";
}

function termYear(termLabel: string): number {
  const m = termLabel.match(/(\d{4})/);
  return m?.[1] ? Number(m[1]) : 0;
}

function difficultyFromCell(s: string | null): ParsedElective["difficulty"] {
  if (!s) return null;
  if (/🟢|light/i.test(s)) return "light";
  if (/🟡|medium/i.test(s)) return "medium";
  if (/🔴|hard/i.test(s)) return "hard";
  return null;
}

// ---------- Main parse ---------------------------------------------------

function parseTermPlan(wb: XLSX.WorkBook): {
  courses: Map<string, ParsedCourse>;
  userPlan: ParsedUserCourse[];
} {
  const rows = readSheet(wb, "📅 Term Plan");
  const courses = new Map<string, ParsedCourse>();
  const userPlan: ParsedUserCourse[] = [];

  // Header is on row index 2; data starts at row 3.
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const term = cellStr(r[0]).trim();
    const code = cellStr(r[1]).trim();
    const title = cellStr(r[2]).trim();
    const credits = typeof r[3] === "number" ? r[3] : Number.parseFloat(cellStr(r[3]));
    const typeStr = cellStr(r[4]);
    const statusStr = cellStr(r[5]);
    const notes = cellStr(r[6]) || null;

    // Skip blank rows + the final graduation row.
    if (!code || code === "GRADUATION" || code === "EWT retake") continue;
    if (!Number.isFinite(credits)) continue;
    // Skip placeholders like "TBD" or "Nat Sci Elective 2".
    if (!/^[A-Z]{3,4}\s*\d{3}$/.test(code)) continue;

    if (!courses.has(code)) {
      courses.set(code, {
        code,
        title,
        credits: credits || 0,
        category: categoryFromString(typeStr),
        prereqs: { all: [], any: [], concurrent: [], notes: notes ?? undefined },
        unlocks: [],
        notes,
      });
    }

    // Derive prereqs from the Notes column when it says "Needs X".
    if (notes && /needs/i.test(notes)) {
      const needsBlob = notes.replace(/^[^N]*needs/i, "").trim();
      const parsed = parsePrereqText(needsBlob);
      const existing = courses.get(code);
      if (existing) {
        for (const p of parsed.all)
          if (!existing.prereqs.all?.includes(p)) existing.prereqs.all?.push(p);
        for (const p of parsed.any)
          if (!existing.prereqs.any?.includes(p)) existing.prereqs.any?.push(p);
        for (const p of parsed.concurrent)
          if (!existing.prereqs.concurrent?.includes(p)) existing.prereqs.concurrent?.push(p);
      }
    }

    userPlan.push({
      courseCode: code,
      term,
      year: termYear(term),
      status: statusFromString(statusStr),
      notes,
    });
  }

  return { courses, userPlan };
}

function enrichPrereqMap(wb: XLSX.WorkBook, courses: Map<string, ParsedCourse>): void {
  const rows = readSheet(wb, "🗺️ Prereq Map");
  for (const r of rows) {
    if (!r) continue;
    const code = cellStr(r[0])
      .trim()
      .replace(/\s*\(.*\)\s*/, "");
    if (!/^[A-Z]{3,4}\s*\d{3}$/.test(code)) continue;
    const existing = courses.get(code);
    if (!existing) continue;

    // The "Unlocks" cell can land at column 4 or 5 depending on which sub-table.
    const unlocksCell =
      cellStr(r[4]).startsWith("→") || cellStr(r[4]).includes(",") ? cellStr(r[4]) : cellStr(r[5]);
    if (unlocksCell) {
      const downstream = extractCourseCodes(unlocksCell.replace(/^→\s*/, ""));
      for (const d of downstream) if (!existing.unlocks.includes(d)) existing.unlocks.push(d);
    }
  }

  // Use `unlocks` to derive `prereqs.all` on the downstream course where missing.
  for (const [code, course] of courses.entries()) {
    for (const downstream of course.unlocks) {
      const target = courses.get(downstream);
      if (!target) continue;
      if (
        !target.prereqs.all?.includes(code) &&
        !target.prereqs.any?.includes(code) &&
        !target.prereqs.concurrent?.includes(code)
      ) {
        target.prereqs.all?.push(code);
      }
    }
  }
}

function parseRequirements(wb: XLSX.WorkBook, courses: Map<string, ParsedCourse>): void {
  // The Requirements sheet has authoritative category info; let it override Term Plan's guess.
  const rows = readSheet(wb, "✅ Requirements");
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const cat = cellStr(r[0]);
    const code = cellStr(r[1]).trim();
    if (!/^[A-Z]{3,4}\s*\d{3}$/.test(code)) continue;
    const c = courses.get(code);
    if (c) {
      const mapped = categoryFromString(cat);
      if (mapped) c.category = mapped;
    }
  }
}

function parseDeficiencies(wb: XLSX.WorkBook): ParsedDeficiency[] {
  const rows = readSheet(wb, "⚠️ Deficiencies");
  const out: ParsedDeficiency[] = [];
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const code = cellStr(r[0]).trim();
    if (!/^[A-Z]{3,4}\s*\d{3}$/.test(code)) continue;
    const title = cellStr(r[1]).trim();
    const credits = typeof r[2] === "number" ? r[2] : Number.parseFloat(cellStr(r[2]));
    out.push({
      code,
      title,
      credits: credits || 0,
      prereqText: cellStr(r[3]) || null,
      plannedTerm: cellStr(r[4]) || null,
      status: cellStr(r[5]) || "Planned",
    });
  }
  return out;
}

function parseElectives(wb: XLSX.WorkBook): ParsedElective[] {
  const rows = readSheet(wb, "📚 Electives");
  const out: ParsedElective[] = [];
  let currentCategory: ParsedElective["category"] = "nat_sci_elective";
  for (const r of rows) {
    if (!r) continue;
    const cell0 = cellStr(r[0]);
    if (cell0.includes("NATURAL SCIENCE")) {
      currentCategory = "nat_sci_elective";
      continue;
    }
    if (cell0.includes("SOEN ELECTIVES")) {
      currentCategory = "soen_elective";
      continue;
    }
    if (cell0.includes("ENGINEERING & NATURAL SCIENCE")) {
      currentCategory = "eng_nsci_group";
      continue;
    }

    const code = cell0.trim();
    if (!/^[A-Z]{3,4}\s*\d{3}$/.test(code)) continue;
    const title = cellStr(r[1]).trim();
    const credits = typeof r[2] === "number" ? r[2] : Number.parseFloat(cellStr(r[2]));
    out.push({
      code,
      title,
      credits: credits || 0,
      category: currentCategory,
      prereqText: cellStr(r[3]) || null,
      difficulty: difficultyFromCell(cellStr(r[4])),
      notes: cellStr(r[6]) || cellStr(r[5]) || null,
    });
  }
  return out;
}

// ---------- Main ---------------------------------------------------------

function main(): void {
  const inFlag = process.argv.indexOf("--in");
  const inPath =
    inFlag >= 0 && process.argv[inFlag + 1]
      ? (process.argv[inFlag + 1] as string)
      : `${homedir()}/Downloads/Concordia_SOEN_Degree_Planner_v6.xlsx`;

  if (!existsSync(inPath)) {
    console.error(`✗ Excel file not found: ${inPath}`);
    process.exit(1);
  }

  const outDir = resolve(process.cwd(), "data/seed");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`→ Reading ${inPath}`);
  const wb = XLSX.read(readFileSync(inPath), { type: "buffer" });

  console.log("→ Parsing Term Plan");
  const { courses, userPlan } = parseTermPlan(wb);

  console.log("→ Enriching with Prereq Map");
  enrichPrereqMap(wb, courses);

  console.log("→ Reconciling categories from Requirements");
  parseRequirements(wb, courses);

  console.log("→ Parsing Deficiencies");
  const deficiencies = parseDeficiencies(wb);

  console.log("→ Parsing Electives");
  const electives = parseElectives(wb);

  // Add any elective courses not already in the courses map so seeding has them.
  for (const e of electives) {
    if (!courses.has(e.code)) {
      courses.set(e.code, {
        code: e.code,
        title: e.title,
        credits: e.credits,
        category: e.category,
        prereqs: e.prereqText
          ? { ...parsePrereqText(e.prereqText), notes: e.prereqText }
          : { all: [], any: [], concurrent: [] },
        unlocks: [],
        notes: e.notes,
      });
    }
  }

  // Add deficiencies as deficiency-category courses.
  for (const d of deficiencies) {
    if (!courses.has(d.code)) {
      courses.set(d.code, {
        code: d.code,
        title: d.title,
        credits: d.credits,
        category: "deficiency",
        prereqs: d.prereqText
          ? { ...parsePrereqText(d.prereqText), notes: d.prereqText }
          : { all: [], any: [], concurrent: [] },
        unlocks: [],
        notes: null,
      });
    } else {
      const c = courses.get(d.code);
      if (c && !c.category) c.category = "deficiency";
    }
  }

  const coursesArr = [...courses.values()].sort((a, b) => a.code.localeCompare(b.code));

  // Write outputs.
  const coursesOut = resolve(outDir, "courses.json");
  const deficiencyOut = resolve(outDir, "deficiencies.json");
  const electivesOut = resolve(outDir, "electives.json");
  const userPlanOut = resolve(outDir, "user-plan-amir.json");

  writeFileSync(coursesOut, JSON.stringify(coursesArr, null, 2));
  writeFileSync(deficiencyOut, JSON.stringify(deficiencies, null, 2));
  writeFileSync(electivesOut, JSON.stringify(electives, null, 2));
  writeFileSync(userPlanOut, JSON.stringify(userPlan, null, 2));

  console.log(`\n✓ Wrote ${coursesArr.length} courses → ${coursesOut}`);
  console.log(`✓ Wrote ${deficiencies.length} deficiencies → ${deficiencyOut}`);
  console.log(`✓ Wrote ${electives.length} electives → ${electivesOut}`);
  console.log(`✓ Wrote ${userPlan.length} user plan entries → ${userPlanOut}`);

  // Quick sanity stats.
  const withPrereqs = coursesArr.filter(
    (c) =>
      (c.prereqs.all && c.prereqs.all.length > 0) ||
      (c.prereqs.any && c.prereqs.any.length > 0) ||
      (c.prereqs.concurrent && c.prereqs.concurrent.length > 0),
  );
  console.log(
    `\n  ${withPrereqs.length}/${coursesArr.length} courses have at least one prereq mapped.`,
  );
  const totalCredits = userPlan.reduce((sum, p) => {
    const c = courses.get(p.courseCode);
    return sum + (c?.credits ?? 0);
  }, 0);
  console.log(`  User plan total credits: ${totalCredits}`);
}

main();
