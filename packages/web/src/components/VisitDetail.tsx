"use client";
// =============================================================================
// WikiPath Web — VisitDetail
// =============================================================================
// Panel shown when a node is clicked in SessionGraph.
// =============================================================================

import type { Visit } from "@wikipath/shared";
import { formatDuration } from "@wikipath/shared";

interface VisitDetailProps {
  visit: Visit;
  onClose: () => void;
}

export default function VisitDetail({ visit, onClose }: VisitDetailProps) {
  const dwell = visit.dwellTime !== null ? formatDuration(visit.dwellTime) : "—";
  const date = new Date(visit.visitedAt).toLocaleString();

  return (
    <div className="bg-[var(--ctp-mantle)] border border-[var(--ctp-surface1)] rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[var(--ctp-text)] font-semibold text-sm leading-tight">
          {visit.articleTitle}
        </h3>
        <button
          onClick={onClose}
          className="text-[var(--ctp-overlay0)] hover:text-[var(--ctp-text)] text-lg leading-none flex-shrink-0"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="text-[var(--ctp-subtext0)] text-xs">{visit.wiki.domain}</div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Depth" value={String(visit.depth)} />
        <Stat label="Dwell" value={dwell} />
        <Stat
          label="Scroll"
          value={visit.metadata.scrollDepth !== null
            ? `${Math.round(visit.metadata.scrollDepth * 100)}%`
            : "—"}
        />
      </div>

      <div className="text-[var(--ctp-overlay0)] text-[10px]">{date}</div>

      {visit.metadata.excerpt && (
        <p className="text-[var(--ctp-subtext0)] text-xs leading-relaxed line-clamp-4 border-t border-[var(--ctp-surface0)] pt-2">
          {visit.metadata.excerpt}
        </p>
      )}

      <a
        href={visit.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center text-xs py-2 rounded-lg bg-[var(--ctp-surface0)] text-[var(--ctp-lavender)] hover:bg-[var(--ctp-surface1)] transition-colors"
      >
        Open in Wikipedia ↗
      </a>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--ctp-surface0)] rounded-lg p-2 text-center">
      <div className="text-[10px] text-[var(--ctp-overlay1)] uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-sm font-bold text-[var(--ctp-lavender)]">{value}</div>
    </div>
  );
}
