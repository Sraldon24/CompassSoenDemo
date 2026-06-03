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

  // 2. Bucket by level + sort within bucket (alphabetical = stable seed order).
  const buckets = new Map<number, string[]>();
  for (const [code, level] of levelMemo.entries()) {
    if (!buckets.has(level)) buckets.set(level, []);
    buckets.get(level)?.push(code);
  }
  for (const arr of buckets.values()) arr.sort();

  // 2b. Barycenter ordering: sweep levels left→right and reorder each level by
  // the mean index of each node's prereqs in the previous level. This pulls a
  // course vertically toward its parents, so edges bow gently instead of
  // crisscrossing the whole canvas. Alphabetical order is the stable tiebreak,
  // so the layout stays deterministic.
  const orderInLevel = new Map<string, number>();
  const sortedLevels = [...buckets.keys()].sort((a, b) => a - b);
  for (const level of sortedLevels) {
    const codes = buckets.get(level);
    if (!codes) continue;
    if (level === 0) {
      codes.forEach((code, idx) => orderInLevel.set(code, idx));
      continue;
    }
    const withBary = codes.map((code, alphaIdx) => {
      const c = catalog.get(code);
      const prereqs = [...(c?.prereqs?.all ?? []), ...(c?.prereqs?.any ?? [])].filter((p) =>
        catalog.has(p),
      );
      const indices = prereqs
        .map((p) => orderInLevel.get(p))
        .filter((i): i is number => i !== undefined);
      const bary =
        indices.length > 0
          ? indices.reduce((s, i) => s + i, 0) / indices.length
          : Number.POSITIVE_INFINITY; // no positioned parent → sink to bottom, stable
      return { code, bary, alphaIdx };
    });
    withBary.sort((a, b) => a.bary - b.bary || a.alphaIdx - b.alphaIdx);
    const reordered = withBary.map((w) => w.code);
    buckets.set(level, reordered);
    reordered.forEach((code, idx) => orderInLevel.set(code, idx));
  }

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

// ============================================================================
// Traversal — for click-to-pin path highlighting in the interactive map.
// ============================================================================

export interface PrereqChain {
  /** All courses that `code` (transitively) depends on. Excludes `code`. */
  ancestors: Set<string>;
  /** All courses that (transitively) depend on `code`. Excludes `code`. */
  descendants: Set<string>;
  /** Every node in the chain, including `code` itself. */
  nodes: Set<string>;
  /** "from->to" keys for every edge that lies on the chain. */
  edges: Set<string>;
}

/** Build forward (to→from-set) and backward (from→to-set) adjacency maps. */
function buildAdjacency(edges: GraphEdge[]): {
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
} {
  const parents = new Map<string, Set<string>>(); // node → its prereqs
  const children = new Map<string, Set<string>>(); // node → courses it unlocks
  for (const e of edges) {
    if (!parents.has(e.to)) parents.set(e.to, new Set());
    parents.get(e.to)?.add(e.from);
    if (!children.has(e.from)) children.set(e.from, new Set());
    children.get(e.from)?.add(e.to);
  }
  return { parents, children };
}

/**
 * Compute the full prerequisite chain for a course: everything it transitively
 * depends on (ancestors), everything that transitively depends on it
 * (descendants), and the edges connecting them. Used to spotlight one course's
 * path through the degree while dimming the rest.
 *
 * Pure + cycle-safe (visited set). Same graph + code → same result.
 */
export function computeChain(code: string, edges: GraphEdge[]): PrereqChain {
  const { parents, children } = buildAdjacency(edges);
  const ancestors = new Set<string>();
  const descendants = new Set<string>();

  const walk = (start: string, adj: Map<string, Set<string>>, out: Set<string>) => {
    const stack = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) continue;
      for (const next of adj.get(cur) ?? []) {
        if (!out.has(next)) {
          out.add(next);
          stack.push(next);
        }
      }
    }
  };
  walk(code, parents, ancestors);
  walk(code, children, descendants);

  const nodes = new Set<string>([code, ...ancestors, ...descendants]);
  const chainEdges = new Set<string>();
  for (const e of edges) {
    if (nodes.has(e.from) && nodes.has(e.to)) chainEdges.add(`${e.from}->${e.to}`);
  }

  return { ancestors, descendants, nodes, edges: chainEdges };
}

/**
 * Cubic-bezier path string for an edge, curving horizontally between two
 * points. Control points sit at the horizontal midpoint so lines bow smoothly
 * left→right instead of crossing as harsh straight diagonals.
 */
export function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
