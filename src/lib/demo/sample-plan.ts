/**
 * Static sample plan for the no-auth /demo experience.
 *
 * A realistic mid-degree SOEN plan so visitors see the planner + validation
 * engine working on real data without signing up. Kept in code (not DB) so
 * /demo needs zero auth and zero queries.
 */

import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";

export const DEMO_CATALOG: CourseCatalogEntry[] = [
  { code: "COMP 248", title: "Object-Oriented Programming I", credits: 3.5, category: "se_core" },
  {
    code: "COMP 249",
    title: "Object-Oriented Programming II",
    credits: 3.5,
    category: "se_core",
    prereqs: { all: ["COMP 248"] },
  },
  {
    code: "COMP 232",
    title: "Mathematics for Computer Science",
    credits: 3,
    category: "se_core",
  },
  {
    code: "SOEN 287",
    title: "Web Programming",
    credits: 3.5,
    category: "se_core",
    prereqs: { all: ["COMP 248"] },
  },
  {
    code: "COMP 352",
    title: "Data Structures and Algorithms",
    credits: 3.5,
    category: "se_core",
    prereqs: { all: ["COMP 249", "COMP 232"] },
  },
  {
    code: "SOEN 341",
    title: "Software Process and Practices",
    credits: 3.5,
    category: "se_core",
    prereqs: { all: ["COMP 249"] },
  },
  {
    code: "COMP 472",
    title: "Artificial Intelligence",
    credits: 3,
    category: "soen_elective",
    prereqs: { all: ["COMP 352"] },
  },
  {
    code: "SOEN 357",
    title: "User Interface Design",
    credits: 3.5,
    category: "se_core",
    prereqs: { all: ["SOEN 287"] },
  },
];

export const DEMO_PLAN: PlannedCourse[] = [
  { courseCode: "COMP 248", term: "Fall 2025", status: "completed" },
  { courseCode: "COMP 232", term: "Fall 2025", status: "completed" },
  { courseCode: "COMP 249", term: "Winter 2026", status: "completed" },
  { courseCode: "SOEN 287", term: "Winter 2026", status: "completed" },
  { courseCode: "COMP 352", term: "Fall 2026", status: "planned" },
  { courseCode: "SOEN 341", term: "Fall 2026", status: "planned" },
  { courseCode: "SOEN 357", term: "Winter 2027", status: "planned" },
  { courseCode: "COMP 472", term: "Winter 2027", status: "planned" },
];

export const DEMO_TERMS = ["Fall 2025", "Winter 2026", "Fall 2026", "Winter 2027"];

/** Per-session AI message cap for demo mode (sessionStorage-backed). */
export const DEMO_AI_MESSAGE_CAP = 5;
export const DEMO_AI_COUNTER_KEY = "demo-ai-count";
