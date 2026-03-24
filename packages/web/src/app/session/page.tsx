"use client";
// =============================================================================
// WikiPath — /session?id=<id>
// =============================================================================
// Full-width graph view for a single session with detail panel.
// Uses query params (not dynamic route) for static-export compatibility.
// =============================================================================

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { Session, StoredEdge, Visit } from "@wikipath/shared";
import { formatDuration } from "@wikipath/shared";
import { storageAdapter } from "@/lib/storage";
import VisitDetail from "@/components/VisitDetail";

const SessionGraph = dynamic(() => import("@/components/SessionGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-[var(--ctp-overlay0)] text-sm">
      Loading graph…
    </div>
  ),
});

function SessionDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";

  const [session, setSession] = useState<Session | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [contextualEdges, setContextualEdges] = useState<StoredEdge[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); setNotFound(true); return; }
    void load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const s = await storageAdapter.getSession(id);
      if (!s) { setNotFound(true); return; }
      const [v, e] = await Promise.all([
        storageAdapter.getVisitsBySession(id),
        storageAdapter.getEdgesBySession(id),
      ]);
      setSession(s);
      setVisits(v);
      setContextualEdges(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--ctp-overlay0)] text-sm">
        Loading…
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--ctp-overlay0)]">
        <p className="text-sm">Session not found.</p>
        <a href="/" className="text-xs text-[var(--ctp-lavender)] hover:underline">← Back to dashboard</a>
      </div>
    );
  }

  const duration = session.endedAt !== null
    ? formatDuration(session.endedAt - session.startedAt)
    : "ongoing";

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--ctp-surface0)] bg-[var(--ctp-mantle)] flex items-center gap-4 flex-shrink-0">
        <a href="/" className="text-[var(--ctp-overlay1)] hover:text-[var(--ctp-text)] text-sm transition-colors">
          ← Dashboard
        </a>
        <div className="flex-1 min-w-0">
          <h1 className="text-[var(--ctp-text)] font-semibold text-sm truncate">{session.title}</h1>
          <div className="text-[var(--ctp-overlay1)] text-xs flex gap-3">
            <span>{session.metadata.visitCount} pages</span>
            <span>{session.metadata.uniqueArticles} unique</span>
            <span>depth {session.metadata.maxDepth}</span>
            <span>{duration}</span>
            <span>{new Date(session.startedAt).toLocaleString()}</span>
          </div>
        </div>
        {session.metadata.tags.length > 0 && (
          <div className="flex gap-1">
            {session.metadata.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--ctp-surface1)] text-[var(--ctp-subtext0)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Graph + detail panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <SessionGraph
            visits={visits}
            contextualEdges={contextualEdges}
            rootVisitId={session.rootVisitId}
            onVisitSelect={setSelectedVisit}
          />
        </div>

        {selectedVisit && (
          <div className="w-72 flex-shrink-0 overflow-y-auto p-4 border-l border-[var(--ctp-surface0)] bg-[var(--ctp-mantle)]">
            <VisitDetail
              visit={selectedVisit}
              onClose={() => setSelectedVisit(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SessionDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-[var(--ctp-overlay0)] text-sm">
          Loading…
        </div>
      }
    >
      <SessionDetailContent />
    </Suspense>
  );
}
