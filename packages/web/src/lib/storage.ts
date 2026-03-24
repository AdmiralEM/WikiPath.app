"use client";
// =============================================================================
// WikiPath Web — IndexedDBStorageAdapter
// =============================================================================
// Implements the StorageAdapter interface using IndexedDB.
// Object stores: "sessions" (keyPath: id), "visits" (keyPath: id)
// Indexes on visits: sessionId, articleId, visitedAt
// =============================================================================

import { generateId } from "@wikipath/shared";
import type {
  ImportResult,
  Session,
  SessionQueryOptions,
  StorageAdapter,
  TopArticle,
  Visit,
  WikiPathExport,
} from "@wikipath/shared";

const DEFAULT_DB_NAME = "wikipath";
const DB_VERSION = 1;

// -----------------------------------------------------------------------------
// DB bootstrap — per-name singleton so tests can use isolated DB names
// -----------------------------------------------------------------------------

const _dbs = new Map<string, IDBDatabase>();

function openDB(dbName: string): Promise<IDBDatabase> {
  const cached = _dbs.get(dbName);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Sessions store
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }

      // Visits store with indexes
      if (!db.objectStoreNames.contains("visits")) {
        const visitStore = db.createObjectStore("visits", { keyPath: "id" });
        visitStore.createIndex("by_session", "sessionId", { unique: false });
        visitStore.createIndex("by_article", "articleId", { unique: false });
        visitStore.createIndex("by_visited_at", "visitedAt", { unique: false });
      }
    };

    req.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      _dbs.set(dbName, db);
      resolve(db);
    };

    req.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// -----------------------------------------------------------------------------
// IDB helpers
// -----------------------------------------------------------------------------

function tx(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode
): IDBTransaction {
  return db.transaction(stores, mode);
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore<T>(store: IDBObjectStore): Promise<T[]> {
  return idbRequest(store.getAll() as IDBRequest<T[]>);
}

function getAllByIndex<T>(index: IDBIndex, query: IDBValidKey): Promise<T[]> {
  return idbRequest(index.getAll(query) as IDBRequest<T[]>);
}

// -----------------------------------------------------------------------------
// IndexedDBStorageAdapter
// -----------------------------------------------------------------------------

export class IndexedDBStorageAdapter implements StorageAdapter {
  private readonly dbName: string;

  constructor(dbName?: string) {
    this.dbName = dbName ?? DEFAULT_DB_NAME;
  }

  // --- Sessions ---

  async getSessions(options?: SessionQueryOptions): Promise<Session[]> {
    const db = await openDB(this.dbName);
    const store = tx(db, "sessions", "readonly").objectStore("sessions");
    let sessions = await getAllFromStore<Session>(store);

    const sort = options?.sort ?? "desc";
    sessions.sort((a, b) =>
      sort === "asc" ? a.startedAt - b.startedAt : b.startedAt - a.startedAt
    );

    const offset = options?.offset ?? 0;
    const limit = options?.limit;
    return sessions.slice(offset, limit !== undefined ? offset + limit : undefined);
  }

  async getSession(id: string): Promise<Session | null> {
    const db = await openDB(this.dbName);
    const store = tx(db, "sessions", "readonly").objectStore("sessions");
    const result = await idbRequest<Session | undefined>(
      store.get(id) as IDBRequest<Session | undefined>
    );
    return result ?? null;
  }

  async createSession(session: Omit<Session, "id">): Promise<Session> {
    const db = await openDB(this.dbName);
    const newSession: Session = { ...session, id: generateId() };
    const store = tx(db, "sessions", "readwrite").objectStore("sessions");
    await idbRequest(store.add(newSession));
    return newSession;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    const existing = await this.getSession(id);
    if (!existing) throw new Error(`Session not found: ${id}`);
    const updated: Session = { ...existing, ...updates, id };
    const db = await openDB(this.dbName);
    const store = tx(db, "sessions", "readwrite").objectStore("sessions");
    await idbRequest(store.put(updated));
    return updated;
  }

  async deleteSession(id: string): Promise<void> {
    const db = await openDB(this.dbName);
    const t = tx(db, ["sessions", "visits"], "readwrite");

    // Delete session
    await idbRequest(t.objectStore("sessions").delete(id));

    // Delete all visits for this session
    const visitStore = t.objectStore("visits");
    const index = visitStore.index("by_session");
    const visitIds = await idbRequest<string[]>(
      index.getAllKeys(id) as IDBRequest<string[]>
    );
    for (const vid of visitIds) {
      await idbRequest(visitStore.delete(vid));
    }
  }

  // --- Visits ---

  async getVisitsBySession(sessionId: string): Promise<Visit[]> {
    const db = await openDB(this.dbName);
    const store = tx(db, "visits", "readonly").objectStore("visits");
    const index = store.index("by_session");
    return getAllByIndex<Visit>(index, sessionId);
  }

  async getVisit(id: string): Promise<Visit | null> {
    const db = await openDB(this.dbName);
    const store = tx(db, "visits", "readonly").objectStore("visits");
    const result = await idbRequest<Visit | undefined>(
      store.get(id) as IDBRequest<Visit | undefined>
    );
    return result ?? null;
  }

  async createVisit(visit: Omit<Visit, "id">): Promise<Visit> {
    const db = await openDB(this.dbName);
    const newVisit: Visit = { ...visit, id: generateId() };
    const store = tx(db, "visits", "readwrite").objectStore("visits");
    await idbRequest(store.add(newVisit));
    return newVisit;
  }

  async updateVisit(id: string, updates: Partial<Visit>): Promise<Visit> {
    const existing = await this.getVisit(id);
    if (!existing) throw new Error(`Visit not found: ${id}`);
    const updated: Visit = { ...existing, ...updates, id };
    const db = await openDB(this.dbName);
    const store = tx(db, "visits", "readwrite").objectStore("visits");
    await idbRequest(store.put(updated));
    return updated;
  }

  // --- Search & Analysis ---

  async searchVisits(query: string): Promise<Visit[]> {
    const db = await openDB(this.dbName);
    const store = tx(db, "visits", "readonly").objectStore("visits");
    const all = await getAllFromStore<Visit>(store);
    const lower = query.toLowerCase();
    return all.filter(
      (v) =>
        v.articleTitle.toLowerCase().includes(lower) ||
        v.metadata.excerpt?.toLowerCase().includes(lower)
    );
  }

  async getArticleHistory(articleId: string): Promise<Visit[]> {
    const db = await openDB(this.dbName);
    const store = tx(db, "visits", "readonly").objectStore("visits");
    const index = store.index("by_article");
    const visits = await getAllByIndex<Visit>(index, articleId);
    return visits.sort((a, b) => a.visitedAt - b.visitedAt);
  }

  async getTopArticles(limit: number): Promise<TopArticle[]> {
    const db = await openDB(this.dbName);
    const store = tx(db, "visits", "readonly").objectStore("visits");
    const all = await getAllFromStore<Visit>(store);

    const counts = new Map<string, { title: string; count: number }>();
    for (const visit of all) {
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
    const db = await openDB(this.dbName);
    const visitStore = tx(db, "visits", "readonly").objectStore("visits");
    const index = visitStore.index("by_article");
    const visits = await getAllByIndex<Visit>(index, articleId);

    const sessionIds = [...new Set(visits.map((v) => v.sessionId))];
    const sessions: Session[] = [];
    for (const sid of sessionIds) {
      const s = await this.getSession(sid);
      if (s) sessions.push(s);
    }
    return sessions;
  }

  // --- Bulk Operations ---

  async exportAll(): Promise<WikiPathExport> {
    const db = await openDB(this.dbName);
    const t = tx(db, ["sessions", "visits"], "readonly");
    const sessions = await getAllFromStore<Session>(t.objectStore("sessions"));
    const visits = await getAllFromStore<Visit>(t.objectStore("visits"));

    return {
      version: 1,
      exportedAt: Date.now(),
      platform: "web",
      sessions,
      visits,
    };
  }

  async importAll(data: WikiPathExport): Promise<ImportResult> {
    const db = await openDB(this.dbName);
    const t = tx(db, ["sessions", "visits"], "readwrite");
    const sessionStore = t.objectStore("sessions");
    const visitStore = t.objectStore("visits");

    const promises: Promise<unknown>[] = [];
    for (const session of data.sessions) {
      promises.push(idbRequest(sessionStore.put(session)));
    }
    for (const visit of data.visits) {
      promises.push(idbRequest(visitStore.put(visit)));
    }
    await Promise.all(promises);

    return {
      sessions: data.sessions.length,
      visits: data.visits.length,
    };
  }

  async clear(): Promise<void> {
    const db = await openDB(this.dbName);
    const t = tx(db, ["sessions", "visits"], "readwrite");
    await Promise.all([
      idbRequest(t.objectStore("sessions").clear()),
      idbRequest(t.objectStore("visits").clear()),
    ]);
  }
}

// Singleton for use across the app
export const storageAdapter = new IndexedDBStorageAdapter();
