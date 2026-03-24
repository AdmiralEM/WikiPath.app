// =============================================================================
// WikiPath Extension — Background Service Worker
// =============================================================================
// Session state machine, tab lineage tracking, and visit recording.
// All critical state is persisted to chrome.storage.local so it survives
// service worker restarts. Never rely on in-memory state alone.
// =============================================================================

import {
  buildArticleId,
  buildSessionMetadata,
  DEFAULT_CONFIG,
  extractArticleTitle,
  formatDuration,
  generateId,
  isSessionTimedOut,
  isTrackedUrl,
  parseWikiSource,
} from "@wikipath/shared";
import type {
  Session,
  SessionStateContext,
  Visit,
  WikiPathConfig,
} from "@wikipath/shared";
import { ChromeStorageAdapter } from "./storage.js";

// -----------------------------------------------------------------------------
// Non-article namespaces to skip
// -----------------------------------------------------------------------------

const SKIP_NAMESPACES = [
  "Special:",
  "Wikipedia:",
  "Talk:",
  "User:",
  "User_talk:",
  "Wikipedia_talk:",
  "File:",
  "File_talk:",
  "MediaWiki:",
  "MediaWiki_talk:",
  "Template:",
  "Template_talk:",
  "Help:",
  "Help_talk:",
  "Category:",
  "Category_talk:",
  "Portal:",
  "Portal_talk:",
  "WP:",
];

export function isNonArticle(title: string): boolean {
  return SKIP_NAMESPACES.some((ns) => title.startsWith(ns));
}

// -----------------------------------------------------------------------------
// Storage keys for runtime state
// -----------------------------------------------------------------------------

const STATE_KEY = "runtime:sessionState";
const CONFIG_KEY = "runtime:config";
const TAB_VISITS_KEY = "runtime:tabVisits"; // tabId → visitId
const TAB_OPENER_KEY = "runtime:tabOpeners"; // tabId → openerTabId
const ALARM_NAME = "sessionTimeout";

// -----------------------------------------------------------------------------
// Adapter singleton
// -----------------------------------------------------------------------------

const storage = new ChromeStorageAdapter();

// -----------------------------------------------------------------------------
// State helpers
// -----------------------------------------------------------------------------

async function getState(): Promise<SessionStateContext> {
  const result = await chrome.storage.local.get(STATE_KEY);
  return (
    (result[STATE_KEY] as SessionStateContext | undefined) ?? {
      state: "idle",
      activeSessionId: null,
      lastVisitAt: null,
    }
  );
}

async function setState(ctx: SessionStateContext): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: ctx });
}

async function getConfig(): Promise<WikiPathConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return (result[CONFIG_KEY] as WikiPathConfig | undefined) ?? DEFAULT_CONFIG;
}

async function getTabVisits(): Promise<Record<number, string>> {
  const result = await chrome.storage.local.get(TAB_VISITS_KEY);
  return (result[TAB_VISITS_KEY] as Record<number, string> | undefined) ?? {};
}

async function setTabVisits(map: Record<number, string>): Promise<void> {
  await chrome.storage.local.set({ [TAB_VISITS_KEY]: map });
}

async function getTabOpeners(): Promise<Record<number, number>> {
  const result = await chrome.storage.local.get(TAB_OPENER_KEY);
  return (result[TAB_OPENER_KEY] as Record<number, number> | undefined) ?? {};
}

async function setTabOpeners(map: Record<number, number>): Promise<void> {
  await chrome.storage.local.set({ [TAB_OPENER_KEY]: map });
}

// -----------------------------------------------------------------------------
// Session lifecycle
// -----------------------------------------------------------------------------

async function startSession(rootVisitId: string, rootTitle: string): Promise<Session> {
  const session = await storage.createSession({
    title: rootTitle,
    startedAt: Date.now(),
    endedAt: null,
    rootVisitId,
    metadata: {
      visitCount: 1,
      uniqueArticles: 1,
      wikis: [],
      maxDepth: 0,
      tags: [],
    },
  });

  await setState({
    state: "active",
    activeSessionId: session.id,
    lastVisitAt: Date.now(),
  });

  await scheduleTimeoutAlarm();
  return session;
}

async function endSession(sessionId: string): Promise<void> {
  const visits = await storage.getVisitsBySession(sessionId);
  const metadata = buildSessionMetadata(visits);
  await storage.updateSession(sessionId, {
    endedAt: Date.now(),
    metadata,
  });
  await setState({ state: "idle", activeSessionId: null, lastVisitAt: null });
  await chrome.alarms.clear(ALARM_NAME);
}

async function scheduleTimeoutAlarm(): Promise<void> {
  const config = await getConfig();
  const delayMinutes = config.sessionTimeoutMs / 60_000;
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: delayMinutes });
}

// -----------------------------------------------------------------------------
// Visit recording
// -----------------------------------------------------------------------------

async function recordVisit(
  tabId: number,
  url: string,
  config: WikiPathConfig
): Promise<void> {
  const wiki = parseWikiSource(url);
  if (!wiki) return;

  const title = extractArticleTitle(url);
  if (!title || isNonArticle(title)) return;

  const articleId = buildArticleId(wiki, title);
  const now = Date.now();

  // Determine parent visit from tab lineage
  const tabVisits = await getTabVisits();
  const tabOpeners = await getTabOpeners();

  let parentVisitId: string | null = null;
  const currentTabVisit = tabVisits[tabId];
  if (currentTabVisit !== undefined) {
    // Same tab navigation — parent is the current visit on this tab
    parentVisitId = currentTabVisit;
  } else {
    // New tab — look up opener tab's current visit
    const openerTabId = tabOpeners[tabId];
    if (openerTabId !== undefined) {
      const openerVisit = tabVisits[openerTabId];
      parentVisitId = openerVisit ?? null;
    }
  }

  // Determine session membership
  const ctx = await getState();
  let sessionId: string;
  let depth = 0;

  if (ctx.state === "active" && ctx.activeSessionId !== null) {
    const timedOut = isSessionTimedOut(ctx.lastVisitAt ?? 0, config.sessionTimeoutMs);
    if (timedOut) {
      // Close the old session, start fresh
      await endSession(ctx.activeSessionId);
      parentVisitId = null;
    } else {
      sessionId = ctx.activeSessionId;
      // Calculate depth from parent
      if (parentVisitId !== null) {
        const parentVisit = await storage.getVisit(parentVisitId);
        depth = parentVisit ? parentVisit.depth + 1 : 0;
      }
    }
  }

  // Create a new session if we're idle
  const freshCtx = await getState();
  let rootVisitId: string | undefined;

  if (freshCtx.state === "idle") {
    // We'll create the visit first, then start the session pointing to it
    const visitId = generateId();
    rootVisitId = visitId;
    sessionId = ""; // will be set after session creation
    parentVisitId = null;
    depth = 0;

    // Create a temporary visit record so we can reference it in the session
    const visit: Visit = {
      id: visitId,
      sessionId: "", // placeholder, updated below
      parentVisitId: null,
      url,
      wiki,
      articleTitle: title,
      articleId,
      visitedAt: now,
      dwellTime: null,
      depth: 0,
      metadata: { scrollDepth: null, excerpt: null },
    };

    // Start session
    const session = await startSession(visitId, title);
    sessionId = session.id;

    // Now store the visit with the correct sessionId
    const finalVisit: Visit = { ...visit, sessionId };
    await chrome.storage.local.set({
      [`visit:${visitId}`]: finalVisit,
    });
    // Add to session visit index
    const visitIdxKey = `index:visits:${sessionId}`;
    const existingIds =
      ((await chrome.storage.local.get(visitIdxKey))[visitIdxKey] as string[] | undefined) ?? [];
    existingIds.push(visitId);
    await chrome.storage.local.set({ [visitIdxKey]: existingIds });

    // Update tab mapping
    tabVisits[tabId] = visitId;
    await setTabVisits(tabVisits);
    return;
  }

  // Active session — calculate dwell time for the previous visit on this tab
  if (currentTabVisit !== undefined && ctx.lastVisitAt !== null) {
    const prevVisit = await storage.getVisit(currentTabVisit);
    if (prevVisit) {
      const dwell = now - prevVisit.visitedAt;
      await storage.updateVisit(currentTabVisit, { dwellTime: dwell });
    }
  }

  // Create the visit
  const newVisit = await storage.createVisit({
    sessionId: sessionId!,
    parentVisitId,
    url,
    wiki,
    articleTitle: title,
    articleId,
    visitedAt: now,
    dwellTime: null,
    depth,
    metadata: { scrollDepth: null, excerpt: null },
  });

  // Update last visit time and reset alarm
  await setState({
    state: "active",
    activeSessionId: sessionId!,
    lastVisitAt: now,
  });
  await scheduleTimeoutAlarm();

  // Update session metadata
  const allVisits = await storage.getVisitsBySession(sessionId!);
  const metadata = buildSessionMetadata(allVisits);
  await storage.updateSession(sessionId!, { metadata });

  // Map tab → visit
  tabVisits[tabId] = newVisit.id;
  await setTabVisits(tabVisits);
}

// -----------------------------------------------------------------------------
// Message types
// -----------------------------------------------------------------------------

type BackgroundMessage =
  | { type: "GET_STATE" }
  | { type: "END_SESSION" }
  | { type: "EXPORT" }
  | { type: "UPDATE_METADATA"; visitId: string; excerpt?: string; scrollDepth?: number }
  | { type: "TAB_METADATA"; excerpt?: string; scrollDepth?: number }
  | { type: "GET_RECENT_SESSIONS"; limit: number };

type BackgroundResponse =
  | { ok: true; state: SessionStateContext; session: Session | null; config: WikiPathConfig }
  | { ok: true; sessions: Session[] }
  | { ok: true; data: string }
  | { ok: true }
  | { ok: false; error: string };

// -----------------------------------------------------------------------------
// Event listeners
// -----------------------------------------------------------------------------

// Navigation completed
chrome.webNavigation.onCompleted.addListener(
  async (details) => {
    if (details.frameId !== 0) return; // main frame only
    const config = await getConfig();
    if (!isTrackedUrl(details.url, config.trackedDomains)) return;
    await recordVisit(details.tabId, details.url, config);
  }
);

// Track tab opener relationships (for new-tab link follows)
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id === undefined) return;
  if (tab.openerTabId !== undefined) {
    const openers = await getTabOpeners();
    openers[tab.id] = tab.openerTabId;
    await setTabOpeners(openers);
  }
});

// Clean up tab state when tabs are closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabVisits = await getTabVisits();
  const tabOpeners = await getTabOpeners();

  // Calculate dwell time for the tab's last visit
  const lastVisitId = tabVisits[tabId];
  if (lastVisitId !== undefined) {
    const visit = await storage.getVisit(lastVisitId);
    if (visit && visit.dwellTime === null) {
      const dwell = Date.now() - visit.visitedAt;
      await storage.updateVisit(lastVisitId, { dwellTime: dwell });
    }
  }

  delete tabVisits[tabId];
  delete tabOpeners[tabId];
  await setTabVisits(tabVisits);
  await setTabOpeners(tabOpeners);
});

// Session timeout alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const ctx = await getState();
  if (ctx.state === "active" && ctx.activeSessionId !== null) {
    const config = await getConfig();
    if (isSessionTimedOut(ctx.lastVisitAt ?? 0, config.sessionTimeoutMs)) {
      await endSession(ctx.activeSessionId);
    }
  }
});

// Messages from content script and popup
chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void
  ) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, error: msg });
      });
    return true; // async response
  }
);

async function handleMessage(
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<BackgroundResponse> {
  switch (message.type) {
    case "GET_STATE": {
      const ctx = await getState();
      const config = await getConfig();
      const session =
        ctx.activeSessionId !== null ? await storage.getSession(ctx.activeSessionId) : null;
      return { ok: true, state: ctx, session, config };
    }

    case "END_SESSION": {
      const ctx = await getState();
      if (ctx.state === "active" && ctx.activeSessionId !== null) {
        await endSession(ctx.activeSessionId);
      }
      return { ok: true };
    }

    case "EXPORT": {
      const exportData = await storage.exportAll();
      return { ok: true, data: JSON.stringify(exportData, null, 2) };
    }

    case "UPDATE_METADATA": {
      const visit = await storage.getVisit(message.visitId);
      if (!visit) return { ok: true };
      const config = await getConfig();
      const updates: Partial<Visit> = {};
      if (message.excerpt !== undefined && config.captureExcerpts) {
        updates.metadata = {
          ...visit.metadata,
          excerpt: message.excerpt.slice(0, config.maxExcerptLength),
        };
      }
      if (message.scrollDepth !== undefined && config.trackScrollDepth) {
        updates.metadata = {
          ...(updates.metadata ?? visit.metadata),
          scrollDepth: message.scrollDepth,
        };
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateVisit(message.visitId, updates);
      }
      return { ok: true };
    }

    case "TAB_METADATA": {
      // Content script sends metadata without a visitId — resolve via sender tab
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { ok: true };
      const tabVisitsMap = await getTabVisits();
      const visitId = tabVisitsMap[tabId];
      if (visitId === undefined) return { ok: true };
      const visit = await storage.getVisit(visitId);
      if (!visit) return { ok: true };
      const config = await getConfig();
      const metadataUpdates: Partial<Visit> = {};
      let newMeta = { ...visit.metadata };
      if (message.excerpt !== undefined && config.captureExcerpts) {
        newMeta = { ...newMeta, excerpt: message.excerpt.slice(0, config.maxExcerptLength) };
      }
      if (message.scrollDepth !== undefined && config.trackScrollDepth) {
        // Only update if higher than current
        const current = visit.metadata.scrollDepth ?? 0;
        if (message.scrollDepth > current) {
          newMeta = { ...newMeta, scrollDepth: message.scrollDepth };
        }
      }
      metadataUpdates.metadata = newMeta;
      await storage.updateVisit(visitId, metadataUpdates);
      return { ok: true };
    }

    case "GET_RECENT_SESSIONS": {
      const sessions = await storage.getSessions({
        limit: message.limit,
        sort: "desc",
      });
      // Annotate with duration string for popup display
      const annotated = sessions.map((s) => ({
        ...s,
        _duration:
          s.endedAt !== null
            ? formatDuration(s.endedAt - s.startedAt)
            : "ongoing",
      }));
      return { ok: true, sessions: annotated as Session[] };
    }

    default: {
      const _exhaustive: never = message;
      return { ok: false, error: "Unknown message type" };
    }
  }
}
