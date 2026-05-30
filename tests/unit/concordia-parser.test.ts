/**
 * Unit tests for the Concordia calendar parser + catalog differ.
 *
 * Hits zero network — uses snippet fixtures that mirror the live HTML.
 * Live HTML coverage is in the integration test (gated on internet).
 */

import {
  type CatalogCourse,
  diffCatalog,
  parseConcordiaCalendar,
  parseTitleLine,
} from "@/lib/scraping/concordia";
import { describe, expect, it } from "vitest";

const SAMPLE_COURSE_BLOCK = `
<div class='course' title='comp-108'>
  <div class='c-accordion'>
    <div class='accordion-item border-dark'>
      <h3 class='accordion-header xlarge'>
        <button class='accordion-button collapsed'>
          <div class='title'>COMP 108 Computer Science C.Edge Option Reflective Learning I (3 credits)</div>
        </button>
      </h3>
      <div class='accordion-body'>
        <p><h4>Prerequisite/Corequisite:</h4><span class='requisites'>Permission of the GCS is required.</span></p>
        <p class='crse-descr'><h4>Description:</h4>This course is a reflective learning module.</p>
        <p><h4>Component(s):</h4><span class='components'>"Lecture"</span></p>
      </div>
    </div>
  </div>
</div>
`;

const SAMPLE_TWO_COURSES = `
${SAMPLE_COURSE_BLOCK}
<div class='course' title='comp-472'>
  <div class='title'>COMP 472 Artificial Intelligence (3 credits)</div>
  <span class='requisites'>COMP 352 previously or concurrently.</span>
  <p class='crse-descr'>Introduction to AI search algorithms and knowledge representation.</p>
  <span class='components'>"Lecture and Tutorial"</span>
</div>
`;

describe("parseTitleLine", () => {
  it("parses a standard 3-credit course title", () => {
    expect(parseTitleLine("COMP 472 Artificial Intelligence (3 credits)")).toEqual({
      code: "COMP 472",
      title: "Artificial Intelligence",
      credits: 3,
    });
  });

  it("parses fractional credits (3.5)", () => {
    expect(parseTitleLine("ENGR 213 Linear Algebra (3.5 credits)")).toEqual({
      code: "ENGR 213",
      title: "Linear Algebra",
      credits: 3.5,
    });
  });

  it("parses 6-credit capstone titles", () => {
    expect(
      parseTitleLine("SOEN 490 Capstone Software Engineering Design Project (6 credits)"),
    ).toEqual({
      code: "SOEN 490",
      title: "Capstone Software Engineering Design Project",
      credits: 6,
    });
  });

  it("handles a number suffixed with a letter (e.g. COMP 339)", () => {
    expect(parseTitleLine("COMP 339 Independent Study (3 credits)")?.code).toBe("COMP 339");
  });

  it("uppercases the prefix even if input is lowercase", () => {
    expect(parseTitleLine("comp 248 Object-Oriented Programming I (3 credits)")?.code).toBe(
      "COMP 248",
    );
  });

  it("returns null on a non-course line", () => {
    expect(parseTitleLine("Computer Science Courses")).toBeNull();
    expect(parseTitleLine("")).toBeNull();
    expect(parseTitleLine("Some random heading")).toBeNull();
  });

  it("returns null when credits clause is missing", () => {
    expect(parseTitleLine("COMP 472 Artificial Intelligence")).toBeNull();
  });
});

describe("parseConcordiaCalendar", () => {
  it("extracts one course from a single block", () => {
    const courses = parseConcordiaCalendar(SAMPLE_COURSE_BLOCK);
    expect(courses).toHaveLength(1);
    const first = courses[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.code).toBe("COMP 108");
    expect(first.title).toBe("Computer Science C.Edge Option Reflective Learning I");
    expect(first.credits).toBe(3);
    expect(first.prereqText).toBe("Permission of the GCS is required.");
    expect(first.description).toContain("reflective learning module");
    expect(first.components).toBe("Lecture");
  });

  it("extracts multiple courses from a page", () => {
    const list = parseConcordiaCalendar(SAMPLE_TWO_COURSES);
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.code).sort()).toEqual(["COMP 108", "COMP 472"]);
  });

  it("returns an empty array for HTML with no course blocks", () => {
    const list = parseConcordiaCalendar("<html><body><h1>Quick Links</h1></body></html>");
    expect(list).toEqual([]);
  });

  it("strips the leading 'Description:' label from descriptions", () => {
    const list = parseConcordiaCalendar(SAMPLE_COURSE_BLOCK);
    expect(list[0]?.description.startsWith("Description:")).toBe(false);
  });

  it("strips quote marks from components", () => {
    const list = parseConcordiaCalendar(SAMPLE_COURSE_BLOCK);
    expect(list[0]?.components).not.toContain('"');
  });
});

describe("diffCatalog", () => {
  const catalog: CatalogCourse[] = [
    {
      code: "COMP 472",
      title: "Artificial Intelligence",
      credits: 3,
      description: "AI search and knowledge representation.",
      prereqs: { all: ["COMP 352"] },
    },
    {
      code: "COMP 248",
      title: "Object-Oriented Programming I",
      credits: 3.5,
      description: "Java basics.",
      prereqs: null,
    },
  ];

  it("returns no changes when scrape matches catalog exactly", () => {
    const scraped = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 3,
        prereqText: "COMP 352 previously or concurrently.",
        description: "AI search and knowledge representation.",
        components: "Lecture",
      },
      {
        code: "COMP 248",
        title: "Object-Oriented Programming I",
        credits: 3.5,
        prereqText: "",
        description: "Java basics.",
        components: "Lecture",
      },
    ];
    expect(diffCatalog(catalog, scraped)).toEqual([]);
  });

  it("flags an added course (in scrape, not in catalog)", () => {
    const scraped = [
      ...catalog.map((c) => ({
        code: c.code,
        title: c.title,
        credits: c.credits,
        prereqText: "",
        description: c.description ?? "",
        components: "Lecture",
      })),
      {
        code: "COMP 999",
        title: "Brand New Course",
        credits: 3,
        prereqText: "",
        description: "New stuff",
        components: "Lecture",
      },
    ];
    const changes = diffCatalog(catalog, scraped);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ code: "COMP 999", kind: "added" });
  });

  it("flags a removed course (in catalog, not in scrape)", () => {
    const scraped = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 3,
        prereqText: "COMP 352 previously or concurrently.",
        description: "AI search and knowledge representation.",
        components: "Lecture",
      },
      // COMP 248 missing.
    ];
    const changes = diffCatalog(catalog, scraped);
    expect(changes).toContainEqual(expect.objectContaining({ code: "COMP 248", kind: "removed" }));
  });

  it("flags a title change", () => {
    const scraped = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence & Machine Learning",
        credits: 3,
        prereqText: "COMP 352 previously or concurrently.",
        description: "AI search and knowledge representation.",
        components: "Lecture",
      },
      {
        code: "COMP 248",
        title: "Object-Oriented Programming I",
        credits: 3.5,
        prereqText: "",
        description: "Java basics.",
        components: "Lecture",
      },
    ];
    const changes = diffCatalog(catalog, scraped);
    const titleChange = changes.find((c) => c.kind === "title");
    expect(titleChange).toBeDefined();
    expect(titleChange?.code).toBe("COMP 472");
    expect(titleChange?.newValue).toBe("Artificial Intelligence & Machine Learning");
  });

  it("flags a credits change", () => {
    const scraped = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 4, // was 3
        prereqText: "COMP 352 previously or concurrently.",
        description: "AI search and knowledge representation.",
        components: "Lecture",
      },
      {
        code: "COMP 248",
        title: "Object-Oriented Programming I",
        credits: 3.5,
        prereqText: "",
        description: "Java basics.",
        components: "Lecture",
      },
    ];
    const change = diffCatalog(catalog, scraped).find((c) => c.kind === "credits");
    expect(change).toMatchObject({ code: "COMP 472", oldValue: 3, newValue: 4 });
  });

  it("ignores credits=0 (treated as parse failure, not real change)", () => {
    const scraped = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 0, // parser failure
        prereqText: "COMP 352 previously or concurrently.",
        description: "AI search and knowledge representation.",
        components: "Lecture",
      },
      {
        code: "COMP 248",
        title: "Object-Oriented Programming I",
        credits: 3.5,
        prereqText: "",
        description: "Java basics.",
        components: "Lecture",
      },
    ];
    expect(diffCatalog(catalog, scraped).filter((c) => c.kind === "credits")).toEqual([]);
  });

  it("does not flag a prereq diff when the scraped text mentions every catalog prereq code", () => {
    const scraped = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 3,
        prereqText: "Prerequisite: COMP 352. Recommended: COMP 432.",
        description: "AI search and knowledge representation.",
        components: "Lecture",
      },
      {
        code: "COMP 248",
        title: "Object-Oriented Programming I",
        credits: 3.5,
        prereqText: "",
        description: "Java basics.",
        components: "Lecture",
      },
    ];
    expect(diffCatalog(catalog, scraped).filter((c) => c.kind === "prereq")).toEqual([]);
  });

  it("respects scopePrefixes — never flags out-of-scope codes as removed", () => {
    // Catalog has 1 COMP + 1 ENGR. Scrape only has COMP. With prefix filter,
    // the ENGR row should NOT be flagged as removed (it just lives on a
    // different Concordia page we don't scrape yet).
    const mixedCatalog: CatalogCourse[] = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 3,
        description: null,
        prereqs: null,
      },
      {
        code: "ENGR 213",
        title: "Linear Algebra",
        credits: 3.5,
        description: null,
        prereqs: null,
      },
    ];
    const scrapedOnlyComp = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 3,
        prereqText: "",
        description: "",
        components: "",
      },
    ];

    const withScope = diffCatalog(mixedCatalog, scrapedOnlyComp, {
      scopePrefixes: ["COMP", "SOEN"],
    });
    expect(withScope.filter((c) => c.kind === "removed")).toEqual([]);

    // Sanity: without the scope, ENGR 213 WOULD be flagged as removed —
    // confirms the option is doing the work.
    const withoutScope = diffCatalog(mixedCatalog, scrapedOnlyComp);
    expect(withoutScope.find((c) => c.kind === "removed" && c.code === "ENGR 213")).toBeDefined();
  });

  it("ignores Unicode-hyphen variants in titles (Concordia uses U+2011 non-breaking hyphen)", () => {
    // Regression for the live dry-run that flagged COMP 248 / 249 / SOEN 387
    // as "title changed" purely because Concordia uses U+2011 where our seed
    // uses ASCII "-". Same word visually, different codepoint.
    const compCatalog: CatalogCourse[] = [
      {
        code: "COMP 248",
        title: "Object-Oriented Programming I", // ASCII hyphen
        credits: 3.5,
        description: null,
        prereqs: null,
      },
    ];
    const scrapedWithUnicodeHyphen = [
      {
        code: "COMP 248",
        title: "Object‑Oriented Programming I", // U+2011 non-breaking hyphen
        credits: 3.5,
        prereqText: "",
        description: "",
        components: "",
      },
    ];
    expect(
      diffCatalog(compCatalog, scrapedWithUnicodeHyphen).filter((c) => c.kind === "title"),
    ).toEqual([]);
  });

  it("ignores whitespace + smart-quote churn in descriptions", () => {
    const scraped = [
      {
        code: "COMP 472",
        title: "Artificial Intelligence",
        credits: 3,
        prereqText: "COMP 352 previously or concurrently.",
        description: "AI  search  and knowledge representation.", // extra spaces
        components: "Lecture",
      },
      {
        code: "COMP 248",
        title: "Object-Oriented Programming I",
        credits: 3.5,
        prereqText: "",
        description: "Java basics.",
        components: "Lecture",
      },
    ];
    expect(diffCatalog(catalog, scraped).filter((c) => c.kind === "description")).toEqual([]);
  });
});
