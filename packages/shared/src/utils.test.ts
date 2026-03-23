// =============================================================================
// WikiPath.app — Utility Function Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseWikiSource,
  extractArticleTitle,
  buildArticleId,
  isTrackedUrl,
  deriveEdges,
  deriveCrossSessionEdges,
  buildSessionMetadata,
  isSessionTimedOut,
  formatDuration,
  generateId,
} from "./utils.js";
import type { Session, Visit, WikiSource } from "./types.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeVisit(overrides: Partial<Visit> & { id: string }): Visit {
  const wiki: WikiSource = overrides.wiki ?? {
    type: "wikipedia",
    domain: "en.wikipedia.org",
    language: "en",
  };
  return {
    id: overrides.id,
    sessionId: overrides.sessionId ?? "session-1",
    parentVisitId: overrides.parentVisitId ?? null,
    url: overrides.url ?? "https://en.wikipedia.org/wiki/Test",
    wiki,
    articleTitle: overrides.articleTitle ?? "Test",
    articleId: overrides.articleId ?? "en.wikipedia.org:Test",
    visitedAt: overrides.visitedAt ?? Date.now(),
    dwellTime: overrides.dwellTime ?? null,
    depth: overrides.depth ?? 0,
    metadata: overrides.metadata ?? { scrollDepth: null, excerpt: null },
  };
}

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    id: overrides.id,
    title: overrides.title ?? "Test Session",
    startedAt: overrides.startedAt ?? Date.now(),
    endedAt: overrides.endedAt ?? null,
    rootVisitId: overrides.rootVisitId ?? "visit-1",
    metadata: overrides.metadata ?? {
      visitCount: 0,
      uniqueArticles: 0,
      wikis: [],
      maxDepth: 0,
      tags: [],
    },
  };
}

// -----------------------------------------------------------------------------
// parseWikiSource
// -----------------------------------------------------------------------------

describe("parseWikiSource", () => {
  it("parses English Wikipedia", () => {
    const result = parseWikiSource("https://en.wikipedia.org/wiki/JavaScript");
    expect(result).toEqual({
      type: "wikipedia",
      domain: "en.wikipedia.org",
      language: "en",
    });
  });

  it("parses Japanese Wikipedia", () => {
    const result = parseWikiSource("https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E");
    expect(result).toEqual({
      type: "wikipedia",
      domain: "ja.wikipedia.org",
      language: "ja",
    });
  });

  it("parses a Fandom wiki", () => {
    const result = parseWikiSource("https://starwars.fandom.com/wiki/Luke_Skywalker");
    expect(result).toEqual({
      type: "fandom",
      domain: "starwars.fandom.com",
      language: null,
    });
  });

  it("returns null for a non-wiki URL", () => {
    expect(parseWikiSource("https://example.com/page")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(parseWikiSource("not a url")).toBeNull();
  });

  it("returns null for wikipedia.org without a language subdomain", () => {
    expect(parseWikiSource("https://wikipedia.org/wiki/Test")).toBeNull();
  });

  it("parses German Wikipedia", () => {
    const result = parseWikiSource("https://de.wikipedia.org/wiki/Berlin");
    expect(result).toEqual({
      type: "wikipedia",
      domain: "de.wikipedia.org",
      language: "de",
    });
  });

  it("parses another Fandom wiki", () => {
    const result = parseWikiSource("https://minecraft.fandom.com/wiki/Creeper");
    expect(result).toEqual({
      type: "fandom",
      domain: "minecraft.fandom.com",
      language: null,
    });
  });
});

// -----------------------------------------------------------------------------
// extractArticleTitle
// -----------------------------------------------------------------------------

describe("extractArticleTitle", () => {
  it("extracts a simple title", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/wiki/JavaScript")).toBe("JavaScript");
  });

  it("decodes URL-encoded characters", () => {
    // %C3%A9 = é
    expect(extractArticleTitle("https://en.wikipedia.org/wiki/Caf%C3%A9")).toBe("Café");
  });

  it("replaces underscores with spaces", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/wiki/World_War_II")).toBe("World War II");
  });

  it("handles Talk: namespace pages", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/wiki/Talk:JavaScript")).toBe(
      "Talk:JavaScript"
    );
  });

  it("returns null for a URL without /wiki/ path", () => {
    expect(extractArticleTitle("https://en.wikipedia.org/search?q=test")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractArticleTitle("not a url")).toBeNull();
  });

  it("handles Japanese-encoded titles", () => {
    const result = extractArticleTitle(
      "https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E"
    );
    expect(result).toBe("日本語");
  });
});

// -----------------------------------------------------------------------------
// buildArticleId
// -----------------------------------------------------------------------------

describe("buildArticleId", () => {
  it("builds an article ID from a wiki source and title", () => {
    const wiki: WikiSource = { type: "wikipedia", domain: "en.wikipedia.org", language: "en" };
    expect(buildArticleId(wiki, "JavaScript")).toBe("en.wikipedia.org:JavaScript");
  });

  it("builds an article ID for a Fandom wiki", () => {
    const wiki: WikiSource = { type: "fandom", domain: "starwars.fandom.com", language: null };
    expect(buildArticleId(wiki, "Luke Skywalker")).toBe("starwars.fandom.com:Luke Skywalker");
  });

  it("preserves the title exactly, including colons and spaces", () => {
    const wiki: WikiSource = { type: "wikipedia", domain: "en.wikipedia.org", language: "en" };
    expect(buildArticleId(wiki, "Talk:JavaScript")).toBe("en.wikipedia.org:Talk:JavaScript");
  });
});

// -----------------------------------------------------------------------------
// isTrackedUrl
// -----------------------------------------------------------------------------

describe("isTrackedUrl", () => {
  it("matches a wildcard pattern *.wikipedia.org against en.wikipedia.org", () => {
    expect(isTrackedUrl("https://en.wikipedia.org/wiki/Test", ["*.wikipedia.org"])).toBe(true);
  });

  it("matches a wildcard pattern *.wikipedia.org against ja.wikipedia.org", () => {
    expect(isTrackedUrl("https://ja.wikipedia.org/wiki/Test", ["*.wikipedia.org"])).toBe(true);
  });

  it("does NOT match a wildcard *.wikipedia.org against example.com", () => {
    expect(isTrackedUrl("https://example.com/page", ["*.wikipedia.org"])).toBe(false);
  });

  it("matches an exact domain pattern", () => {
    expect(isTrackedUrl("https://en.wikipedia.org/wiki/Test", ["en.wikipedia.org"])).toBe(true);
  });

  it("does NOT match a different subdomain with exact pattern", () => {
    expect(isTrackedUrl("https://ja.wikipedia.org/wiki/Test", ["en.wikipedia.org"])).toBe(false);
  });

  it("matches Fandom with *.fandom.com wildcard", () => {
    expect(isTrackedUrl("https://starwars.fandom.com/wiki/Test", ["*.fandom.com"])).toBe(true);
  });

  it("matches when multiple patterns are provided", () => {
    expect(
      isTrackedUrl("https://en.wikipedia.org/wiki/Test", [
        "*.fandom.com",
        "*.wikipedia.org",
      ])
    ).toBe(true);
  });

  it("returns false for a malformed URL", () => {
    expect(isTrackedUrl("not a url", ["*.wikipedia.org"])).toBe(false);
  });

  it("returns false for empty patterns array", () => {
    expect(isTrackedUrl("https://en.wikipedia.org/wiki/Test", [])).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// deriveEdges
// -----------------------------------------------------------------------------

describe("deriveEdges", () => {
  it("returns an empty array for a single visit with no parent", () => {
    const visits: Visit[] = [makeVisit({ id: "v1", depth: 0 })];
    expect(deriveEdges(visits)).toEqual([]);
  });

  it("derives edges from a linear chain of visits", () => {
    const visits: Visit[] = [
      makeVisit({ id: "v1", parentVisitId: null, depth: 0 }),
      makeVisit({ id: "v2", parentVisitId: "v1", depth: 1 }),
      makeVisit({ id: "v3", parentVisitId: "v2", depth: 2 }),
    ];
    const edges = deriveEdges(visits);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toEqual({ sourceVisitId: "v1", targetVisitId: "v2", type: "navigation" });
    expect(edges[1]).toEqual({ sourceVisitId: "v2", targetVisitId: "v3", type: "navigation" });
  });

  it("derives edges for a branching tree", () => {
    //       v1
    //      /  \
    //    v2    v3
    //     |
    //    v4
    const visits: Visit[] = [
      makeVisit({ id: "v1", parentVisitId: null, depth: 0 }),
      makeVisit({ id: "v2", parentVisitId: "v1", depth: 1 }),
      makeVisit({ id: "v3", parentVisitId: "v1", depth: 1 }),
      makeVisit({ id: "v4", parentVisitId: "v2", depth: 2 }),
    ];
    const edges = deriveEdges(visits);
    expect(edges).toHaveLength(3);
    expect(edges.map((e) => `${e.sourceVisitId}->${e.targetVisitId}`)).toEqual(
      expect.arrayContaining(["v1->v2", "v1->v3", "v2->v4"])
    );
  });

  it("returns empty array for empty visits", () => {
    expect(deriveEdges([])).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// buildSessionMetadata
// -----------------------------------------------------------------------------

describe("buildSessionMetadata", () => {
  it("returns zeroed metadata for empty visits", () => {
    const meta = buildSessionMetadata([]);
    expect(meta.visitCount).toBe(0);
    expect(meta.uniqueArticles).toBe(0);
    expect(meta.wikis).toHaveLength(0);
    expect(meta.maxDepth).toBe(0);
    expect(meta.tags).toEqual([]);
  });

  it("counts visits, unique articles, wikis, and maxDepth correctly", () => {
    const wiki1: WikiSource = { type: "wikipedia", domain: "en.wikipedia.org", language: "en" };
    const wiki2: WikiSource = { type: "fandom", domain: "starwars.fandom.com", language: null };
    const visits: Visit[] = [
      makeVisit({ id: "v1", wiki: wiki1, articleId: "en.wikipedia.org:A", depth: 0 }),
      makeVisit({ id: "v2", wiki: wiki1, articleId: "en.wikipedia.org:B", depth: 1 }),
      makeVisit({ id: "v3", wiki: wiki2, articleId: "starwars.fandom.com:C", depth: 2 }),
      // Duplicate articleId — should count as 1 unique
      makeVisit({ id: "v4", wiki: wiki1, articleId: "en.wikipedia.org:A", depth: 1 }),
    ];
    const meta = buildSessionMetadata(visits);
    expect(meta.visitCount).toBe(4);
    expect(meta.uniqueArticles).toBe(3);
    expect(meta.wikis).toHaveLength(2);
    expect(meta.wikis).toContain("en.wikipedia.org");
    expect(meta.wikis).toContain("starwars.fandom.com");
    expect(meta.maxDepth).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// isSessionTimedOut
// -----------------------------------------------------------------------------

describe("isSessionTimedOut", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when well within the timeout window", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const lastVisitAt = now - 10_000; // 10 seconds ago
    expect(isSessionTimedOut(lastVisitAt, 30 * 60 * 1000)).toBe(false);
  });

  it("returns true when the timeout has been exceeded", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const lastVisitAt = now - 31 * 60 * 1000; // 31 minutes ago
    expect(isSessionTimedOut(lastVisitAt, 30 * 60 * 1000)).toBe(true);
  });

  it("returns true exactly at the timeout boundary", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const lastVisitAt = now - 30 * 60 * 1000; // exactly at boundary
    expect(isSessionTimedOut(lastVisitAt, 30 * 60 * 1000)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// formatDuration
// -----------------------------------------------------------------------------

describe("formatDuration", () => {
  it('formats 0ms as "0s"', () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it('formats 30 seconds as "30s"', () => {
    expect(formatDuration(30_000)).toBe("30s");
  });

  it('formats 45 minutes as "45m"', () => {
    expect(formatDuration(45 * 60 * 1000)).toBe("45m");
  });

  it('formats 2 hours 15 minutes as "2h 15m"', () => {
    expect(formatDuration((2 * 60 + 15) * 60 * 1000)).toBe("2h 15m");
  });

  it('formats exactly 1 hour as "1h"', () => {
    expect(formatDuration(60 * 60 * 1000)).toBe("1h");
  });

  it('formats 1 hour 0 minutes as "1h"', () => {
    expect(formatDuration(60 * 60 * 1000 + 30_000)).toBe("1h");
  });

  it("handles negative input gracefully by treating it as 0", () => {
    expect(formatDuration(-5000)).toBe("0s");
  });

  it('formats 59 seconds as "59s"', () => {
    expect(formatDuration(59_999)).toBe("59s");
  });
});

// -----------------------------------------------------------------------------
// generateId
// -----------------------------------------------------------------------------

describe("generateId", () => {
  it("returns a UUID v4 string", () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateId()));
    expect(ids.size).toBe(20);
  });
});
