# WikiPath.app — Technical Architecture

## Overview

WikiPath is a local-first application that tracks Wikipedia browsing sessions and visualizes them as interactive node graphs. The architecture prioritizes data portability, platform independence, and zero reliance on external services.

## Data Model

The core data model is intentionally simple. Three entities capture everything:

### Session

A session represents a single browsing "rabbit hole" — a contiguous period of wiki browsing. Sessions are auto-detected based on idle timeouts (configurable, default 30 minutes) or explicit user action (starting/ending a session manually).

```typescript
interface Session {
  id: string;                  // UUID
  title: string;               // Auto-generated or user-defined
  startedAt: number;           // Unix timestamp (ms)
  endedAt: number | null;      // Null if session is active
  rootVisitId: string;         // The first visit in the session
  metadata: {
    visitCount: number;
    uniqueArticles: number;
    wikis: string[];           // e.g., ["en.wikipedia.org", "starwars.fandom.com"]
    maxDepth: number;          // Longest chain from root
    tags: string[];            // User-applied tags
  };
}
```

### Visit

A visit is a single article view within a session. Visits form the nodes of the graph.

```typescript
interface Visit {
  id: string;                  // UUID
  sessionId: string;           // FK → Session
  parentVisitId: string | null; // The visit from which this link was followed (null for root)
  url: string;                 // Full article URL
  wiki: WikiSource;            // Parsed wiki identifier
  articleTitle: string;        // Extracted article title
  articleId: string;           // Normalized identifier (wiki + title)
  visitedAt: number;           // Unix timestamp (ms)
  dwellTime: number | null;    // Time spent on page (ms), null if not yet calculated
  depth: number;               // Distance from session root (0-indexed)
  metadata: {
    scrollDepth: number | null;  // 0-1, how far user scrolled
    excerpt: string | null;      // First ~200 chars of article (for search/preview)
  };
}
```

### WikiSource

Wiki sources are normalized so the same article across platforms is distinguishable:

```typescript
interface WikiSource {
  type: "wikipedia" | "fandom" | "mediawiki";
  domain: string;              // e.g., "en.wikipedia.org", "starwars.fandom.com"
  language: string | null;     // e.g., "en", "ja" (null for non-Wikipedia)
}
```

### Derived: Edge

Edges aren't stored explicitly — they're derived from `parentVisitId` relationships. The graph is a tree (each visit has at most one parent), but cross-session analysis can reveal implicit edges between articles visited across different sessions.

```typescript
// Derived at render time, not stored
interface Edge {
  sourceVisitId: string;
  targetVisitId: string;
  type: "navigation" | "cross-session"; // navigation = followed link, cross-session = same article in different sessions
}
```

## Storage Architecture

### StorageAdapter Interface

All platforms implement the same interface. This is the single integration point — swap the adapter, keep all logic.

```typescript
interface StorageAdapter {
  // Sessions
  getSessions(options?: { limit?: number; offset?: number; sort?: "asc" | "desc" }): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(session: Omit<Session, "id">): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session>;
  deleteSession(id: string): Promise<void>;

  // Visits
  getVisitsBySession(sessionId: string): Promise<Visit[]>;
  getVisit(id: string): Promise<Visit | null>;
  createVisit(visit: Omit<Visit, "id">): Promise<Visit>;
  updateVisit(id: string, updates: Partial<Visit>): Promise<Visit>;

  // Search & Analysis
  searchVisits(query: string): Promise<Visit[]>;
  getArticleHistory(articleId: string): Promise<Visit[]>;
  getTopArticles(limit: number): Promise<Array<{ articleId: string; articleTitle: string; visitCount: number }>>;
  getOverlappingSessions(articleId: string): Promise<Session[]>;

  // Bulk Operations
  exportAll(): Promise<WikiPathExport>;
  importAll(data: WikiPathExport): Promise<{ sessions: number; visits: number }>;
  clear(): Promise<void>;
}
```

### Platform Implementations

| Platform | Storage Backend | Notes |
|---|---|---|
| Chrome Extension | `chrome.storage.local` | 10MB default, can request `unlimitedStorage` permission |
| Web Dashboard | IndexedDB | Unlimited storage with user permission |
| iOS (future) | SwiftData / Core Data | On-device, syncs via iCloud if desired |
| Android (future) | Room (SQLite) | On-device |

### Export Format

Data portability is handled via a JSON export format. Users can export from any platform and import into another.

```typescript
interface WikiPathExport {
  version: 1;
  exportedAt: number;
  platform: string;
  sessions: Session[];
  visits: Visit[];
}
```

## Chrome Extension Architecture

The extension uses Manifest V3 with the following components:

### Background Service Worker

- Listens for tab navigation events (`chrome.webNavigation.onCompleted`)
- Filters for wiki domains (Wikipedia by default, configurable)
- Extracts article title from URL
- Determines session membership (active session + same tab lineage = same session)
- Creates `Visit` records and links them via `parentVisitId`

### Content Script

- Injected on wiki pages
- Captures additional metadata: scroll depth, time on page
- Intercepts link clicks to associate navigation with the specific link text/position
- Sends data to background worker via `chrome.runtime.sendMessage`

### Popup

- Shows current session status (active/inactive, visit count)
- Mini graph of current session (simplified Cytoscape.js instance)
- Quick actions: start/end session, open full dashboard, export

### Permissions

```json
{
  "permissions": [
    "storage",
    "unlimitedStorage",
    "tabs",
    "webNavigation"
  ],
  "host_permissions": [
    "*://*.wikipedia.org/*",
    "*://*.fandom.com/*"
  ]
}
```

## Web Dashboard Architecture

The web dashboard is a Next.js static site (no server required — runs entirely client-side after build).

### Pages

- `/` — Overview: recent sessions, quick stats, global graph
- `/session/[id]` — Full interactive graph for a single session
- `/explore` — Cross-session analysis, topic clusters, overlaps
- `/history` — Searchable, filterable list of all visits
- `/settings` — Session timeout config, wiki sources, export/import

### Visualization (Cytoscape.js)

Graph rendering uses Cytoscape.js with the following configuration:

- **Layout**: `dagre` (directed acyclic graph) for session trees, `cose-bilkent` for cross-session cluster views
- **Node styling**: Color-coded by wiki source, sized by dwell time, labeled with article title
- **Edge styling**: Directional arrows, thickness based on depth
- **Interactions**: Click node to preview article, double-click to open in Wikipedia, pinch/scroll to zoom, drag to pan
- **Performance**: Virtualized rendering for graphs with 200+ nodes, progressive loading for large sessions

### Data Flow

The web dashboard reads data from IndexedDB directly, or from an imported JSON file. There is no API layer — the `StorageAdapter` interface abstracts all data access.

```
[Import JSON / IndexedDB] → StorageAdapter → React State → Cytoscape.js Renderer
```

## Session Detection Logic

Sessions are detected via a state machine in the background worker:

```
IDLE → (wiki page visited) → ACTIVE
ACTIVE → (wiki page visited within timeout) → ACTIVE (extend session)
ACTIVE → (timeout exceeded) → IDLE (close session, set endedAt)
ACTIVE → (user manually ends) → IDLE
```

**Timeout**: Default 30 minutes of no wiki page visits. Configurable in settings.

**Tab Lineage**: The extension tracks which tab spawned which. If a user opens a wiki link in a new tab from an existing session tab, the new tab's visits are part of the same session. `parentVisitId` is determined by which tab/visit the new navigation originated from.

**Manual Override**: Users can split or merge sessions after the fact from the dashboard.

## Statistics & Analysis

All statistics are computed client-side from the stored data:

- **Top Articles**: Aggregated visit count per `articleId` across all sessions
- **Topic Clusters**: Naive clustering based on shared words in article titles (v1), potentially Wikipedia categories via API in later versions
- **Session Overlap**: Articles that appear in multiple sessions, ranked by frequency
- **Browsing Patterns**: Time-of-day distribution, average session depth, average dwell time
- **Genre Detection**: Based on Wikipedia article categories (fetched lazily and cached)

## Future Considerations

### Article Watching (v0.4+)

Watching articles for changes would require periodic polling of the MediaWiki API's `action=query&prop=revisions` endpoint. This is best implemented as an optional background task in the extension, polling watched articles on a configurable interval (e.g., every 6 hours). Changes would surface as notifications via `chrome.notifications`.

### Mobile Apps (Future)

Mobile apps would implement the same `StorageAdapter` interface with platform-native storage. The graph visualization would use a native graph library (e.g., `GraphView` on iOS). Data portability between platforms is handled via the JSON export format — users can export from the extension and import into the mobile app, or vice versa.

### Firefox Extension

Manifest V3 is largely compatible between Chrome and Firefox. The main differences are in the `browser` vs `chrome` namespace and some storage API nuances. A thin compatibility layer in the shared package would handle this.
