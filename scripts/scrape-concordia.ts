/**
 * scrape-concordia.ts
 *
 * Phase 4 cron-style scraper. Fetches the canonical Concordia calendar pages,
 * parses them with cheerio, diffs against the live `courses` table, and writes
 * any discovered changes into `scraped_changes` for admin review.
 *
 * Idempotent: if no diffs are found, no rows are inserted.
 * Conservative: never mutates the `courses` table directly — only proposes.
 *
 * CLI:
 *   npm run scrape:courses                         # full run, all pages
 *   npm run scrape:courses -- --dry-run            # parse + diff but don't insert
 *   npm run scrape:courses -- --page 71-70-10      # one page only
 *
 * On Railway: wire as a weekly cron via `railway run npm run scrape:courses`.
 */

import { db } from "../src/lib/db";
import { courses, scrapedChanges } from "../src/lib/db/schema";
import {
  type CatalogCourse,
  type CourseChange,
  diffCatalog,
  parseConcordiaCalendar,
} from "../src/lib/scraping/concordia";

/**
 * Concordia calendar pages to scrape.
 *
 * Each page has a `prefixes` allowlist — only codes starting with one of these
 * prefixes are considered "owned" by that page. Without this, COMP/SOEN codes
 * from §71.70.10 would falsely flag every ENGR/ENCS code in our catalog as
 * "removed" (they live in other sections we don't scrape yet).
 *
 * §71.70.9 is degree requirements (prose + tables) and doesn't contain
 * `div.course` blocks, so the parser correctly returns 0 from it — we keep
 * it commented out as a TODO until we write a degree-requirements parser.
 */
const PAGES: Array<{ id: string; url: string; prefixes: string[] }> = [
  {
    id: "71-70-10",
    url: "https://www.concordia.ca/academics/undergraduate/calendar/current/section-71-gina-cody-school-of-engineering-and-computer-science/section-71-70-department-of-computer-science-and-software-engineering/section-71-70-10-computer-science-and-software-engineering-courses.html",
    prefixes: ["COMP", "SOEN"],
  },
  // TODO: add §71.20 (ENGR/ENCS courses) once we have a parser for the
  // degree-requirements page format.
];

const USER_AGENT = "SOEN-Compass-Bot/1.0 (+https://github.com/Sraldon24/CompassSoenDemo)";

interface CliOptions {
  dryRun: boolean;
  pageFilter: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, pageFilter: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--page") opts.pageFilter = argv[++i] ?? null;
  }
  return opts;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function loadCatalog(): Promise<CatalogCourse[]> {
  const rows = await db
    .select({
      code: courses.code,
      title: courses.title,
      credits: courses.credits,
      description: courses.description,
      prereqs: courses.prereqs,
    })
    .from(courses);
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    credits: r.credits,
    description: r.description,
    prereqs: r.prereqs,
  }));
}

async function persistChanges(changes: CourseChange[], pageId: string): Promise<void> {
  if (changes.length === 0) return;
  await db.insert(scrapedChanges).values(
    changes.map((c) => ({
      source: `concordia:${pageId}`,
      entityType: "course",
      entityId: c.code,
      changeType: c.kind,
      oldValue: c.oldValue !== null ? { value: c.oldValue } : null,
      newValue: c.newValue !== null ? { value: c.newValue } : null,
      status: "pending" as const,
    })),
  );
}

interface PerPageResult {
  pageId: string;
  parsed: number;
  changes: number;
  added: number;
  removed: number;
  modified: number;
  error: string | null;
}

async function processPage(
  pageId: string,
  url: string,
  prefixes: string[],
  catalog: CatalogCourse[],
  opts: CliOptions,
): Promise<PerPageResult> {
  try {
    const html = await fetchPage(url);
    const scraped = parseConcordiaCalendar(html);
    if (scraped.length === 0) {
      return {
        pageId,
        parsed: 0,
        changes: 0,
        added: 0,
        removed: 0,
        modified: 0,
        error: "parser returned 0 courses — HTML structure may have changed",
      };
    }

    const changes = diffCatalog(catalog, scraped, { scopePrefixes: prefixes });
    if (!opts.dryRun) {
      await persistChanges(changes, pageId);
    }

    return {
      pageId,
      parsed: scraped.length,
      changes: changes.length,
      added: changes.filter((c) => c.kind === "added").length,
      removed: changes.filter((c) => c.kind === "removed").length,
      modified: changes.filter((c) => !["added", "removed"].includes(c.kind)).length,
      error: null,
    };
  } catch (err) {
    return {
      pageId,
      parsed: 0,
      changes: 0,
      added: 0,
      removed: 0,
      modified: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const targets = opts.pageFilter ? PAGES.filter((p) => p.id === opts.pageFilter) : PAGES;
  if (targets.length === 0) {
    console.error(
      `[scrape-concordia] Unknown --page id; valid: ${PAGES.map((p) => p.id).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `[scrape-concordia] Scraping ${targets.length} page(s)${opts.dryRun ? " (DRY RUN)" : ""}…`,
  );

  const catalog = await loadCatalog();
  console.log(`[scrape-concordia] Catalog has ${catalog.length} courses to compare against.`);

  const results: PerPageResult[] = [];
  for (const page of targets) {
    const result = await processPage(page.id, page.url, page.prefixes, catalog, opts);
    results.push(result);
    if (result.error) {
      console.error(`  ${page.id.padEnd(10)} → ERROR ${result.error}`);
    } else {
      console.log(
        `  ${page.id.padEnd(10)} → parsed=${result.parsed} changes=${result.changes} (+${result.added} -${result.removed} ~${result.modified})`,
      );
    }
    // Polite pacing for concordia.ca.
    await new Promise((r) => setTimeout(r, 1_500));
  }

  const totalChanges = results.reduce((sum, r) => sum + r.changes, 0);
  console.log(
    `\n[scrape-concordia] Done. ${totalChanges} change(s) ${opts.dryRun ? "would be written" : "written to scraped_changes"}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[scrape-concordia] Fatal:", err);
    process.exit(1);
  });
