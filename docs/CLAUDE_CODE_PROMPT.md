# WikiPath.app — Claude Code Build Prompt

Paste everything below the line into Claude Code as your first message.

---

## Initial Prompt

Build WikiPath.app from the spec. Read `CLAUDE.md` at the repo root for full project context, then read `docs/ARCHITECTURE.md` for the technical design, then read `packages/shared/src/types.ts` for the canonical data model. Those three files are your source of truth.

This is a pnpm monorepo with three packages: `shared`, `extension` (Chrome), and `web` (Next.js dashboard). Build them in this order:

### Phase 1: Foundation

1. **Initialize the monorepo.** Set up `pnpm-workspace.yaml`, root `package.json`, and `.devcontainer/devcontainer.json`. The devcontainer should install Node 20+ and pnpm, run `pnpm install` on create, and forward port 3000.

2. **Build `packages/shared`.** Implement everything in `types.ts` exactly as specified in the architecture doc — Session, Visit, Edge, WikiSource, WikiPathExport, StorageAdapter interface, WikiPathConfig with defaults, SessionStateContext. Then implement `utils.ts`: URL parsing (`parseWikiSource`, `extractArticleTitle`), article ID generation (`buildArticleId`), tracked URL matching (`isTrackedUrl`), graph helpers (`deriveEdges`, `deriveCrossSessionEdges`), session metadata builder (`buildSessionMetadata`), time helpers (`isSessionTimedOut`, `formatDuration`), and UUID generation (`generateId`). Barrel export from `index.ts`. Write Vitest tests for all utility functions — especially URL parsing across Wikipedia and Fandom URL formats, edge derivation, and session timeout logic.

3. **Set up the extension package** with your choice of bundler. Configure it to output `background.js`, `content.js`, `popup.js`, the manifest, and popup HTML to a `dist/` folder. Create placeholder PNG icons (just simple colored squares with a "W" are fine for now). Make sure the manifest has permissions for `storage`, `unlimitedStorage`, `tabs`, `webNavigation` and host permissions for `*://*.wikipedia.org/*` and `*://*.fandom.com/*`.

4. **Set up the web package** with Next.js (static export mode), Tailwind CSS configured with Catppuccin Mocha color tokens as CSS custom properties, and Cytoscape.js + cytoscape-dagre as dependencies.

### Phase 2: Extension

5. **Implement `ChromeStorageAdapter`** in `packages/extension/src/storage.ts`. It implements the `StorageAdapter` interface from shared, backed by `chrome.storage.local`. Store sessions and visits as keyed records. All methods from the interface must work: CRUD for sessions and visits, search, top articles, overlapping sessions, export/import, clear.

6. **Implement the background service worker** (`background.ts`). This is the brain:
   - Listen for `chrome.webNavigation.onCompleted` on main frames
   - Filter for tracked wiki URLs using `isTrackedUrl` from shared
   - Parse wiki source and extract article title using shared utils
   - Skip non-article namespace pages (Special:, Wikipedia:, Talk:, User:, etc.)
   - Manage session state machine: IDLE → (wiki visit) → ACTIVE → (timeout or manual end) → IDLE
   - Persist session state to `chrome.storage.local` so it survives service worker restarts
   - Track tab-to-visit mapping so we know which visit a new navigation came from
   - Track tab opener relationships (`chrome.tabs.onCreated` with `openerTabId`) for new-tab link follows
   - Calculate depth from parent visit
   - Calculate dwell time for the previous visit when recording a new one
   - Use `chrome.alarms` for session timeout (don't rely on `setTimeout` — service workers get killed)
   - Handle messages from content script (metadata updates) and popup (get state, end session, export)

7. **Implement the content script** (`content.ts`). Injected on wiki pages:
   - Extract article excerpt (first meaningful paragraph, truncated to ~200 chars)
   - Track scroll depth (throttled scroll listener, record max)
   - Send excerpt to background immediately on load
   - Send scroll depth on `beforeunload` and periodically (every 30s, in case service worker restarts)

8. **Implement the popup** (`popup.html` + `popup.ts`):
   - Show current session status (active/idle) with a visual indicator
   - If active: show session title, visit count, max depth, unique article count
   - End session button (when active)
   - Export button (downloads JSON)
   - Recent sessions list (last 10, showing title, page count, duration, date)
   - Style with Catppuccin Mocha colors (inline CSS, no build tooling needed for the popup HTML)

### Phase 3: Web Dashboard

9. **Implement `IndexedDBStorageAdapter`** in `packages/web/src/lib/storage.ts`. Same interface as the Chrome adapter, backed by IndexedDB with object stores for sessions and visits, indexed on `sessionId`, `articleId`, and `visitedAt`.

10. **Build the SessionGraph component** (`packages/web/src/components/SessionGraph.tsx`). This is the core visualization:
    - Takes a `Visit[]` and optional cross-session edges
    - Renders via Cytoscape.js with `dagre` layout (top-to-bottom directed tree)
    - Nodes: color-coded by wiki domain, sized by dwell time, labeled with truncated article title
    - Root node: distinct shape (diamond) with a gold border
    - Edges: directional arrows for navigation, dashed lines for cross-session links
    - Interactions: click node → show detail panel, double-click → open article in new tab, hover → tooltip with title/domain/dwell time/excerpt
    - Zoom, pan, fit-to-viewport on mount
    - Performance: handle sessions with 200+ nodes (Cytoscape handles this, just don't over-style)

11. **Build the dashboard pages:**
    - **`/` (Dashboard):** Session list sidebar (left), graph viewer (right). Import/export buttons. Click session → load its visits → render graph. Visit detail panel below graph on node click.
    - **`/session/[id]`:** Dedicated full-width graph view for a single session with detail panel.
    - **`/explore`:** Cross-session analysis. Show articles that appear in multiple sessions. Top articles by visit count. Basic stats (total sessions, total visits, unique articles, total reading time).
    - **`/history`:** Searchable list of all visits. Search by article title or excerpt. Filter by date range and wiki source.
    - **`/settings`:** Session timeout configuration. Tracked domains list (add/remove). Import/export. Clear all data (with confirmation).
    - **Layout:** Shared header with nav links. Catppuccin Mocha dark theme throughout.

### Phase 4: Quality

12. **Write Vitest tests** for:
    - All shared utility functions (already done in Phase 1)
    - ChromeStorageAdapter (mock `chrome.storage.local`)
    - IndexedDBStorageAdapter (use `fake-indexeddb` package)
    - Background service worker session state machine logic (extract into testable pure functions where possible)
    - URL parsing edge cases: Wikipedia in multiple languages, Fandom subdomains, non-article pages that should be filtered

13. **Write the README.** Strong opening line. Quick description of what WikiPath does. Architecture overview. Tech stack table. Setup and build instructions. How to load the extension. How to run the web dashboard. Roadmap checklist. MIT license badge.

14. **Create `.gitignore`** covering node_modules, dist, .next, out, .env files, IDE folders, OS files, and TypeScript build info.

### Constraints

- Everything local-first. Zero network calls except the user's own Wikipedia browsing. No analytics, no telemetry, no external APIs.
- Both storage adapters must implement the exact same `StorageAdapter` interface from shared. No shortcuts.
- The extension must handle service worker restarts gracefully — persist all critical state to chrome.storage.local, don't rely on in-memory state surviving.
- The web dashboard must work as a static export — no server-side rendering, no API routes.
- Use Catppuccin Mocha for all UI. The popup and the web dashboard should feel like the same app.
- All TypeScript, strict mode, no `any` types.

Start with Phase 1 and work through sequentially. After each phase, make sure everything builds and tests pass before moving on. Commit after each phase.
