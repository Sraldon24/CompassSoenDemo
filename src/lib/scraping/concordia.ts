/**
 * Concordia calendar HTML parser.
 *
 * Pure functions only — accepts HTML strings, returns parsed course objects.
 * No DB, no fetch. The orchestrator in scripts/scrape-concordia.ts wires this
 * up to live URLs and diffs against the catalog.
 *
 * Page structure (verified 2026-05 against §71.70.10):
 *   <div class='course' title='comp-108'>
 *     <div class='title'>COMP 108 Computer Science ... (3 credits)</div>
 *     <span class='requisites'>Permission of the GCS is required.</span>
 *     <p class='crse-descr'>Description text...</p>
 *     <span class='components'>"Lecture"</span>
 *   </div>
 */

import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export interface ScrapedCourse {
  /** "COMP 108" — normalized with single space, uppercase prefix. */
  code: string;
  /** Course title only — e.g. "Computer Science C.Edge Option Reflective Learning I". */
  title: string;
  /** Credit hours (3, 3.5, 6, etc.). 0 means parser failed to extract. */
  credits: number;
  /** Raw prereq text — e.g. "Permission of the GCS is required." Empty if none stated. */
  prereqText: string;
  /** Raw course description. */
  description: string;
  /** "Lecture", "Lecture and Lab", etc. Empty if not stated. */
  components: string;
}

/** Parses one Concordia calendar HTML page and returns every course it finds. */
export function parseConcordiaCalendar(html: string): ScrapedCourse[] {
  const $ = cheerio.load(html);
  const courses: ScrapedCourse[] = [];

  $("div.course").each((_, el) => {
    const $el = $(el);
    const titleRaw = $el.find("div.title").first().text().trim();
    if (!titleRaw) return;

    const parsed = parseTitleLine(titleRaw);
    if (!parsed) return;

    // Concordia wraps every metadata block as <p><h4>Label:</h4>body…</p>, but
    // HTML5 auto-closes <p> before <h4>, making the body a SIBLING of the <p>,
    // not a descendant. So we look up labels via heading text and grab the
    // adjacent text. Robust against class-name changes too.
    const prereqText = extractSectionByLabel($, $el, /prerequisite|corequisite/i);
    const description = extractSectionByLabel($, $el, /description/i);
    const components = extractSectionByLabel($, $el, /component/i)
      .replace(/["']/g, "")
      .trim();

    courses.push({
      code: parsed.code,
      title: parsed.title,
      credits: parsed.credits,
      prereqText,
      description,
      components,
    });
  });

  return courses;
}

/**
 * Finds an <h4> whose text matches `labelPattern` inside `$container` and
 * returns the text content immediately following it, stopping at the next h4
 * or the end of the container. Returns "" if no match.
 */
function extractSectionByLabel(
  $: cheerio.CheerioAPI,
  $container: cheerio.Cheerio<AnyNode>,
  labelPattern: RegExp,
): string {
  const $h4 = $container.find("h4").filter((_, el) => labelPattern.test($(el).text()));
  if ($h4.length === 0) return "";

  // Collect text from siblings after the h4 until we hit another h4 or the
  // structural end of this metadata block.
  const parts: string[] = [];
  let node: AnyNode | null = $h4.first()[0]?.nextSibling ?? null;
  while (node) {
    if (node.type === "tag") {
      const tagName = (node as Element).tagName?.toLowerCase();
      if (tagName === "h4") break;
      parts.push($(node).text());
    } else if (node.type === "text") {
      parts.push((node as { data?: string }).data ?? "");
    }
    node = node.nextSibling;
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Splits a title line like
 *   "COMP 108 Computer Science C.Edge Option (3 credits)"
 * into structured parts. Returns null if the line doesn't match.
 *
 * Exported for unit testing.
 */
export function parseTitleLine(
  line: string,
): { code: string; title: string; credits: number } | null {
  // Match: <PREFIX> <NUMBER> <TITLE> (<CREDITS> credits)
  const match = line.match(
    /^([A-Z]{3,4})\s+(\d{3,4}[A-Z]?)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*credits?\)/i,
  );
  if (!match) return null;
  const [, prefix, number, titleText, creditsStr] = match;
  if (!prefix || !number || !titleText || !creditsStr) return null;

  return {
    code: `${prefix.toUpperCase()} ${number}`,
    title: titleText.trim(),
    credits: Number.parseFloat(creditsStr),
  };
}

// ---------- Diff helpers --------------------------------------------------

export type ChangeKind = "added" | "removed" | "title" | "credits" | "prereq" | "description";

export interface CourseChange {
  code: string;
  kind: ChangeKind;
  oldValue: string | number | null;
  newValue: string | number | null;
}

/** Catalog row shape we diff against — matches src/lib/db/schema.ts subset. */
export interface CatalogCourse {
  code: string;
  title: string;
  credits: number;
  description: string | null;
  // prereqs from DB is a structured object; we serialize for comparison.
  prereqs: { all?: string[]; any?: string[]; concurrent?: string[]; notes?: string } | null;
}

export interface DiffOptions {
  /**
   * Only flag "removed" for catalog codes whose prefix is in this list.
   * Without it, scraping page X for COMP would falsely mark every ENGR / ENCS
   * code in the catalog as removed.
   */
  scopePrefixes?: string[];
}

/**
 * Returns a list of per-field changes between the current catalog and the
 * freshly scraped data. Each change becomes a `scraped_changes` row that an
 * admin reviews before it lands in the live `courses` table.
 *
 * We don't auto-apply diffs — Concordia HTML can break, and a bad parse
 * shouldn't silently overwrite the catalog.
 */
export function diffCatalog(
  catalog: CatalogCourse[],
  scraped: ScrapedCourse[],
  options: DiffOptions = {},
): CourseChange[] {
  const changes: CourseChange[] = [];
  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));
  const scrapedByCode = new Map(scraped.map((c) => [c.code, c]));

  // Added: in scrape but not in catalog.
  for (const s of scraped) {
    if (!catalogByCode.has(s.code)) {
      changes.push({ code: s.code, kind: "added", oldValue: null, newValue: s.title });
    }
  }

  // Removed: in catalog but not in scrape — but only within scopePrefixes,
  // since the scrape covers a subset of all Concordia courses by design.
  const inScope = (code: string) =>
    !options.scopePrefixes || options.scopePrefixes.some((p) => code.startsWith(`${p} `));

  for (const c of catalog) {
    if (!inScope(c.code)) continue;
    if (!scrapedByCode.has(c.code)) {
      changes.push({ code: c.code, kind: "removed", oldValue: c.title, newValue: null });
    }
  }

  // Field-level changes for codes in both.
  for (const s of scraped) {
    const existing = catalogByCode.get(s.code);
    if (!existing) continue;

    if (normalize(existing.title) !== normalize(s.title)) {
      changes.push({
        code: s.code,
        kind: "title",
        oldValue: existing.title,
        newValue: s.title,
      });
    }
    if (existing.credits !== s.credits && s.credits > 0) {
      changes.push({
        code: s.code,
        kind: "credits",
        oldValue: existing.credits,
        newValue: s.credits,
      });
    }
    // Compare description only if catalog has one — early seed rows might be null.
    if (
      existing.description &&
      s.description &&
      normalize(existing.description) !== normalize(s.description)
    ) {
      changes.push({
        code: s.code,
        kind: "description",
        oldValue: existing.description,
        newValue: s.description,
      });
    }
    if (s.prereqText && !prereqTextMatchesCatalog(s.prereqText, existing.prereqs)) {
      changes.push({
        code: s.code,
        kind: "prereq",
        oldValue: existing.prereqs ? JSON.stringify(existing.prereqs) : null,
        newValue: s.prereqText,
      });
    }
  }

  return changes;
}

/** Collapses whitespace + strips smart-quote and unicode-hyphen variants so we
 * don't churn on cosmetic edits. Concordia's HTML sometimes uses non-breaking
 * spaces and U+2011 (non-breaking hyphen) where plain ASCII would do. */
function normalize(s: string): string {
  return (
    s
      .replace(/\s+/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      // Map every Unicode hyphen/dash variant (‐, ‑, ‒, –, —, ―, ﹣, －) to
      // plain ASCII "-" so title-case churn doesn't trigger false diffs.
      .replace(/[‐-―﹣－]/g, "-")
      .trim()
  );
}

/** Best-effort: don't flag a prereq diff if every catalog requisite appears
 * in the scraped text. Catches the common "no real change, just reformatted"
 * case without forcing exact-string equality. */
function prereqTextMatchesCatalog(
  scrapedText: string,
  catalogPrereqs: CatalogCourse["prereqs"],
): boolean {
  if (!catalogPrereqs) return false;
  const lower = scrapedText.toLowerCase();
  const all = [...(catalogPrereqs.all ?? []), ...(catalogPrereqs.any ?? [])];
  if (all.length === 0) return true; // catalog has no structured prereqs to verify
  return all.every((code) => lower.includes(code.toLowerCase()));
}
