// =============================================================================
// WikiPath Extension — ChromeStorageAdapter
// =============================================================================
// Implements the StorageAdapter interface using chrome.storage.local.
// Sessions and visits are stored as flat keyed records for O(1) lookup.
// =============================================================================

import {
  generateId,
} from "@wikipath/shared";
import type {
  ImportResult,
  Session,
  SessionQueryOptions,
  StorageAdapter,
  TopArticle,
  Visit,
  WikiPathExport,
} from "@wikipath/shared";

// Storage key prefixes
const SESSION_PREFIX = "session:";
const VISIT_PREFIX = "visit:";
const SESSION_INDEX_KEY = "index:sessions"; // ordered list of session IDs
const VISIT_INDEX_PREFIX = "index:visits:"; // per-session visit ID list

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

function visitKey(id: string): string {
  return `${VISIT_PREFIX}${id}`;
}

function visitIndexKey(sessionId: string): string {
  return `${VISIT_INDEX_PREFIX}${sessionId}`;
}

async function storageGet<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function storageGetMulti<T>(keys: string[]): Promise<Record<string, T>> {
  if (keys.length === 0) return {};
  const result = await chrome.storage.local.get(keys);
  return result as Record<string, T>;
}

async function storageSet(items: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(items);
}

async function storageRemove(keys: string[]): Promise<void> {
  await chrome.storage.local.remove(keys);
}

// -----------------------------------------------------------------------------
// ChromeStorageAdapter
// -----------------------------------------------------------------------------

export class ChromeStorageAdapter implements StorageAdapter {
  // --- Sessions ---

  async getSessions(options?: SessionQueryOptions): Promise<Session[]> {
    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    if (sessionIds.length === 0) return [];

    const keys = sessionIds.map(sessionKey);
    const records = await storageGetMulti<Session>(keys);

    let sessions = sessionIds
      .map((id) => records[sessionKey(id)])
      .filter((s): s is Session => s !== undefined);

    // Sort
    const sort = options?.sort ?? "desc";
    sessions.sort((a, b) =>
      sort === "asc" ? a.startedAt - b.startedAt : b.startedAt - a.startedAt
    );

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit;
    sessions = sessions.slice(offset, limit !== undefined ? offset + limit : undefined);

    return sessions;
  }

  async getSession(id: string): Promise<Session | null> {
    return (await storageGet<Session>(sessionKey(id))) ?? null;
  }

  async createSession(session: Omit<Session, "id">): Promise<Session> {
    const id = generateId();
    const newSession: Session = { ...session, id };

    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    sessionIds.push(id);

    await storageSet({
      [sessionKey(id)]: newSession,
      [SESSION_INDEX_KEY]: sessionIds,
    });

    return newSession;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const existing = await this.getSession(id);
    if (!existing) throw new Error(`Session not found: ${id}`);
    const updated: Session = { ...existing, ...updates, id };
    await storageSet({ [sessionKey(id)]: updated });
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    const visitIds = (await storageGet<string[]>(visitIndexKey(id))) ?? [];
    const keysToRemove = [
      sessionKey(id),
      visitIndexKey(id),
      ...visitIds.map(visitKey),
    ];
    await storageRemove(keysToRemove);

    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    const filtered = sessionIds.filter((sid) => sid !== id);
    await storageSet({ [SESSION_INDEX_KEY]: filtered });
  }

  // --- Visits ---

  async getVisitsBySession(sessionId: string): Promise<Visit[]> {
    const visitIds = (await storageGet<string[]>(visitIndexKey(sessionId))) ?? [];
    if (visitIds.length === 0) return [];

    const keys = visitIds.map(visitKey);
    const records = await storageGetMulti<Visit>(keys);

    return visitIds
      .map((id) => records[visitKey(id)])
      .filter((v): v is Visit => v !== undefined);
  }

  async getVisit(id: string): Promise<Visit | null> {
    return (await storageGet<Visit>(visitKey(id))) ?? null;
  }

  async createVisit(visit: Omit<Visit, "id">): Promise<Visit> {
    const id = generateId();
    const newVisit: Visit = { ...visit, id };

    const visitIds = (await storageGet<string[]>(visitIndexKey(visit.sessionId))) ?? [];
    visitIds.push(id);

    await storageSet({
      [visitKey(id)]: newVisit,
      [visitIndexKey(visit.sessionId)]: visitIds,
    });

    return newVisit;
  }

  async updateVisit(id: string, updates: Partial<Visit>): Promise<Visit> {
    const existing = await this.getVisit(id);
    if (!existing) throw new Error(`Visit not found: ${id}`);
    const updated: Visit = { ...existing, ...updates, id };
    await storageSet({ [visitKey(id)]: updated });
    return updated;
  }

  // --- Search & Analysis ---

  async searchVisits(query: string): Promise<Visit[]> {
    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    const allVisits = await this._getAllVisits(sessionIds);
    const lower = query.toLowerCase();
    return allVisits.filter(
      (v) =>
        v.articleTitle.toLowerCase().includes(lower) ||
        v.metadata.excerpt?.toLowerCase().includes(lower)
    );
  }

  async getArticleHistory(articleId: string): Promise<Visit[]> {
    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    const allVisits = await this._getAllVisits(sessionIds);
    return allVisits
      .filter((v) => v.articleId === articleId)
      .sort((a, b) => a.visitedAt - b.visitedAt);
  }

  async getTopArticles(limit: number): Promise<TopArticle[]> {
    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    const allVisits = await this._getAllVisits(sessionIds);

    const counts = new Map<string, { title: string; count: number }>();
    for (const visit of allVisits) {
      const entry = counts.get(visit.articleId);
      if (entry) {
        entry.count++;
      } else {
        counts.set(visit.articleId, { title: visit.articleTitle, count: 1 });
      }
    }

    return [...counts.entries()]
      .map(([articleId, { title, count }]) => ({
        articleId,
        articleTitle: title,
        visitCount: count,
      }))
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, limit);
  }

  async getOverlappingSessions(articleId: string): Promise<Session[]> {
    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    const overlapping: Session[] = [];

    for (const sid of sessionIds) {
      const visits = await this.getVisitsBySession(sid);
      if (visits.some((v) => v.articleId === articleId)) {
        const session = await this.getSession(sid);
        if (session) overlapping.push(session);
      }
    }

    return overlapping;
  }

  // --- Bulk Operations ---

  async exportAll(): Promise<WikiPathExport> {
    const sessionIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    const sessions: Session[] = [];
    const visits: Visit[] = [];

    for (const sid of sessionIds) {
      const session = await this.getSession(sid);
      if (session) sessions.push(session);
      const sessionVisits = await this.getVisitsBySession(sid);
      visits.push(...sessionVisits);
    }

    return {
      version: 1,
      exportedAt: Date.now(),
      platform: "chrome-extension",
      sessions,
      visits,
    };
  }

  async importAll(data: WikiPathExport): Promise<ImportResult> {
    const items: Record<string, unknown> = {};
    const sessionIds: string[] = [];

    for (const session of data.sessions) {
      items[sessionKey(session.id)] = session;
      sessionIds.push(session.id);
    }

    const visitIndexes = new Map<string, string[]>();
    for (const visit of data.visits) {
      items[visitKey(visit.id)] = visit;
      const idx = visitIndexes.get(visit.sessionId) ?? [];
      idx.push(visit.id);
      visitIndexes.set(visit.sessionId, idx);
    }

    for (const [sid, vids] of visitIndexes) {
      items[visitIndexKey(sid)] = vids;
    }

    const existingIds = (await storageGet<string[]>(SESSION_INDEX_KEY)) ?? [];
    const mergedIds = [...new Set([...existingIds, ...sessionIds])];
    items[SESSION_INDEX_KEY] = mergedIds;

    await storageSet(items);

    return {
      sessions: data.sessions.length,
      visits: data.visits.length,
    };
  }

  async clear(): Promise<void> {
    await chrome.storage.local.clear();
  }

  // --- Private Helpers ---

  private async _getAllVisits(sessionIds: string[]): Promise<Visit[]> {
    const all: Visit[] = [];
    for (const sid of sessionIds) {
      const visits = await this.getVisitsBySession(sid);
      all.push(...visits);
    }
    return all;
  }
}
