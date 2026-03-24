// =============================================================================
// WikiPath.app — Core Data Model
// =============================================================================
// This is the single source of truth for all data types used across platforms.
// Every client (extension, web, mobile) imports from here.
// =============================================================================

// -----------------------------------------------------------------------------
// Wiki Source
// -----------------------------------------------------------------------------

export type WikiType = "wikipedia" | "fandom" | "mediawiki";

export interface WikiSource {
  /** The wiki platform type */
  type: WikiType;
  /** Full domain, e.g., "en.wikipedia.org", "starwars.fandom.com" */
  domain: string;
  /** Language code for Wikipedia, e.g., "en", "ja". Null for non-Wikipedia wikis. */
  language: string | null;
}

// -----------------------------------------------------------------------------
// Visit
// -----------------------------------------------------------------------------

export interface VisitMetadata {
  /** 0-1 representing how far the user scrolled on the page. Null if not captured. */
  scrollDepth: number | null;
  /** First ~200 characters of the article body, for search/preview purposes. */
  excerpt: string | null;
  /** Wikipedia categories on the article page, if captured. */
  categories?: string[];
}

export interface Visit {
  /** Unique identifier (UUID v4) */
  id: string;
  /** The session this visit belongs to */
  sessionId: string;
  /** The visit from which the user navigated to this page. Null for session root. */
  parentVisitId: string | null;
  /** Full URL of the article */
  url: string;
  /** Parsed wiki source information */
  wiki: WikiSource;
  /** Human-readable article title, extracted from URL or page */
  articleTitle: string;
  /**
   * Normalized article identifier: `${wiki.domain}:${articleTitle}`.
   * Used for deduplication and cross-session analysis.
   */
  articleId: string;
  /** When the article was visited (Unix timestamp, ms) */
  visitedAt: number;
  /** Time spent on the page in milliseconds. Null if not yet calculated. */
  dwellTime: number | null;
  /** Distance from the session root (0 = root, 1 = first click, etc.) */
  depth: number;
  /** Additional captured metadata */
  metadata: VisitMetadata;
}

// -----------------------------------------------------------------------------
// Session
// -----------------------------------------------------------------------------

export interface SessionMetadata {
  /** Total number of visits in this session */
  visitCount: number;
  /** Number of unique articles (by articleId) */
  uniqueArticles: number;
  /** List of distinct wiki domains visited */
  wikis: string[];
  /** Length of the longest chain from root to leaf */
  maxDepth: number;
  /** User-applied tags for organization */
  tags: string[];
}

export interface Session {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Display title. Auto-generated from root article, or user-defined. */
  title: string;
  /** When the session started (Unix timestamp, ms) */
  startedAt: number;
  /** When the session ended. Null if the session is still active. */
  endedAt: number | null;
  /** The ID of the first visit in the session */
  rootVisitId: string;
  /** Aggregated session statistics */
  metadata: SessionMetadata;
}

// -----------------------------------------------------------------------------
// Edge
// -----------------------------------------------------------------------------

export type EdgeType = "navigation" | "cross-session" | "contextual";

/** Derived (not stored) — used for graph rendering only */
export interface Edge {
  /** The visit the user navigated FROM */
  sourceVisitId: string;
  /** The visit the user navigated TO */
  targetVisitId: string;
  /** Whether this was a direct navigation, cross-session, or contextual link */
  type: EdgeType;
}

/** Stored — persisted contextual edges discovered via content-link scanning */
export interface StoredEdge {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Session this edge belongs to */
  sessionId: string;
  /** Visit where the link was found */
  sourceVisitId: string;
  /** Visit that was linked to */
  targetVisitId: string;
  /** Always "contextual" for stored edges */
  type: "contextual";
}

// -----------------------------------------------------------------------------
// Export / Import
// -----------------------------------------------------------------------------

export interface WikiPathExport {
  /** Schema version for forward compatibility */
  version: 1;
  /** When this export was created (Unix timestamp, ms) */
  exportedAt: number;
  /** Which platform created this export */
  platform: string;
  /** All sessions */
  sessions: Session[];
  /** All visits */
  visits: Visit[];
  /** All stored contextual edges (optional for backward compat with older exports) */
  edges?: StoredEdge[];
}

// -----------------------------------------------------------------------------
// Storage Adapter
// -----------------------------------------------------------------------------

export interface SessionQueryOptions {
  limit?: number;
  offset?: number;
  sort?: "asc" | "desc";
}

export interface TopArticle {
  articleId: string;
  articleTitle: string;
  visitCount: number;
}

export interface ImportResult {
  sessions: number;
  visits: number;
  edges: number;
}

/**
 * Platform-agnostic storage interface.
 *
 * Each platform (Chrome extension, web app, mobile) implements this interface
 * with its native storage backend. All business logic operates against this
 * interface, making it trivially swappable.
 */
export interface StorageAdapter {
  // --- Sessions ---
  getSessions(options?: SessionQueryOptions): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(session: Omit<Session, "id">): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session>;
  deleteSession(id: string): Promise<void>;

  // --- Visits ---
  getVisitsBySession(sessionId: string): Promise<Visit[]>;
  getVisit(id: string): Promise<Visit | null>;
  createVisit(visit: Omit<Visit, "id">): Promise<Visit>;
  updateVisit(id: string, updates: Partial<Visit>): Promise<Visit>;

  // --- Edges ---
  getEdgesBySession(sessionId: string): Promise<StoredEdge[]>;
  createEdge(edge: Omit<StoredEdge, "id">): Promise<StoredEdge>;

  // --- Search & Analysis ---
  searchVisits(query: string): Promise<Visit[]>;
  getArticleHistory(articleId: string): Promise<Visit[]>;
  getTopArticles(limit: number): Promise<TopArticle[]>;
  getOverlappingSessions(articleId: string): Promise<Session[]>;

  // --- Bulk Operations ---
  exportAll(): Promise<WikiPathExport>;
  importAll(data: WikiPathExport): Promise<ImportResult>;
  clear(): Promise<void>;
}

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export interface WikiPathConfig {
  /** Session idle timeout in milliseconds. Default: 30 minutes. */
  sessionTimeoutMs: number;
  /** Wiki domains to track. Default: ["*.wikipedia.org"] */
  trackedDomains: string[];
  /** Whether to capture article excerpts. Default: true. */
  captureExcerpts: boolean;
  /** Whether to track scroll depth. Default: true. */
  trackScrollDepth: boolean;
  /** Maximum excerpt length in characters. Default: 200. */
  maxExcerptLength: number;
}

export const DEFAULT_CONFIG: WikiPathConfig = {
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  trackedDomains: ["*.wikipedia.org"],
  captureExcerpts: true,
  trackScrollDepth: true,
  maxExcerptLength: 200,
};

// -----------------------------------------------------------------------------
// Session State Machine
// -----------------------------------------------------------------------------

export type SessionState = "idle" | "active";

export interface SessionStateContext {
  state: SessionState;
  activeSessionId: string | null;
  lastVisitAt: number | null;
}
