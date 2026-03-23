"use client";
// =============================================================================
// WikiPath — Dashboard Home
// =============================================================================
// Session list sidebar (left) + graph viewer (right).
// Import/export buttons. Click session → load visits → render graph.
// =============================================================================

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { Session, Visit } from "@wikipath/shared";
import { formatDuration } from "@wikipath/shared";
import { storageAdapter } from "@/lib/storage";
import VisitDetail from "@/components/VisitDetail";

// Lazy-load graph (Cytoscape requires browser)
const SessionGraph = dynamic(() => import("@/components/SessionGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-[var(--ctp-overlay0)] text-sm">
      Loading graph…
    </div>
  ),
});

export default function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const data = await storageAdapter.getSessions({ sort: "desc" });
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }

  async function selectSession(session: Session) {
    setSelectedSession(session);
    setSelectedVisit(null);
    const v = await storageAdapter.getVisitsBySession(session.id);
    setVisits(v);
  }

  async function handleExport() {
    const data = await storageAdapter.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wikipath-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Parameters<typeof storageAdapter.importAll>[0];
      await storageAdapter.importAll(data);
      await loadSessions();
    } catch {
      alert("Failed to import: invalid file format.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  const totalVisits = sessions.reduce((s, sess) => s + sess.metadata.visitCount, 0);

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-[var(--ctp-surface0)] bg-[var(--ctp-mantle)]">
        {/* Stats */}
        <div className="p-4 border-b border-[var(--ctp-surface0)]">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Sessions" value={String(sessions.length)} />
            <StatCard label="Visits" value={String(totalVisits)} />
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 border-b border-[var(--ctp-surface0)] flex gap-2">
          <button
            onClick={() => void handleExport()}
            className="flex-1 text-xs py-1.5 rounded-md bg-[var(--ctp-surface0)] text-[var(--ctp-subtext1)] hover:bg-[var(--ctp-surface1)] hover:text-[var(--ctp-text)] transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex-1 text-xs py-1.5 rounded-md bg-[var(--ctp-surface0)] text-[var(--ctp-subtext1)] hover:bg-[var(--ctp-surface1)] hover:text-[var(--ctp-text)] transition-colors disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import JSON"}
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => void handleImport(e)} />
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-[var(--ctp-overlay0)] text-sm text-center">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-[var(--ctp-overlay0)] text-sm text-center leading-relaxed">
              No sessions yet.
              <br />
              <span className="text-xs">Install the extension and browse Wikipedia.</span>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--ctp-surface0)]">
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    onClick={() => void selectSession(session)}
                    className={`w-full text-left p-3 hover:bg-[var(--ctp-surface0)] transition-colors ${
                      selectedSession?.id === session.id ? "bg-[var(--ctp-surface0)]" : ""
                    }`}
                  >
                    <div className="text-[var(--ctp-text)] text-sm font-medium truncate mb-1">
                      {session.title}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--ctp-overlay1)]">
                      <span>{session.metadata.visitCount} pages</span>
                      <span>·</span>
                      <span>
                        {session.endedAt !== null
                          ? formatDuration(session.endedAt - session.startedAt)
                          : "ongoing"}
                      </span>
                      <span>·</span>
                      <span>{formatDate(session.startedAt)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedSession ? (
          <>
            {/* Session header */}
            <div className="px-4 py-3 border-b border-[var(--ctp-surface0)] flex items-center gap-3">
              <div>
                <h2 className="text-[var(--ctp-text)] font-semibold text-sm">
                  {selectedSession.title}
                </h2>
                <div className="text-[var(--ctp-overlay1)] text-xs">
                  {selectedSession.metadata.visitCount} pages ·{" "}
                  {selectedSession.metadata.uniqueArticles} unique · depth{" "}
                  {selectedSession.metadata.maxDepth}
                </div>
              </div>
              <a
                href={`/session/${selectedSession.id}/`}
                className="ml-auto text-xs px-3 py-1.5 rounded-md bg-[var(--ctp-surface0)] text-[var(--ctp-lavender)] hover:bg-[var(--ctp-surface1)] transition-colors"
              >
                Full view ↗
              </a>
            </div>

            {/* Graph + detail panel */}
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <SessionGraph
                  visits={visits}
                  rootVisitId={selectedSession.rootVisitId}
                  onVisitSelect={setSelectedVisit}
                />
              </div>

              {selectedVisit && (
                <div className="w-64 flex-shrink-0 overflow-y-auto p-3 border-l border-[var(--ctp-surface0)]">
                  <VisitDetail
                    visit={selectedVisit}
                    onClose={() => setSelectedVisit(null)}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--ctp-overlay0)] text-sm">
            Select a session to view its graph.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--ctp-surface0)] p-2 text-center">
      <div className="text-[10px] text-[var(--ctp-overlay1)] uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <div className="text-xl font-bold text-[var(--ctp-lavender)]">{value}</div>
    </div>
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
