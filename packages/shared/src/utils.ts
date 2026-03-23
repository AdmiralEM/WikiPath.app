// =============================================================================
// WikiPath.app — Pure Utility Functions
// =============================================================================
// No platform-specific imports. All functions are side-effect free.
// =============================================================================

import type { Edge, Session, SessionMetadata, Visit, WikiSource } from "./types.js";

// -----------------------------------------------------------------------------
// Wiki Source Parsing
// -----------------------------------------------------------------------------

/**
 * Parse a URL and return a WikiSource if it matches a known wiki pattern.
 * Supports Wikipedia (e.g., en.wikipedia.org) and Fandom (e.g., starwars.fandom.com).
 * Returns null for non-wiki URLs.
 */
export function parseWikiSource(url: string): WikiSource | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname;

  // Wikipedia: <lang>.wikipedia.org
  const wikipediaMatch = hostname.match(/^([a-z]{2,3}(?:-[a-z]+)?)\.wikipedia\.org$/i);
  if (wikipediaMatch) {
    return {
      type: "wikipedia",
      domain: hostname.toLowerCase(),
      language: wikipediaMatch[1]?.toLowerCase() ?? null,
    };
  }

  // Fandom: <wiki>.fandom.com
  const fandomMatch = hostname.match(/^[a-z0-9-]+\.fandom\.com$/i);
  if (fandomMatch) {
    return {
      type: "fandom",
      domain: hostname.toLowerCase(),
      language: null,
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// Article Title Extraction
// -----------------------------------------------------------------------------

/**
 * Extract and normalize the article title from a wiki URL path.
 * Handles /wiki/<Title> paths, URL-decodes the title, and replaces underscores with spaces.
 * Returns null if the URL does not contain a /wiki/ path.
 */
export function extractArticleTitle(url: string): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const pathMatch = parsedUrl.pathname.match(/^\/wiki\/(.+)$/);
  if (!pathMatch || !pathMatch[1]) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(pathMatch[1]);
    return decoded.replace(/_/g, " ");
  } catch {
    // Malformed percent-encoding — return with underscores replaced but not decoded
    return pathMatch[1].replace(/_/g, " ");
  }
}

// -----------------------------------------------------------------------------
// Article ID
// -----------------------------------------------------------------------------

/**
 * Build a normalized, unique article identifier from a wiki source and article title.
 * Format: `${wiki.domain}:${title}`
 */
export function buildArticleId(wiki: WikiSource, title: string): string {
  return `${wiki.domain}:${title}`;
}

// -----------------------------------------------------------------------------
// Tracked Domain Matching
// -----------------------------------------------------------------------------

/**
 * Check if a URL matches any of the tracked domain patterns.
 * Supports wildcard prefix patterns like "*.wikipedia.org".
 */
export function isTrackedUrl(url: string, trackedDomains: string[]): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  for (const pattern of trackedDomains) {
    const normalizedPattern = pattern.toLowerCase();
    if (normalizedPattern.startsWith("*.")) {
      // Wildcard: *.wikipedia.org matches en.wikipedia.org, ja.wikipedia.org, etc.
      const suffix = normalizedPattern.slice(2); // "wikipedia.org"
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
        return true;
      }
    } else {
      // Exact match
      if (hostname === normalizedPattern) {
        return true;
      }
    }
  }

  return false;
}

// -----------------------------------------------------------------------------
// Edge Derivation
// -----------------------------------------------------------------------------

/**
 * Derive navigation edges from a list of visits using parentVisitId relationships.
 * Each visit with a non-null parentVisitId produces one edge.
 */
export function deriveEdges(visits: Visit[]): Edge[] {
  const edges: Edge[] = [];
  for (const visit of visits) {
    if (visit.parentVisitId !== null) {
      edges.push({
        sourceVisitId: visit.parentVisitId,
        targetVisitId: visit.id,
        type: "navigation",
      });
    }
  }
  return edges;
}

/**
 * Derive cross-session edges for articles that appear in multiple sessions.
 * When the same articleId appears in two different sessions, we emit a cross-session
 * edge connecting the later visit back to the earlier one.
 */
export function deriveCrossSessionEdges(
  sessions: Session[],
  visitsBySession: Map<string, Visit[]>
): Edge[] {
  // Build a map from articleId → visits (sorted by visitedAt ascending)
  const articleVisits = new Map<string, Visit[]>();

  for (const session of sessions) {
    const visits = visitsBySession.get(session.id) ?? [];
    for (const visit of visits) {
      const existing = articleVisits.get(visit.articleId);
      if (existing) {
        existing.push(visit);
      } else {
        articleVisits.set(visit.articleId, [visit]);
      }
    }
  }

  const edges: Edge[] = [];

  for (const visits of articleVisits.values()) {
    if (visits.length < 2) continue;

    // Sort by visitedAt
    const sorted = [...visits].sort((a, b) => a.visitedAt - b.visitedAt);

    // Emit an edge from each earlier visit to each later visit in a different session
    for (let i = 0; i < sorted.length - 1; i++) {
      const source = sorted[i];
      const next = sorted[i + 1];
      if (source && next && source.sessionId !== next.sessionId) {
        edges.push({
          sourceVisitId: source.id,
          targetVisitId: next.id,
          type: "cross-session",
        });
      }
    }
  }

  return edges;
}

// -----------------------------------------------------------------------------
// Session Metadata
// -----------------------------------------------------------------------------

/**
 * Compute aggregated metadata for a session from its list of visits.
 */
export function buildSessionMetadata(visits: Visit[]): SessionMetadata {
  const uniqueArticleIds = new Set<string>();
  const wikiDomains = new Set<string>();
  let maxDepth = 0;

  for (const visit of visits) {
    uniqueArticleIds.add(visit.articleId);
    wikiDomains.add(visit.wiki.domain);
    if (visit.depth > maxDepth) {
      maxDepth = visit.depth;
    }
  }

  return {
    visitCount: visits.length,
    uniqueArticles: uniqueArticleIds.size,
    wikis: Array.from(wikiDomains),
    maxDepth,
    tags: [],
  };
}

// -----------------------------------------------------------------------------
// Session Timeout
// -----------------------------------------------------------------------------

/**
 * Returns true if the session has timed out based on the last visit timestamp.
 */
export function isSessionTimedOut(lastVisitAt: number, timeoutMs: number): boolean {
  return Date.now() - lastVisitAt >= timeoutMs;
}

// -----------------------------------------------------------------------------
// Duration Formatting
// -----------------------------------------------------------------------------

/**
 * Format a duration in milliseconds as a human-readable string.
 * Examples: "2h 15m", "45m", "30s", "0s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

// -----------------------------------------------------------------------------
// ID Generation
// -----------------------------------------------------------------------------

/**
 * Generate a UUID v4 using the platform crypto API.
 */
export function generateId(): string {
  return crypto.randomUUID();
}
