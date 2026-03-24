# WikiPath

**Track your Wikipedia rabbit holes. Visualize them as interactive mind maps.**

WikiPath passively records every Wikipedia article you visit and how you got there — then renders your browsing sessions as directed graphs so you can see exactly how you wandered from one idea to the next.

---

## What it does

- **Passive tracking** — Browse Wikipedia normally. WikiPath records every article visit in the background, zero effort required.
- **Session detection** — Browsing sessions are auto-detected by idle timeout (default: 30 minutes). Start a new session, pick up where you left off.
- **Interactive graphs** — Each session renders as a directed tree: nodes are articles, edges are link follows. Root node shown as a diamond. Node size reflects time spent; color indicates wiki source.
- **Cross-session analysis** — Discover which articles you keep returning to across multiple sessions.
- **Full-text search** — Search your entire browsing history by article title or excerpt.
- **Data portability** — Export all your data as JSON, import it anywhere. No lock-in.
- **Local-first, zero backend** — All data lives on your device. No accounts, no servers, no telemetry.

---

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Language | TypeScript (strict) |
| Extension | Chrome MV3, esbuild |
| Web dashboard | Next.js 14 (static export), React 18 |
| Visualization | Cytoscape.js + cytoscape-dagre |
| Storage (extension) | `chrome.storage.local` |
| Storage (web) | IndexedDB |
| UI theme | Catppuccin Mocha |
| Styling | Tailwind CSS |
| Testing | Vitest |

---

## Repository structure

```
WikiPath.app/
├── packages/
│   ├── shared/          # Core types, StorageAdapter interface, utils
│   ├── extension/       # Chrome extension (MV3)
│   └── web/             # Next.js dashboard (static export)
└── docs/
    └── ARCHITECTURE.md  # Full technical design
```

---

## Setup

**Prerequisites:** Node 20+, pnpm 9+

```bash
# Install all workspace dependencies
pnpm install

# Build the shared package (required before anything else)
pnpm --filter @wikipath/shared build
```

---

## Extension

### Build

```bash
pnpm --filter @wikipath/extension build
```

Output goes to `packages/extension/dist/`.

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `packages/extension/dist/`

### Usage

Once loaded, browse Wikipedia. The extension icon shows your current session status. Click it to see visit count, session duration, and recent sessions. Double-click any graph node to open the article.

---

## Web dashboard

### Dev server

```bash
pnpm --filter @wikipath/web dev
# → http://localhost:3000
```

### Production build

```bash
pnpm --filter @wikipath/web build
# Output: packages/web/out/  (static HTML/CSS/JS)
```

Serve the `out/` directory with any static file host (nginx, Caddy, GitHub Pages, Netlify, etc.).

### Import data from the extension

1. In the extension popup, click **Export JSON**
2. In the web dashboard → **Settings**, click **Import from JSON**
3. Select the exported file

---

## Tests

```bash
# All packages
pnpm test --recursive

# Individual packages
pnpm --filter @wikipath/shared test
pnpm --filter @wikipath/extension test
pnpm --filter @wikipath/web test
```

---

## Roadmap

- [x] Phase 1 — Monorepo foundation, shared types, utilities
- [x] Phase 2 — Chrome extension: background worker, content script, popup
- [x] Phase 3 — Web dashboard: graph visualization, session browser, history, settings
- [x] Phase 4 — Tests, README
- [ ] v0.2 — Tag sessions, rename sessions, merge/split sessions
- [ ] v0.3 — Cross-session graph view (cose-bilkent layout, topic clusters)
- [ ] v0.4 — Article watching (MediaWiki API polling, change notifications)
- [ ] v0.5 — Firefox extension (MV3 compatibility layer)
- [ ] Future — iOS / Android apps (same StorageAdapter interface, native storage)

---

## License

MIT — see [LICENSE](LICENSE).
