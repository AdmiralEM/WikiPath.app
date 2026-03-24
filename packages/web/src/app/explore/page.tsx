"use client";
// =============================================================================
// WikiPath — /explore
// =============================================================================
// Cross-session analysis: top articles, top categories, session overlap, stats.
// =============================================================================

import { useState, useEffect } from "react";
import type { Session, TopArticle, Visit } from "@wikipath/shared";
import { formatDuration } from "@wikipath/shared";
import { storageAdapter } from "@/lib/storage";

interface GlobalStats {
  totalSessions: number;
  totalVisits: number;
  uniqueArticles: number;
  totalReadingTimeMs: number;
  avgDepth: number;
  wikis: string[];
}

interface TopCategory {
  name: string;
  count: number;
}

export default function ExplorePage() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [topArticles, setTopArticles] = useState<TopArticle[]>([]);
  const [topCategories, setTopCategories] = useState<TopCategory[]>([]);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<TopArticle | null>(null);
  const [overlappingSessions, setOverlappingSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [sessions, top] = await Promise.all([
        storageAdapter.getSessions({ sort: "desc" }),
        storageAdapter.getTopArticles(20),
      ]);

      setRecentSessions(sessions.slice(0, 5));
      setTopArticles(top);

      // Aggregate global stats + categories
      let totalVisits = 0;
      let totalReadingTimeMs = 0;
      let totalDepth = 0;
      const uniqueArticleIds = new Set<string>();
      const wikiDomains = new Set<string>();
      const categoryCounts = new Map<string, number>();

      for (const session of sessions) {
        totalVisits += session.metadata.visitCount;
        session.metadata.wikis.forEach((w) => wikiDomains.add(w));
        if (session.endedAt !== null) {
          totalReadingTimeMs += session.endedAt - session.startedAt;
        }

        // Collect per-visit data for categories and depth
        const visits: Visit[] = await storageAdapter.getVisitsBySession(session.id);
        for (const visit of visits) {
          uniqueArticleIds.add(visit.articleId);
          totalDepth += visit.depth;
          for (const cat of visit.metadata.categories ?? []) {
            categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
          }
        }
      }

      const topCats: TopCategory[] = [...categoryCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      setTopCategories(topCats);

      setStats({
        totalSessions: sessions.length,
        totalVisits,
        uniqueArticles: uniqueArticleIds.size,
        totalReadingTimeMs,
        avgDepth: totalVisits > 0 ? Math.round((totalDepth / totalVisits) * 10) / 10 : 0,
        wikis: [...wikiDomains],
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleArticleClick(article: TopArticle) {
    setSelectedArticle(article);
    const sessions = await storageAdapter.getOverlappingSessions(article.articleId);
    setOverlappingSessions(sessions);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--ctp-overlay0)] text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--ctp-lavender)]">Explore</h1>

      {/* Global stats */}
      {stats && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--ctp-subtext1)] uppercase tracking-wide mb-3">
            Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Sessions" value={String(stats.totalSessions)} />
            <StatCard label="Total Visits" value={String(stats.totalVisits)} />
            <StatCard label="Unique Articles" value={String(stats.uniqueArticles)} />
            <StatCard
              label="Reading Time"
              value={stats.totalReadingTimeMs > 0 ? formatDuration(stats.totalReadingTimeMs) : "—"}
            />
            <StatCard label="Avg Depth" value={stats.totalVisits > 0 ? String(stats.avgDepth) : "—"} />
          </div>
          {stats.wikis.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.wikis.map((w) => (
                <span
                  key={w}
                  className="text-xs px-2.5 py-1 rounded-full bg-[var(--ctp-surface1)] text-[var(--ctp-subtext0)]"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top articles */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--ctp-subtext1)] uppercase tracking-wide mb-3">
            Most Visited Articles
          </h2>
          {topArticles.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-1">
              {topArticles.map((article, i) => (
                <li key={article.articleId}>
                  <button
                    onClick={() => void handleArticleClick(article)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      selectedArticle?.articleId === article.articleId
                        ? "bg-[var(--ctp-surface1)]"
                        : "hover:bg-[var(--ctp-surface0)]"
                    }`}
                  >
                    <span className="text-[var(--ctp-overlay0)] text-xs w-5 text-right flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[var(--ctp-text)] text-sm truncate">
                      {article.articleTitle}
                    </span>
                    <span className="text-[var(--ctp-lavender)] text-xs font-semibold flex-shrink-0">
                      ×{article.visitCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Overlapping sessions / recent sessions */}
        <section>
          {selectedArticle ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[var(--ctp-subtext1)] uppercase tracking-wide flex-1">
                  Sessions with &ldquo;{selectedArticle.articleTitle}&rdquo;
                </h2>
                <button
                  onClick={() => { setSelectedArticle(null); setOverlappingSessions([]); }}
                  className="text-[var(--ctp-overlay0)] hover:text-[var(--ctp-text)] text-xs"
                >
                  Clear
                </button>
              </div>
              {overlappingSessions.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-1">
                  {overlappingSessions.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-[var(--ctp-subtext1)] uppercase tracking-wide mb-3">
                Recent Sessions
              </h2>
              {recentSessions.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-1">
                  {recentSessions.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      {/* Top categories */}
      {topCategories.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--ctp-subtext1)] uppercase tracking-wide mb-3">
            Top Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {topCategories.map((cat) => (
              <div
                key={cat.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--ctp-surface0)] border border-[var(--ctp-surface1)]"
              >
                <span className="text-xs text-[var(--ctp-text)]">{cat.name}</span>
                <span className="text-[10px] font-bold text-[var(--ctp-mauve)] bg-[var(--ctp-surface1)] rounded-full px-1.5">
                  {cat.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--ctp-mantle)] border border-[var(--ctp-surface0)] p-4 text-center">
      <div className="text-[10px] text-[var(--ctp-overlay1)] uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold text-[var(--ctp-lavender)]">{value}</div>
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  return (
    <li>
      <a
        href={`/session?id=${session.id}`}
        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--ctp-surface0)] transition-colors"
      >
        <span className="flex-1 text-[var(--ctp-text)] text-sm truncate">{session.title}</span>
        <span className="text-[var(--ctp-overlay1)] text-xs flex-shrink-0">
          {session.metadata.visitCount} pg
        </span>
        <span className="text-[var(--ctp-overlay0)] text-xs flex-shrink-0">
          {new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </a>
    </li>
  );
}

function Empty() {
  return (
    <p className="text-[var(--ctp-overlay0)] text-sm px-3 py-2">No data yet.</p>
  );
}
