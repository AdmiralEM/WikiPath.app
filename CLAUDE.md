# WikiPath.app — Project Context for Claude Code

## What This Is

WikiPath is a local-first app that tracks Wikipedia browsing sessions and visualizes them as interactive mind maps. Users browse Wikipedia normally; the app passively records which articles they visit and how they got there (which link led to which article). Sessions are visualized as directed graphs — tree structures where each node is an article and each edge is a link follow.

## Architecture

This is a **pnpm monorepo** with three packages:

- `packages/shared` — Core TypeScript types, storage interface, utility functions. Every platform client imports from here.
- `packages/extension` — Chrome Extension (Manifest V3). Passively tracks navigation on wiki pages, manages session lifecycle, records visits.
- `packages/web` — Next.js web dashboard. Visualization via Cytoscape.js, session management, statistics, import/export.

See `docs/ARCHITECTURE.md` for the full technical design including data model, session state machine, storage adapter pattern, and extension component breakdown.

See `packages/shared/src/types.ts` for the canonical data model — Session, Visit, Edge, WikiSource, StorageAdapter interface, and configuration types.

## Key Design Decisions

- **Local-first, zero backend.** All data stays on the user's device. Chrome extension uses `chrome.storage.local`. Web dashboard uses IndexedDB. No SaaS, no auth, no server.
- **StorageAdapter interface.** Platform-agnostic. Each client implements the same interface with its native storage. This is the single integration point.
- **Session auto-detection.** Sessions are detected via idle timeout (default 30 min). The extension's background worker runs a state machine: IDLE → ACTIVE → IDLE. Tab lineage tracking establishes parent→child visit relationships.
- **Data portability.** JSON export/import format (`WikiPathExport`) allows moving data between platforms.
- **Graph visualization.** Cytoscape.js with the `cytoscape-dagre` plugin for directed tree layouts. Nodes are color-coded by wiki source, sized by dwell time. Interactive: zoom, pan, click for details, double-click to open article.

## Tech Conventions

- **Package manager:** pnpm with workspaces
- **Language:** TypeScript (strict mode) everywhere
- **Testing:** Vitest
- **UI theme:** Catppuccin Mocha. Use CSS custom properties for color tokens. Tailwind CSS in the web dashboard with a custom theme mapping to Catppuccin variables.
- **Extension bundler:** Your choice — esbuild or Vite+crxjs are both fine. Pick whichever gives the best DX.
- **Next.js:** Static export mode (`output: "export"`). The dashboard is fully client-side, no API routes.
- **Cytoscape.js layout:** `cytoscape-dagre` for session tree views. Needs to be registered as a Cytoscape extension.
- **License:** MIT
- **Node:** 20+
- **Devcontainer:** All project dependencies install inside `.devcontainer/`. Keep local system clean. Devcontainer should be fully portable across machines.

## Code Style

- Prefer explicit types over inference for function signatures and exported APIs
- Use barrel exports (`index.ts`) for each package
- Keep shared utilities pure — no platform-specific imports in `packages/shared`
- Chrome extension code can reference `chrome.*` APIs directly (with `@types/chrome`)
- Web dashboard components are React Server Components by default; add `"use client"` only where needed (anything with hooks, browser APIs, Cytoscape)

## File Structure Expectations

```
WikiPath.app/
├── .devcontainer/
├── docs/
│   └── ARCHITECTURE.md
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   └── utils.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── extension/
│   │   ├── src/
│   │   │   ├── background.ts
│   │   │   ├── content.ts
│   │   │   ├── storage.ts      (ChromeStorageAdapter)
│   │   │   ├── popup.html
│   │   │   ├── popup.ts
│   │   │   └── manifest.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   ├── globals.css
│       │   │   ├── session/[id]/page.tsx
│       │   │   ├── explore/page.tsx
│       │   │   ├── history/page.tsx
│       │   │   └── settings/page.tsx
│       │   ├── components/
│       │   │   └── SessionGraph.tsx
│       │   └── lib/
│       │       └── storage.ts  (IndexedDBStorageAdapter)
│       ├── package.json
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── next.config.js
│       └── tsconfig.json
├── package.json
├── pnpm-workspace.yaml
├── CLAUDE.md
├── README.md
├── LICENSE
└── .gitignore
```

## What NOT to Do

- Don't add a backend, database server, or authentication system
- Don't use localStorage in the web dashboard — use IndexedDB via the StorageAdapter
- Don't put platform-specific code in the shared package
- Don't skip the StorageAdapter interface — both clients must implement it
- Don't use `chrome.storage.sync` — use `chrome.storage.local` with `unlimitedStorage` permission
- Don't hardcode Wikipedia URLs — use the `trackedDomains` config pattern with wildcard matching so Fandom/other wikis work later
