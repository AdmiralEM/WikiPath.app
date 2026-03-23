"use client";
// =============================================================================
// WikiPath Web — SessionGraph
// =============================================================================
// Cytoscape.js graph for a single session's visit tree.
// Nodes: color-coded by wiki domain, sized by dwell time.
// Root node: diamond shape, gold border.
// Edges: directional arrows (navigation) or dashed (cross-session).
// =============================================================================

import { useEffect, useRef, useState, useCallback } from "react";
import type { Edge, Visit } from "@wikipath/shared";
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
  // 0–5 min → MIN_SIZE–MAX_SIZE
  const clamped = Math.min(dwellTime, 5 * 60_000);
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * (clamped / (5 * 60_000));
}

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

export interface VisitDetail {
  visit: Visit;
  onClose: () => void;
}

interface SessionGraphProps {
  visits: Visit[];
  crossSessionEdges?: Edge[];
  onVisitSelect?: (visit: Visit | null) => void;
  rootVisitId?: string;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function SessionGraph({
  visits,
  crossSessionEdges = [],
  onVisitSelect,
  rootVisitId,
}: SessionGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<CyInstance | null>(null);

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

    // Dynamic imports to avoid SSR
    const cytoscape = (await import("cytoscape")).default;
    const dagre = (await import("cytoscape-dagre")).default;

    // Register plugin (idempotent)
    try {
      cytoscape.use(dagre);
    } catch {
      // Already registered
    }

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

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
      ...crossSessionEdges.map((e) => ({
        data: {
          id: `cross-${e.sourceVisitId}-${e.targetVisitId}`,
          source: e.sourceVisitId,
          target: e.targetVisitId,
          type: "cross-session",
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
            "border-width": 2,
            "border-color": "#b4befe",
            "background-color": "data(color)",
          },
        },
        {
          selector: "edge[type = 'navigation']",
          style: {
            width: 1.5,
            "line-color": "#45475a",
            "target-arrow-color": "#45475a",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
        {
          selector: "edge[type = 'cross-session']",
          style: {
            width: 1,
            "line-color": "#6c7086",
            "line-style": "dashed",
            "target-arrow-color": "#6c7086",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
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

    // Click → select visit
    cy.on("tap", "node", (evt) => {
      const nodeData = evt.target.data() as {
        id: string;
        fullTitle: string;
        url: string;
        domain: string;
        dwell: number | null;
        excerpt: string | null;
      };
      const visit = visits.find((v) => v.id === nodeData.id);
      onVisitSelect?.(visit ?? null);
    });

    // Double-click → open article
    cy.on("dblclick", "node", (evt) => {
      const nodeData = evt.target.data() as { url: string };
      window.open(nodeData.url, "_blank", "noopener");
    });

    // Hover → tooltip
    cy.on("mouseover", "node", (evt) => {
      const nodeData = evt.target.data() as {
        fullTitle: string;
        domain: string;
        dwell: number | null;
        excerpt: string | null;
      };
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

    // Click on background → deselect
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        onVisitSelect?.(null);
        setTooltip(null);
      }
    });

    // Fit on mount
    cy.fit(undefined, 20);

    cyRef.current = cy;
  }, [visits, crossSessionEdges, rootVisitId, onVisitSelect]);

  useEffect(() => {
    void buildGraph();
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
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
    </div>
  );
}
