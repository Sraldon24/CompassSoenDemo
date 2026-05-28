"use client";

import { buildPrereqGraph, categoryColor } from "@/lib/prereq-graph";
import type { CourseCatalogEntry } from "@/lib/validation/plan";
import { useMemo, useState } from "react";

interface PrereqMapProps {
  catalog: CourseCatalogEntry[];
  takenCodes: Set<string>;
  plannedCodes: Set<string>;
  filterCategory: string | null;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 44;

export function PrereqMapSVG({
  catalog,
  takenCodes,
  plannedCodes,
  filterCategory,
}: PrereqMapProps): React.ReactElement {
  const [hovered, setHovered] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filterCategory ? catalog.filter((c) => c.category === filterCategory) : catalog),
    [catalog, filterCategory],
  );

  const graph = useMemo(() => buildPrereqGraph(filtered), [filtered]);

  // Edges connected to the hovered node — for path highlighting.
  const highlightedEdges = useMemo(() => {
    if (!hovered) return new Set<string>();
    const out = new Set<string>();
    for (const e of graph.edges) {
      if (e.from === hovered || e.to === hovered) out.add(`${e.from}->${e.to}`);
    }
    return out;
  }, [hovered, graph.edges]);

  const highlightedNodes = useMemo(() => {
    if (!hovered) return new Set<string>();
    const out = new Set<string>([hovered]);
    for (const e of graph.edges) {
      if (e.from === hovered) out.add(e.to);
      if (e.to === hovered) out.add(e.from);
    }
    return out;
  }, [hovered, graph.edges]);

  return (
    <div
      className="w-full overflow-auto border rounded-lg"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        maxHeight: "75vh",
      }}
    >
      <svg
        width={graph.width}
        height={graph.height}
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        role="img"
        aria-label="Prerequisite map"
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

        {/* Edges */}
        {graph.edges.map((e) => {
          const from = graph.nodes.find((n) => n.code === e.from);
          const to = graph.nodes.find((n) => n.code === e.to);
          if (!from || !to) return null;
          const isHL = highlightedEdges.has(`${e.from}->${e.to}`);
          return (
            <line
              key={`${e.from}-${e.to}-${e.kind}`}
              x1={from.x + NODE_WIDTH}
              y1={from.y + NODE_HEIGHT / 2}
              x2={to.x}
              y2={to.y + NODE_HEIGHT / 2}
              stroke={isHL ? "var(--color-accent)" : "var(--color-border-strong)"}
              strokeWidth={isHL ? 2 : 1}
              strokeDasharray={e.kind === "concurrent" ? "4 3" : undefined}
              markerEnd={isHL ? "url(#arrow-active)" : "url(#arrow)"}
              opacity={hovered && !isHL ? 0.2 : 1}
            />
          );
        })}

        {/* Nodes */}
        {graph.nodes.map((n) => {
          const isTaken = takenCodes.has(n.code);
          const isPlanned = plannedCodes.has(n.code);
          const isHL = highlightedNodes.has(n.code);
          const isDimmed = !!hovered && !isHL;
          const fill = isTaken
            ? "var(--color-success-soft)"
            : isPlanned
              ? "var(--color-accent-soft)"
              : "var(--color-surface-2)";
          const stroke = categoryColor(n.category);

          return (
            <g
              key={n.code}
              onMouseEnter={() => setHovered(n.code)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer", opacity: isDimmed ? 0.4 : 1 }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={6}
                fill={fill}
                stroke={stroke}
                strokeWidth={isHL ? 2 : 1}
              />
              <text
                x={n.x + 8}
                y={n.y + 17}
                fontSize="11"
                fontWeight="600"
                fill="var(--color-text)"
                fontFamily="var(--font-mono)"
              >
                {n.code}
              </text>
              <text x={n.x + 8} y={n.y + 33} fontSize="9" fill="var(--color-text-muted)">
                {n.title.length > 22 ? `${n.title.slice(0, 22)}…` : n.title}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
