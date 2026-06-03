/**
 * Build a layered DAG layout for the prereq map (deterministic, NOT d3-force).
 *
 * Approach:
 *   1. Topological levels — each course's level = 1 + max(prereq levels).
 *      Roots (no prereqs) sit at level 0.
 *   2. Within a level, courses are sorted alphabetically (stable).
 *   3. We position nodes on a grid: x = level * X_GAP, y = index * Y_GAP.
 *   4. Edges are drawn as straight lines from prereq centre → course centre,
 *      solid for hard prereqs, dashed for coreqs/concurrent.
 *
 * This produces a clean left-to-right reading: early-degree courses on the left,
 * 400-level capstone courses on the right. Same input always produces the same
 * output, which is what we want for a planning tool (vs. force-directed jitter).
 */

import type { CourseCatalogEntry } from "@/lib/validation/plan";

export interface GraphNode {
  code: string;
  title: string;
  credits: number;
  category: string | null;
  level: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "prereq" | "any" | "concurrent";
}

export interface PrereqGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

const X_GAP = 200;
const Y_GAP = 80;
const PADDING = 40;

function levelOf(
  code: string,
  catalog: Map<string, CourseCatalogEntry>,
  memo: Map<string, number>,
  visiting: Set<string>,
): number {
  const existing = memo.get(code);
  if (existing !== undefined) return existing;
  if (visiting.has(code)) {
    // Cycle — fall back to 0 to break the loop.
    memo.set(code, 0);
    return 0;
  }
  visiting.add(code);
  const c = catalog.get(code);
  const prereqs = c?.prereqs;
  const all = [...(prereqs?.all ?? []), ...(prereqs?.any ?? [])];
  let max = -1;
  for (const p of all) {
    if (!catalog.has(p)) continue;
    const lvl = levelOf(p, catalog, memo, visiting);
    if (lvl > max) max = lvl;
  }
  visiting.delete(code);
  const lvl = max + 1;
  memo.set(code, lvl);
  return lvl;
}

export function buildPrereqGraph(catalogList: CourseCatalogEntry[]): PrereqGraph {
  const catalog = new Map<string, CourseCatalogEntry>();
  for (const c of catalogList) catalog.set(c.code, c);

  // 1. Compute levels.
  const levelMemo = new Map<string, number>();
  for (const c of catalogList) {
    levelOf(c.code, catalog, levelMemo, new Set());
  }

  // 2. Bucket by level + sort within bucket.
  const buckets = new Map<number, string[]>();
  for (const [code, level] of levelMemo.entries()) {
    if (!buckets.has(level)) buckets.set(level, []);
    buckets.get(level)?.push(code);
  }
  for (const arr of buckets.values()) arr.sort();

  // 3. Assign x,y.
  const nodes: GraphNode[] = [];
  let maxX = 0;
  let maxY = 0;
  for (const [level, codes] of buckets.entries()) {
    codes.forEach((code, idx) => {
      const c = catalog.get(code);
      if (!c) return;
      const x = PADDING + level * X_GAP;
      const y = PADDING + idx * Y_GAP;
      nodes.push({
        code,
        title: c.title,
        credits: c.credits,
        category: c.category ?? null,
        level,
        x,
        y,
      });
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  }

  // 4. Build edges from prereqs.
  const edges: GraphEdge[] = [];
  for (const c of catalogList) {
    const pre = c.prereqs;
    if (!pre) continue;
    for (const p of pre.all ?? []) {
      if (catalog.has(p)) edges.push({ from: p, to: c.code, kind: "prereq" });
    }
    for (const p of pre.any ?? []) {
      if (catalog.has(p)) edges.push({ from: p, to: c.code, kind: "any" });
    }
    for (const p of pre.concurrent ?? []) {
      if (catalog.has(p)) edges.push({ from: p, to: c.code, kind: "concurrent" });
    }
  }

  return {
    nodes,
    edges,
    width: maxX + 160 + PADDING,
    height: maxY + 40 + PADDING,
  };
}

const CATEGORY_COLOR: Record<string, string> = {
  eng_core: "var(--color-warning)",
  se_core: "var(--color-accent)",
  eng_nsci_group: "var(--color-text-muted)",
  nat_sci_elective: "var(--color-success)",
  soen_elective: "var(--color-accent-hover)",
  gen_ed_humanities: "var(--color-text-subtle)",
  deficiency: "var(--color-danger)",
};

export function categoryColor(category: string | null): string {
  if (!category) return "var(--color-text-muted)";
  return CATEGORY_COLOR[category] ?? "var(--color-text-muted)";
}
