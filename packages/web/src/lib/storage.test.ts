// =============================================================================
// WikiPath Web — IndexedDBStorageAdapter Tests
// =============================================================================
// Uses fake-indexeddb. Each test gets its own unique DB name so there is no
// cross-test contamination from the per-name singleton cache.
// =============================================================================

import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { IndexedDBStorageAdapter } from "./storage.js";
import type { Session, Visit, WikiSource, WikiPathExport } from "@wikipath/shared";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

let dbCounter = 0;
function freshAdapter(): IndexedDBStorageAdapter {
  return new IndexedDBStorageAdapter(`test-db-${++dbCounter}`);
}

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

describe("IndexedDBStorageAdapter", () => {

  // --- Sessions ---

  describe("getSessions", () => {
    it("returns empty array initially", async () => {
      const adapter = freshAdapter();
      expect(await adapter.getSessions()).toEqual([]);
    });

    it("returns created sessions sorted desc by default", async () => {
      const adapter = freshAdapter();
      const s1 = await adapter.createSession({ ...makeSessionData(), startedAt: 1000 });
      const s2 = await adapter.createSession({ ...makeSessionData(), startedAt: 3000 });
      const s3 = await adapter.createSession({ ...makeSessionData(), startedAt: 2000 });

      const sessions = await adapter.getSessions();
      expect(sessions.map((s) => s.id)).toEqual([s2.id, s3.id, s1.id]);
    });

    it("sorts asc when requested", async () => {
      const adapter = freshAdapter();
      const s1 = await adapter.createSession({ ...makeSessionData(), startedAt: 1000 });
      const s2 = await adapter.createSession({ ...makeSessionData(), startedAt: 2000 });

      const sessions = await adapter.getSessions({ sort: "asc" });
      expect(sessions[0].id).toBe(s1.id);
      expect(sessions[1].id).toBe(s2.id);
    });

    it("applies limit and offset", async () => {
      const adapter = freshAdapter();
      for (let i = 0; i < 4; i++) {
        await adapter.createSession({ ...makeSessionData(), startedAt: i * 1000 });
      }

      const page = await adapter.getSessions({ limit: 2, offset: 1, sort: "asc" });
      expect(page).toHaveLength(2);
    });
  });

  describe("getSession", () => {
    it("returns null for missing session", async () => {
      const adapter = freshAdapter();
      expect(await adapter.getSession("nope")).toBeNull();
    });

    it("returns the session by ID", async () => {
      const adapter = freshAdapter();
      const created = await adapter.createSession(makeSessionData());
      expect(await adapter.getSession(created.id)).toEqual(created);
    });
  });

  describe("createSession", () => {
    it("assigns a UUID id", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe("updateSession", () => {
    it("merges partial updates", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      const updated = await adapter.updateSession(session.id, {
        title: "New Title",
        endedAt: 9999,
      });
      expect(updated.title).toBe("New Title");
      expect(updated.endedAt).toBe(9999);
      expect(updated.startedAt).toBe(session.startedAt);
    });

    it("throws for a missing session", async () => {
      const adapter = freshAdapter();
      await expect(adapter.updateSession("ghost", { title: "x" })).rejects.toThrow();
    });
  });

  describe("deleteSession", () => {
    it("removes session and associated visits", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      const visit = await adapter.createVisit(makeVisitData(session.id));

      await adapter.deleteSession(session.id);

      expect(await adapter.getSession(session.id)).toBeNull();
      expect(await adapter.getVisit(visit.id)).toBeNull();
    });
  });

  // --- Visits ---

  describe("getVisitsBySession", () => {
    it("returns empty for session with no visits", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      expect(await adapter.getVisitsBySession(session.id)).toEqual([]);
    });

    it("returns only visits for the given session", async () => {
      const adapter = freshAdapter();
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
    it("roundtrips a visit", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      const visit = await adapter.createVisit(makeVisitData(session.id));
      expect(await adapter.getVisit(visit.id)).toEqual(visit);
    });

    it("returns null for missing visit", async () => {
      const adapter = freshAdapter();
      expect(await adapter.getVisit("ghost")).toBeNull();
    });

    it("updates visit fields", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      const visit = await adapter.createVisit(makeVisitData(session.id));

      const updated = await adapter.updateVisit(visit.id, {
        dwellTime: 12000,
        metadata: { scrollDepth: 0.75, excerpt: "hello" },
      });
      expect(updated.dwellTime).toBe(12000);
      expect(updated.metadata.scrollDepth).toBe(0.75);
    });
  });

  // --- Search & Analysis ---

  describe("searchVisits", () => {
    it("finds by article title (case-insensitive)", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit({ ...makeVisitData(session.id), articleTitle: "TypeScript" });
      await adapter.createVisit({ ...makeVisitData(session.id), articleTitle: "Python" });

      const results = await adapter.searchVisits("typescript");
      expect(results).toHaveLength(1);
      expect(results[0].articleTitle).toBe("TypeScript");
    });

    it("finds by excerpt", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit({
        ...makeVisitData(session.id),
        metadata: { scrollDepth: null, excerpt: "Category theory is a branch of mathematics" },
      });

      const results = await adapter.searchVisits("branch of mathematics");
      expect(results).toHaveLength(1);
    });

    it("returns empty when no match", async () => {
      const adapter = freshAdapter();
      expect(await adapter.searchVisits("zzz_no_match_zzz")).toEqual([]);
    });
  });

  describe("getArticleHistory", () => {
    it("returns visits for a given articleId sorted by visitedAt", async () => {
      const adapter = freshAdapter();
      const s1 = await adapter.createSession(makeSessionData());
      const s2 = await adapter.createSession(makeSessionData());

      const articleId = "en.wikipedia.org:JavaScript";
      await adapter.createVisit({ ...makeVisitData(s1.id), articleId, visitedAt: 2000 });
      await adapter.createVisit({ ...makeVisitData(s2.id), articleId, visitedAt: 1000 });
      await adapter.createVisit({
        ...makeVisitData(s1.id),
        articleId: "en.wikipedia.org:Other",
        visitedAt: 3000,
      });

      const history = await adapter.getArticleHistory(articleId);
      expect(history).toHaveLength(2);
      expect(history[0].visitedAt).toBe(1000);
      expect(history[1].visitedAt).toBe(2000);
    });
  });

  describe("getTopArticles", () => {
    it("returns articles sorted by visit count descending", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());

      // 3× article A, 1× article B
      for (let i = 0; i < 3; i++) {
        await adapter.createVisit({
          ...makeVisitData(session.id),
          articleId: "en.wikipedia.org:A",
          articleTitle: "Article A",
        });
      }
      await adapter.createVisit({
        ...makeVisitData(session.id),
        articleId: "en.wikipedia.org:B",
        articleTitle: "Article B",
      });

      const top = await adapter.getTopArticles(5);
      expect(top[0].articleId).toBe("en.wikipedia.org:A");
      expect(top[0].visitCount).toBe(3);
      expect(top[1].visitCount).toBe(1);
    });

    it("respects the limit", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      for (let i = 0; i < 6; i++) {
        await adapter.createVisit({
          ...makeVisitData(session.id),
          articleId: `en.wikipedia.org:A${i}`,
          articleTitle: `Article ${i}`,
        });
      }
      expect(await adapter.getTopArticles(3)).toHaveLength(3);
    });
  });

  describe("getOverlappingSessions", () => {
    it("returns sessions that share an articleId", async () => {
      const adapter = freshAdapter();
      const s1 = await adapter.createSession(makeSessionData());
      const s2 = await adapter.createSession(makeSessionData());
      const s3 = await adapter.createSession(makeSessionData());

      const shared = "en.wikipedia.org:SharedArticle";
      await adapter.createVisit({ ...makeVisitData(s1.id), articleId: shared });
      await adapter.createVisit({ ...makeVisitData(s2.id), articleId: shared });
      await adapter.createVisit({ ...makeVisitData(s3.id), articleId: "en.wikipedia.org:Other" });

      const overlapping = await adapter.getOverlappingSessions(shared);
      const ids = overlapping.map((s) => s.id);
      expect(ids).toContain(s1.id);
      expect(ids).toContain(s2.id);
      expect(ids).not.toContain(s3.id);
    });
  });

  // --- Bulk Operations ---

  describe("exportAll / importAll", () => {
    it("exports version 1 JSON with all data", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit(makeVisitData(session.id));

      const data = await adapter.exportAll();
      expect(data.version).toBe(1);
      expect(data.platform).toBe("web");
      expect(data.sessions).toHaveLength(1);
      expect(data.visits).toHaveLength(1);
    });

    it("imports data and makes it queryable", async () => {
      const adapter = freshAdapter();

      const importPayload: WikiPathExport = {
        version: 1,
        exportedAt: Date.now(),
        platform: "chrome-extension",
        sessions: [
          {
            id: "ext-session",
            title: "From Extension",
            startedAt: 5000,
            endedAt: 6000,
            rootVisitId: "ext-visit",
            metadata: { visitCount: 1, uniqueArticles: 1, wikis: [], maxDepth: 0, tags: [] },
          },
        ],
        visits: [
          {
            id: "ext-visit",
            sessionId: "ext-session",
            parentVisitId: null,
            url: "https://en.wikipedia.org/wiki/Imported",
            wiki: WIKI,
            articleTitle: "Imported",
            articleId: "en.wikipedia.org:Imported",
            visitedAt: 5000,
            dwellTime: null,
            depth: 0,
            metadata: { scrollDepth: null, excerpt: null },
          },
        ],
      };

      const result = await adapter.importAll(importPayload);
      expect(result.sessions).toBe(1);
      expect(result.visits).toBe(1);

      const session = await adapter.getSession("ext-session");
      expect(session?.title).toBe("From Extension");

      const visits = await adapter.getVisitsBySession("ext-session");
      expect(visits).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("removes everything", async () => {
      const adapter = freshAdapter();
      const session = await adapter.createSession(makeSessionData());
      await adapter.createVisit(makeVisitData(session.id));

      await adapter.clear();
      expect(await adapter.getSessions()).toEqual([]);
    });
  });
});
