"use client";

import {
  bezierPath,
  buildPrereqGraph,
  categoryColor,
  computeChain,
} from "@/lib/domain/prereq-graph";
import type { CourseCatalogEntry } from "@/lib/validation/plan";
import { Maximize2, Minus, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PrereqMapProps {
  catalog: CourseCatalogEntry[];
  takenCodes: Set<string>;
  plannedCodes: Set<string>;
  filterCategory: string | null;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 44;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function PrereqMapSVG({
  catalog,
  takenCodes,
  plannedCodes,
  filterCategory,
}: PrereqMapProps): React.ReactElement {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Pan/zoom transform.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => (filterCategory ? catalog.filter((c) => c.category === filterCategory) : catalog),
    [catalog, filterCategory],
  );

  const graph = useMemo(() => buildPrereqGraph(filtered), [filtered]);
  const nodeByCode = useMemo(() => new Map(graph.nodes.map((n) => [n.code, n])), [graph.nodes]);

  // The "focus" is the pinned node if any, else the hovered node.
  const focus = pinned ?? hovered;

  // Pinned → full transitive chain. Hovered (no pin) → immediate neighbors only.
  const active = useMemo(() => {
    if (pinned) {
      const chain = computeChain(pinned, graph.edges);
      return { nodes: chain.nodes, edges: chain.edges };
    }
    if (hovered) {
      const nodes = new Set<string>([hovered]);
      const edges = new Set<string>();
      for (const e of graph.edges) {
        if (e.from === hovered || e.to === hovered) {
          edges.add(`${e.from}->${e.to}`);
          nodes.add(e.from);
          nodes.add(e.to);
        }
      }
      return { nodes, edges };
    }
    return null;
  }, [pinned, hovered, graph.edges]);

  // Search matches (code or title, case-insensitive).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes
      .filter((n) => n.code.toLowerCase().includes(q) || n.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, graph.nodes]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPinned(null);
  }, []);

  // Center the viewport on a node and pin it (used by search + click).
  const focusNode = useCallback(
    (code: string) => {
      const n = nodeByCode.get(code);
      const el = containerRef.current;
      if (!n || !el) {
        setPinned(code);
        return;
      }
      const z = 1.1;
      const cx = n.x + NODE_WIDTH / 2;
      const cy = n.y + NODE_HEIGHT / 2;
      setZoom(z);
      setPan({
        x: el.clientWidth / 2 - cx * z,
        y: el.clientHeight / 2 - cy * z,
      });
      setPinned(code);
    },
    [nodeByCode],
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // only zoom on ctrl/cmd+wheel, else let it scroll
    e.preventDefault();
    setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 0.9)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // Start a pan only when the canvas background (not a node) is grabbed.
    if ((e.target as Element).closest("[data-node]")) return;
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  // Escape clears the pin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--color-text-subtle)" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                focusNode(matches[0].code);
                setQuery("");
              }
            }}
            placeholder="Find a course…"
            aria-label="Search courses"
            className="h-8 w-48 rounded-lg border pl-8 pr-2 text-sm focus-visible:outline-none"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          />
          {matches.length > 0 && (
            <ul
              className="absolute z-10 mt-1 w-64 overflow-hidden rounded-lg border shadow-lg"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              {matches.map((m) => (
                <li key={m.code}>
                  <button
                    type="button"
                    onClick={() => {
                      focusNode(m.code);
                      setQuery("");
                    }}
                    className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent/10"
                  >
                    <span className="mono tnum font-semibold">{m.code}</span>
                    <span className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {m.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="flex items-center rounded-lg border"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => clampZoom(z * 0.9))}
            className="flex h-8 w-8 items-center justify-center hover:bg-accent/10"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span
            className="mono tnum w-12 text-center text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => clampZoom(z * 1.1))}
            className="flex h-8 w-8 items-center justify-center hover:bg-accent/10"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={resetView}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs hover:bg-accent/10"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Reset
        </button>

        {pinned && (
          <button
            type="button"
            onClick={() => setPinned(null)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium"
            style={{ background: "var(--gradient-accent-soft)", color: "var(--color-accent)" }}
          >
            Focused: <span className="mono tnum">{pinned}</span>
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <span className="ml-auto text-xs" style={{ color: "var(--color-text-subtle)" }}>
          Click a course to trace its path · drag to pan · ⌘/Ctrl+scroll to zoom
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border"
        style={{
          background: "var(--gradient-surface)",
          borderColor: "var(--color-border)",
          height: "75vh",
          cursor: dragRef.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <svg
          width="100%"
          height="100%"
          role="img"
          aria-label="Prerequisite map"
          style={{ display: "block" }}
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 -5 10 10"
              refX="8"
              refY="0"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,-5L10,0L0,5" fill="var(--color-text-muted)" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 -5 10 10"
              refX="8"
              refY="0"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,-5L10,0L0,5" fill="var(--color-accent)" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges (curved) */}
            {graph.edges.map((e) => {
              const from = nodeByCode.get(e.from);
              const to = nodeByCode.get(e.to);
              if (!from || !to) return null;
              const isHL = active?.edges.has(`${e.from}->${e.to}`) ?? false;
              const dimmed = !!active && !isHL;
              return (
                <path
                  key={`${e.from}-${e.to}-${e.kind}`}
                  d={bezierPath(
                    from.x + NODE_WIDTH,
                    from.y + NODE_HEIGHT / 2,
                    to.x,
                    to.y + NODE_HEIGHT / 2,
                  )}
                  fill="none"
                  stroke={isHL ? "var(--color-accent)" : "var(--color-border-strong)"}
                  strokeWidth={isHL ? 2 : 1}
                  strokeDasharray={e.kind === "concurrent" ? "4 3" : undefined}
                  markerEnd={isHL ? "url(#arrow-active)" : "url(#arrow)"}
                  opacity={dimmed ? 0.08 : isHL ? 1 : 0.55}
                />
              );
            })}

            {/* Nodes */}
            {graph.nodes.map((n) => {
              const isTaken = takenCodes.has(n.code);
              const isPlanned = plannedCodes.has(n.code);
              const inChain = active?.nodes.has(n.code) ?? false;
              const dimmed = !!active && !inChain;
              const isFocus = focus === n.code;
              const fill = isTaken
                ? "var(--color-success-soft)"
                : isPlanned
                  ? "var(--color-accent-soft)"
                  : "var(--color-surface-2)";
              const stroke = isFocus ? "var(--color-accent)" : categoryColor(n.category);

              return (
                <g
                  key={n.code}
                  data-node={n.code}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.code} ${n.title}. Click to trace its prerequisite path.`}
                  aria-pressed={pinned === n.code}
                  onMouseEnter={() => setHovered(n.code)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setPinned((p) => (p === n.code ? null : n.code))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPinned((p) => (p === n.code ? null : n.code));
                    }
                  }}
                  style={{ cursor: "pointer", opacity: dimmed ? 0.25 : 1 }}
                >
                  <rect
                    x={n.x}
                    y={n.y}
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={8}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isFocus ? 2.5 : inChain ? 2 : 1}
                  />
                  <text
                    x={n.x + 10}
                    y={n.y + 18}
                    fontSize="11"
                    fontWeight="600"
                    fill="var(--color-text)"
                    fontFamily="var(--font-mono)"
                  >
                    {n.code}
                  </text>
                  <text x={n.x + 10} y={n.y + 34} fontSize="9" fill="var(--color-text-muted)">
                    {n.title.length > 22 ? `${n.title.slice(0, 22)}…` : n.title}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Focus legend when a course is pinned */}
        {pinned && (
          <div
            className="pointer-events-none absolute bottom-3 left-3 rounded-lg border px-3 py-2 text-xs backdrop-blur-md"
            style={{
              background: "color-mix(in oklch, var(--color-surface) 85%, transparent)",
              borderColor: "var(--color-border)",
            }}
          >
            <div className="font-semibold">
              <span className="mono tnum">{pinned}</span> path
            </div>
            <div style={{ color: "var(--color-text-muted)" }}>
              {active ? (
                <>
                  {[...active.nodes].length - 1} connected course
                  {[...active.nodes].length - 1 === 1 ? "" : "s"} highlighted
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
