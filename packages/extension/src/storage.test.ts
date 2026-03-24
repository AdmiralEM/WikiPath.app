// =============================================================================
// WikiPath Extension — ChromeStorageAdapter Tests
// =============================================================================
// Uses an in-memory mock of chrome.storage.local.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChromeStorageAdapter } from "./storage.js";
import type { Session, Visit, WikiSource, WikiPathExport } from "@wikipath/shared";

// -----------------------------------------------------------------------------
// chrome.storage.local in-memory mock
// -----------------------------------------------------------------------------

function makeChromeStorageMock() {
  const store: Record<string, unknown> = {};

  return {
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys === null) return { ...store };
      const keyArr = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const k of keyArr) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyArr = Array.isArray(keys) ? keys : [keys];
      for (const k of keyArr) delete store[k];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
}

// Attach mock to global chrome before importing adapter
const chromeMock = {
  storage: {
    local: makeChromeStorageMock(),
  },
};

vi.stubGlobal("chrome", chromeMock);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const WIKI: WikiSource = { type: "wikipedia", domain: "en.wikipedia.org", language: "en" };

function makeSessionData(): Omit<Session, "id"> {
  return {
    title: "Test Session",
    startedAt: Date.now(),
    endedAt: null,
    rootVisitId: "visit-placeholder",
    metadata: {
      visitCount: 1,
      uniqueArticles: 1,
      wikis: ["en.wikipedia.org"],
      maxDepth: 0,
      tags: [],
    },
  };
}

function makeVisitData(sessionId: string): Omit<Visit, "id"> {
  return {
    sessionId,
    parentVisitId: null,
    url: "https://en.wikipedia.org/wiki/Test",
    wiki: WIKI,
    articleTitle: "Test",
    articleId: "en.wikipedia.org:Test",
    visitedAt: Date.now(),
    dwellTime: null,
    depth: 0,
    metadata: { scrollDepth: null, excerpt: null },
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("ChromeStorageAdapter", () => {
  let adapter: ChromeStorageAdapter;

  beforeEach(() => {
    // Reset in-memory store between tests by re-creating the mock
    const freshMock = makeChromeStorageMock();
    chromeMock.storage.local = freshMock;
    adapter = new ChromeStorageAdapter();
  });

  // --- Sessions ---

  describe("getSessions", () => {
    it("returns empty array when no sessions exist", async () => {
      expect(await adapter.getSessions()).toEqual([]);
    });

    it("returns created sessions sorted desc by default", async () => {
      const s1 = await adapter.createSession({ ...makeSessionData(), startedAt: 1000 });
      const s2 = await adapter.createSession({ ...makeSessionData(), startedAt: 3000 });
      const s3 = await adapter.createSession({ ...makeSessionData(), startedAt: 2000 });

      const sessions = await adapter.getSessions();
      expect(sessions.map((s) => s.id)).toEqual([s2.id, s3.id, s1.id]);
    });

    it("returns sessions sorted asc", async () => {
      const s1 = await adapter.createSession({ ...makeSessionData(), startedAt: 1000 });
      const s2 = await adapter.createSession({ ...makeSessionData(), startedAt: 3000 });

      const sessions = await adapter.getSessions({ sort: "asc" });
      expect(sessions[0].id).toBe(s1.id);
      expect(sessions[1].id).toBe(s2.id);
    });

    it("applies limit and offset", async () => {
      await adapter.createSession({ ...makeSessionData(), startedAt: 1000 });
      await adapter.createSession({ ...makeSessionData(), startedAt: 2000 });
      await adapter.createSession({ ...makeSessionData(), startedAt: 3000 });

      const page1 = await adapter.getSessions({ limit: 2, offset: 0, sort: "asc" });
      expect(page1).toHaveLength(2);

      const page2 = await adapter.getSessions({ limit: 2, offset: 2, sort: "asc" });
      expect(page2).toHaveLength(1);
    });
  });

  describe("getSession", () => {
    it("returns null for a non-existent session", async () => {
      expect(await adapter.getSession("does-not-exist")).toBeNull();
    });

    it("returns the session by ID", async () => {
      const created = await adapter.createSession(makeSessionData());
      const fetched = await adapter.getSession(created.id);
      expect(fetched).toEqual(created);
    });
  });

  describe("createSession", () => {
    it("assigns a UUID id to the new session", async () => {
      const session = await adapter.createSession(makeSessionData());
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("persists the session so it can be retrieved", async () => {
      const session = await adapter.createSession(makeSessionData());
      expect(await adapter.getSession(session.id)).toEqual(session);
    });
  });

  describe("updateSession", () => {
    it("merges partial updates", async () => {
      const session = await adapter.createSession(makeSessionData());
      const updated = await adapter.updateSession(session.id, { title: "Updated" });
      expect(updated.title).toBe("Updated");
      expect(updated.startedAt).toBe(session.startedAt);
    });

    it("throws for a non-existent session", async () => {
      await expect(adapter.updateSession("nope", { title: "x" })).rejects.toThrow();
    });
  });

  describe("deleteSession", () => {
    it("removes the session and its visits", async () => {
      const session = await adapter.createSession(makeSessionData());
      const visit = await adapter.createVisit(makeVisitData(session.id));

      await adapter.deleteSession(session.id);

      expect(await adapter.getSession(session.id)).toBeNull();
      expect(await adapter.getVisit(visit.id)).toBeNull();
    });

    it("removes the session from the index", async () => {
      const s1 = await adapter.createSession(makeSessionData());
      const s2 = await adapter.createSession(makeSessionData());

      await adapter.deleteSession(s1.id);

      const remaining = await adapter.getSessions();
      expect(remaining.map((s) => s.id)).not.toContain(s1.id);
      expect(remaining.map((s) => s.id)).toContain(s2.id);
    });
  });

  // --- Visits ---

  describe("getVisitsBySession", () => {
    it("returns empty array for a session with no visits", async () => {
      const session = await adapter.createSession(makeSessionData());
      expect(await adapter.getVisitsBySession(session.id)).toEqual([]);
    });

    it("returns all visits for a session", async () => {
      const session = await adapter.createSession(makeSessionData());
      const v1 = await adapter.createVisit(makeVisitData(session.id));
      const v2 = await adapter.createVisit(makeVisitData(session.id));

      const visits = await adapter.getVisitsBySession(session.id);
      expect(visits.map((v) => v.id)).toEqual(expect.arrayContaining([v1.id, v2.id]));
    });

    it("does not return visits from another session", async () => {
      const s1 = await adapter.createSession(makeSessionData());
      const s2 = await adapter.createSession(makeSessionData());
      await adapter.createVisit(makeVisitData(s1.id));
      const v2 = await adapter.createVisit(makeVisitData(s2.id));

      const visits = await adapter.getVisitsBySession(s2.id);
      expect(visits).toHaveLength(1);
      expect(visits[0].id).toBe(v2.id);
    });
  });

  describe("createVisit / getVisit / updateVisit", () => {
    it("creates and retrieves a visit", async () => {
      const session = await adapter.createSession(makeSessionData());
      const visit = await adapter.createVisit(makeVisitData(session.id));
      expect(await adapter.getVisit(visit.id)).toEqual(visit);
    });

    it("returns null for a non-existent visit", async () => {
      expect(await adapter.getVisit("ghost")).toBeNull();
    });

    it("updates visit fields", async () => {
      const session = await adapter.createSession(makeSessionData());
      const visit = await adapter.createVisit(makeVisitData(session.id));
      const updated = await adapter.updateVisit(visit.id, { dwellTime: 5000 });
      expect(updated.dwellTime).toBe(5000);
      expect(updated.articleTitle).toBe(visit.articleTitle);
    });
  });

  // --- Search & Analysis ---

  describe("searchVisits", () => {
    it("finds visits by article title", async () => {
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit({ ...makeVisitData(session.id), articleTitle: "JavaScript" });
      await adapter.createVisit({ ...makeVisitData(session.id), articleTitle: "Python (language)" });

      const results = await adapter.searchVisits("java");
      expect(results).toHaveLength(1);
      expect(results[0].articleTitle).toBe("JavaScript");
    });

    it("finds visits by excerpt", async () => {
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit({
        ...makeVisitData(session.id),
        metadata: { scrollDepth: null, excerpt: "This is about type theory" },
      });
      await adapter.createVisit({
        ...makeVisitData(session.id),
        metadata: { scrollDepth: null, excerpt: "A programming language" },
      });

      const results = await adapter.searchVisits("type theory");
      expect(results).toHaveLength(1);
    });

    it("returns empty for no match", async () => {
      expect(await adapter.searchVisits("zzznomatch")).toEqual([]);
    });
  });

  describe("getTopArticles", () => {
    it("returns articles sorted by visit count", async () => {
      const session = await adapter.createSession(makeSessionData());
      const jsData: Omit<Visit, "id"> = {
        ...makeVisitData(session.id),
        articleTitle: "JavaScript",
        articleId: "en.wikipedia.org:JavaScript",
      };
      const pyData: Omit<Visit, "id"> = {
        ...makeVisitData(session.id),
        articleTitle: "Python",
        articleId: "en.wikipedia.org:Python",
      };

      // 3× JavaScript, 1× Python
      await adapter.createVisit(jsData);
      await adapter.createVisit(jsData);
      await adapter.createVisit(jsData);
      await adapter.createVisit(pyData);

      const top = await adapter.getTopArticles(10);
      expect(top[0].articleId).toBe("en.wikipedia.org:JavaScript");
      expect(top[0].visitCount).toBe(3);
      expect(top[1].articleId).toBe("en.wikipedia.org:Python");
    });

    it("respects the limit", async () => {
      const session = await adapter.createSession(makeSessionData());
      for (let i = 0; i < 5; i++) {
        await adapter.createVisit({
          ...makeVisitData(session.id),
          articleId: `en.wikipedia.org:Article${i}`,
          articleTitle: `Article ${i}`,
        });
      }
      const top = await adapter.getTopArticles(3);
      expect(top).toHaveLength(3);
    });
  });

  describe("getOverlappingSessions", () => {
    it("returns all sessions that contain a given articleId", async () => {
      const s1 = await adapter.createSession(makeSessionData());
      const s2 = await adapter.createSession(makeSessionData());
      const s3 = await adapter.createSession(makeSessionData());

      await adapter.createVisit({
        ...makeVisitData(s1.id),
        articleId: "en.wikipedia.org:Shared",
      });
      await adapter.createVisit({
        ...makeVisitData(s2.id),
        articleId: "en.wikipedia.org:Shared",
      });
      await adapter.createVisit({
        ...makeVisitData(s3.id),
        articleId: "en.wikipedia.org:Different",
      });

      const sessions = await adapter.getOverlappingSessions("en.wikipedia.org:Shared");
      const ids = sessions.map((s) => s.id);
      expect(ids).toContain(s1.id);
      expect(ids).toContain(s2.id);
      expect(ids).not.toContain(s3.id);
    });
  });

  // --- Bulk Operations ---

  describe("exportAll / importAll", () => {
    it("exports all sessions and visits", async () => {
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit(makeVisitData(session.id));

      const data = await adapter.exportAll();
      expect(data.version).toBe(1);
      expect(data.platform).toBe("chrome-extension");
      expect(data.sessions).toHaveLength(1);
      expect(data.visits).toHaveLength(1);
    });

    it("imports data and merges with existing", async () => {
      const existing = await adapter.createSession(makeSessionData());

      const importData: WikiPathExport = {
        version: 1,
        exportedAt: Date.now(),
        platform: "web",
        sessions: [
          {
            id: "imported-session",
            title: "Imported",
            startedAt: 1000,
            endedAt: 2000,
            rootVisitId: "imported-visit",
            metadata: { visitCount: 1, uniqueArticles: 1, wikis: [], maxDepth: 0, tags: [] },
          },
        ],
        visits: [
          {
            id: "imported-visit",
            sessionId: "imported-session",
            parentVisitId: null,
            url: "https://en.wikipedia.org/wiki/Imported",
            wiki: WIKI,
            articleTitle: "Imported",
            articleId: "en.wikipedia.org:Imported",
            visitedAt: 1000,
            dwellTime: null,
            depth: 0,
            metadata: { scrollDepth: null, excerpt: null },
          },
        ],
      };

      const result = await adapter.importAll(importData);
      expect(result.sessions).toBe(1);
      expect(result.visits).toBe(1);

      const all = await adapter.getSessions();
      const ids = all.map((s) => s.id);
      expect(ids).toContain(existing.id);
      expect(ids).toContain("imported-session");
    });
  });

  describe("clear", () => {
    it("removes all data", async () => {
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit(makeVisitData(session.id));

      await adapter.clear();
      expect(await adapter.getSessions()).toEqual([]);
    });
  });
});
