"use client";
// =============================================================================
// WikiPath Web — SessionGraph
// =============================================================================
// Cytoscape.js graph for a single session's visit tree.
// Nodes: color-coded by wiki domain, sized by dwell time.
// Root node: diamond shape, gold border.
// Edge types:
//   navigation  — solid grey arrows
//   contextual  — thin dashed mauve lines
// Click a node: highlights the reading path (ancestors + descendants) with
//   numbered badges and dims everything else.
// Double-click: open article in new tab.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import type { StoredEdge, Visit } from "@wikipath/shared";
import { deriveEdges, formatDuration } from "@wikipath/shared";

// Cytoscape is loaded dynamically to avoid SSR issues
type CyInstance = import("cytoscape").Core;

// -----------------------------------------------------------------------------
// Catppuccin Mocha palette for node coloring
// -----------------------------------------------------------------------------
const DOMAIN_COLORS = [
  "#b4befe", // lavender
  "#89b4fa", // blue
  "#94e2d5", // teal
  "#a6e3a1", // green
  "#f9e2af", // yellow
  "#fab387", // peach
  "#cba6f7", // mauve
  "#74c7ec", // sapphire
  "#f5c2e7", // pink
  "#89dceb", // sky
];

const DOMAIN_COLOR_MAP = new Map<string, string>();
let colorIdx = 0;
function getDomainColor(domain: string): string {
  if (!DOMAIN_COLOR_MAP.has(domain)) {
    DOMAIN_COLOR_MAP.set(domain, DOMAIN_COLORS[colorIdx % DOMAIN_COLORS.length] ?? "#b4befe");
    colorIdx++;
  }
  return DOMAIN_COLOR_MAP.get(domain)!;
}

// -----------------------------------------------------------------------------
// Node sizing by dwell time
// -----------------------------------------------------------------------------
const MIN_SIZE = 28;
const MAX_SIZE = 56;

function nodeSize(dwellTime: number | null): number {
  if (dwellTime === null) return MIN_SIZE;
  const clamped = Math.min(dwellTime, 5 * 60_000);
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * (clamped / (5 * 60_000));
}

// -----------------------------------------------------------------------------
// Reading path helpers
// -----------------------------------------------------------------------------

/** Build the full reading path for a node: ancestors + node + descendants, sorted by visitedAt */
function buildReadingPath(visitId: string, visits: Visit[]): string[] {
  const visitMap = new Map(visits.map((v) => [v.id, v]));

  // Trace UP to root via parentVisitId
  const ancestors: string[] = [];
  let cur: string | null = visitId;
  while (cur !== null) {
    const v = visitMap.get(cur);
    if (!v) break;
    ancestors.unshift(cur);
    cur = v.parentVisitId;
  }

  // Trace DOWN: BFS to find all descendants
  const descendants: string[] = [];
  const queue = [visitId];
  const visited = new Set([visitId]);
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const v of visits) {
      if (v.parentVisitId === parent && !visited.has(v.id)) {
        visited.add(v.id);
        descendants.push(v.id);
        queue.push(v.id);
      }
    }
  }

  // Combine: ancestors (includes node) + descendants, deduped, sorted by visitedAt
  const pathIds = [...new Set([...ancestors, ...descendants])];
  pathIds.sort((a, b) => {
    const va = visitMap.get(a);
    const vb = visitMap.get(b);
    return (va?.visitedAt ?? 0) - (vb?.visitedAt ?? 0);
  });
  return pathIds;
}

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface SessionGraphProps {
  visits: Visit[];
  contextualEdges?: StoredEdge[];
  onVisitSelect?: (visit: Visit | null) => void;
  rootVisitId?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function SessionGraph({
  visits,
  contextualEdges = [],
  onVisitSelect,
  rootVisitId,
}: SessionGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<CyInstance | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const [tooltip, setTooltip] = useState<{
    title: string;
    domain: string;
    dwell: string;
    excerpt: string | null;
    x: number;
    y: number;
  } | null>(null);

  const buildGraph = useCallback(async () => {
    if (!containerRef.current || visits.length === 0) return;

    const cytoscape = (await import("cytoscape")).default;
    const dagre = (await import("cytoscape-dagre")).default;

    try { cytoscape.use(dagre); } catch { /* already registered */ }

    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const navEdges = deriveEdges(visits);

    const nodes = visits.map((v) => ({
      data: {
        id: v.id,
        label: v.articleTitle.length > 24 ? v.articleTitle.slice(0, 22) + "…" : v.articleTitle,
        fullTitle: v.articleTitle,
        domain: v.wiki.domain,
        color: getDomainColor(v.wiki.domain),
        size: nodeSize(v.dwellTime),
        isRoot: v.id === rootVisitId,
        dwell: v.dwellTime,
        excerpt: v.metadata.excerpt,
        url: v.url,
      },
    }));

    const edges = [
      ...navEdges.map((e) => ({
        data: {
          id: `nav-${e.sourceVisitId}-${e.targetVisitId}`,
          source: e.sourceVisitId,
          target: e.targetVisitId,
          type: "navigation",
        },
      })),
      ...contextualEdges.map((e) => ({
        data: {
          id: `ctx-${e.sourceVisitId}-${e.targetVisitId}`,
          source: e.sourceVisitId,
          target: e.targetVisitId,
          type: "contextual",
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements: { nodes, edges },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            "border-width": 0,
            label: "data(label)",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            "font-size": 10,
            color: "#cdd6f4",
            "text-outline-color": "#1e1e2e",
            "text-outline-width": 2,
            width: "data(size)",
            height: "data(size)",
            shape: "ellipse",
            opacity: 1,
          },
        },
        {
          selector: "node[?isRoot]",
          style: {
            shape: "diamond",
            "border-width": 2,
            "border-color": "#f9e2af",
            width: MAX_SIZE,
            height: MAX_SIZE,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 3,
            "border-color": "#89b4fa",
          },
        },
        {
          selector: "node.dimmed",
          style: { opacity: 0.15 },
        },
        {
          selector: "node.highlighted",
          style: {
            "border-width": 3,
            "border-color": "#89b4fa",
            opacity: 1,
          },
        },
        {
          selector: "edge[type = 'navigation']",
          style: {
            width: 1.5,
            "line-color": "#585b70",
            "target-arrow-color": "#585b70",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.7,
          },
        },
        {
          selector: "edge[type = 'contextual']",
          style: {
            width: 1,
            "line-color": "#cba6f7",
            "line-style": "dashed",
            "target-arrow-color": "#cba6f7",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.45,
          },
        },
        {
          selector: "edge.dimmed",
          style: { opacity: 0.05 },
        },
        {
          selector: "edge.highlighted",
          style: {
            "line-color": "#89b4fa",
            "target-arrow-color": "#89b4fa",
            opacity: 1,
            width: 2,
          },
        },
      ],
      layout: {
        name: "dagre",
        rankDir: "TB",
        nodeSep: 40,
        rankSep: 60,
        padding: 20,
        animate: false,
      } as unknown as cytoscape.LayoutOptions,
    });

    // -------------------------------------------------------------------------
    // Click: highlight reading path + numbered badges
    // -------------------------------------------------------------------------
    cy.on("tap", "node", (evt) => {
      if (evt.target.hasClass("badge")) return;
      const nodeId = evt.target.id() as string;
      const visit = visits.find((v) => v.id === nodeId);
      onVisitSelect?.(visit ?? null);
      setTooltip(null);

      // Remove existing badges
      cy.elements(".badge").remove();

      if (selectedIdRef.current === nodeId) {
        // Second tap on same node — deselect
        selectedIdRef.current = null;
        cy.elements().removeClass("dimmed highlighted");
        return;
      }
      selectedIdRef.current = nodeId;

      const pathIds = new Set(buildReadingPath(nodeId, visits));

      // Dim/highlight nodes
      cy.nodes().forEach((node) => {
        node.removeClass("dimmed highlighted");
        if (pathIds.has(node.id())) {
          node.addClass("highlighted");
        } else {
          node.addClass("dimmed");
        }
      });

      // Dim/highlight navigation edges along the path
      cy.edges().forEach((edge) => {
        edge.removeClass("dimmed highlighted");
        const src = edge.data("source") as string;
        const tgt = edge.data("target") as string;
        const type = edge.data("type") as string;
        if (type === "navigation" && pathIds.has(src) && pathIds.has(tgt)) {
          edge.addClass("highlighted");
        } else {
          edge.addClass("dimmed");
        }
      });

      // Add order badges
      const pathArray = buildReadingPath(nodeId, visits);
      pathArray.forEach((vid, i) => {
        const node = cy.getElementById(vid);
        if (node.length === 0) return;
        const pos = node.position();
        const size = (node.data("size") as number) / 2;
        cy.add({
          group: "nodes",
          data: {
            id: `badge-${vid}`,
            label: String(i + 1),
            badgeFor: vid,
          },
          position: { x: pos.x + size, y: pos.y - size },
          classes: "badge",
        });
      });

      cy.style().selector(".badge").style({
        shape: "ellipse",
        width: 14,
        height: 14,
        "background-color": "#89b4fa",
        "border-width": 0,
        label: "data(label)",
        "font-size": 8,
        "font-weight": "bold",
        color: "#1e1e2e",
        "text-valign": "center",
        "text-halign": "center",
        "text-outline-width": 0,
        "z-index": 100,
      }).update();
    });

    // Background tap: deselect
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        selectedIdRef.current = null;
        onVisitSelect?.(null);
        setTooltip(null);
        cy.elements(".badge").remove();
        cy.elements().removeClass("dimmed highlighted");
      }
    });

    // Double-click → open article
    cy.on("dblclick", "node", (evt) => {
      if (evt.target.hasClass("badge")) return;
      const nodeData = evt.target.data() as { url: string };
      window.open(nodeData.url, "_blank", "noopener");
    });

    // Hover → tooltip
    cy.on("mouseover", "node", (evt) => {
      if (evt.target.hasClass("badge")) return;
      const nodeData = evt.target.data() as {
        fullTitle: string;
        domain: string;
        dwell: number | null;
        excerpt: string | null;
      };
      if (!nodeData.fullTitle) return;
      const pos = evt.target.renderedPosition();
      setTooltip({
        title: nodeData.fullTitle,
        domain: nodeData.domain,
        dwell: nodeData.dwell !== null ? formatDuration(nodeData.dwell) : "—",
        excerpt: nodeData.excerpt,
        x: pos.x,
        y: pos.y,
      });
    });

    cy.on("mouseout", "node", () => setTooltip(null));

    cy.fit(undefined, 20);
    cyRef.current = cy;
  }, [visits, contextualEdges, rootVisitId, onVisitSelect]);

  useEffect(() => {
    void buildGraph();
    return () => {
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
    };
  }, [buildGraph]);

  if (visits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--ctp-overlay0)] text-sm">
        No visits in this session.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none bg-[var(--ctp-mantle)] border border-[var(--ctp-surface1)] rounded-lg p-3 max-w-[220px] shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 20 }}
        >
          <p className="text-[var(--ctp-text)] text-xs font-semibold mb-1 leading-tight">
            {tooltip.title}
          </p>
          <p className="text-[var(--ctp-subtext0)] text-[10px] mb-1">{tooltip.domain}</p>
          <p className="text-[var(--ctp-overlay1)] text-[10px]">Dwell: {tooltip.dwell}</p>
          {tooltip.excerpt && (
            <p className="text-[var(--ctp-overlay0)] text-[10px] mt-1 line-clamp-3">
              {tooltip.excerpt}
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#585b70" strokeWidth="1.5" markerEnd="url(#arr)" /></svg>
          <span className="text-[10px] text-[var(--ctp-overlay0)]">navigation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#cba6f7" strokeWidth="1" strokeDasharray="3,2" /></svg>
          <span className="text-[10px] text-[var(--ctp-overlay0)]">contextual</span>
        </div>
      </div>
    </div>
  );
}
