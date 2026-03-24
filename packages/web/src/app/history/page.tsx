"use client";
// =============================================================================
// WikiPath — /history
// =============================================================================
// Searchable, filterable list of all visits.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import type { Visit } from "@wikipath/shared";
import { formatDuration } from "@wikipath/shared";
import { storageAdapter } from "@/lib/storage";

export default function HistoryPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Visit[]>([]);
  const [allVisits, setAllVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterWiki, setFilterWiki] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [wikis, setWikis] = useState<string[]>([]);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      // Load all sessions then all visits
      const sessions = await storageAdapter.getSessions({ sort: "desc" });
      const visitArrays = await Promise.all(
        sessions.map((s) => storageAdapter.getVisitsBySession(s.id))
      );
      const all = visitArrays.flat().sort((a, b) => b.visitedAt - a.visitedAt);
      setAllVisits(all);
      setResults(all);

      const uniqueWikis = [...new Set(all.map((v) => v.wiki.domain))].sort();
      setWikis(uniqueWikis);
    } finally {
      setLoading(false);
    }
  }

  const applyFilters = useCallback(
    (q: string, wiki: string, from: string, to: string, source: Visit[]) => {
      let filtered = source;

      if (q.trim()) {
        const lower = q.toLowerCase();
        filtered = filtered.filter(
          (v) =>
            v.articleTitle.toLowerCase().includes(lower) ||
            v.metadata.excerpt?.toLowerCase().includes(lower)
        );
      }

      if (wiki) {
        filtered = filtered.filter((v) => v.wiki.domain === wiki);
      }

      if (from) {
        const fromMs = new Date(from).getTime();
        filtered = filtered.filter((v) => v.visitedAt >= fromMs);
      }

      if (to) {
        const toMs = new Date(to).getTime() + 86_400_000; // inclusive day
        filtered = filtered.filter((v) => v.visitedAt <= toMs);
      }

      setResults(filtered);
    },
    []
  );

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    applyFilters(q, filterWiki, filterDateFrom, filterDateTo, allVisits);
  }

  function handleWikiChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const w = e.target.value;
    setFilterWiki(w);
    applyFilters(query, w, filterDateFrom, filterDateTo, allVisits);
  }

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setFilterDateFrom(v);
    applyFilters(query, filterWiki, v, filterDateTo, allVisits);
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setFilterDateTo(v);
    applyFilters(query, filterWiki, filterDateFrom, v, allVisits);
  }

  function clearFilters() {
    setQuery("");
    setFilterWiki("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setResults(allVisits);
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-6 space-y-5">
      <h1 className="text-2xl font-bold text-[var(--ctp-lavender)]">History</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <input
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search articles…"
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--ctp-mantle)] border border-[var(--ctp-surface1)] text-[var(--ctp-text)] placeholder-[var(--ctp-overlay0)] focus:outline-none focus:border-[var(--ctp-lavender)] transition-colors"
          />
        </div>

        {wikis.length > 1 && (
          <select
            value={filterWiki}
            onChange={handleWikiChange}
            className="px-3 py-2 text-sm rounded-lg bg-[var(--ctp-mantle)] border border-[var(--ctp-surface1)] text-[var(--ctp-text)] focus:outline-none focus:border-[var(--ctp-lavender)] transition-colors"
          >
            <option value="">All wikis</option>
            {wikis.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        )}

        <input
          type="date"
          value={filterDateFrom}
          onChange={handleFromChange}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--ctp-mantle)] border border-[var(--ctp-surface1)] text-[var(--ctp-text)] focus:outline-none focus:border-[var(--ctp-lavender)] transition-colors"
          title="From date"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={handleToChange}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--ctp-mantle)] border border-[var(--ctp-surface1)] text-[var(--ctp-text)] focus:outline-none focus:border-[var(--ctp-lavender)] transition-colors"
          title="To date"
        />

        {(query || filterWiki || filterDateFrom || filterDateTo) && (
          <button
            onClick={clearFilters}
            className="text-xs px-3 py-2 rounded-lg bg-[var(--ctp-surface0)] text-[var(--ctp-subtext1)] hover:bg-[var(--ctp-surface1)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-xs text-[var(--ctp-overlay1)]">
          {results.length} {results.length === 1 ? "visit" : "visits"}
          {results.length !== allVisits.length && ` of ${allVisits.length}`}
        </p>
      )}

      {/* Visit list */}
      {loading ? (
        <div className="text-[var(--ctp-overlay0)] text-sm py-8 text-center">Loading…</div>
      ) : results.length === 0 ? (
        <div className="text-[var(--ctp-overlay0)] text-sm py-8 text-center">No visits found.</div>
      ) : (
        <ul className="space-y-1">
          {results.map((visit) => (
            <VisitRow key={visit.id} visit={visit} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VisitRow({ visit }: { visit: Visit }) {
  const dwell = visit.dwellTime !== null ? formatDuration(visit.dwellTime) : null;
  const date = new Date(visit.visitedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--ctp-mantle)] transition-colors group">
      <div className="flex-1 min-w-0">
        <a
          href={visit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--ctp-text)] text-sm font-medium hover:text-[var(--ctp-lavender)] transition-colors"
        >
          {visit.articleTitle}
        </a>
        {visit.metadata.excerpt && (
          <p className="text-[var(--ctp-overlay0)] text-xs mt-0.5 line-clamp-1">
            {visit.metadata.excerpt}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-[var(--ctp-overlay1)] text-xs">
        <span className="hidden sm:inline">{visit.wiki.domain}</span>
        {dwell && <span>{dwell}</span>}
        <span>{date}</span>
        <a
          href={`/session?id=${visit.sessionId}`}
          className="opacity-0 group-hover:opacity-100 text-[var(--ctp-lavender)] transition-opacity"
          title="View session"
        >
          ↗
        </a>
      </div>
    </li>
  );
}
