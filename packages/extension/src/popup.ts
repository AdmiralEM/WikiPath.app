// =============================================================================
// WikiPath Extension — Popup Script
// =============================================================================
// Renders session status, stats, and recent sessions.
// Handles End Session and Export actions.
// =============================================================================

import type { Session, SessionStateContext, WikiPathConfig } from "@wikipath/shared";
import { formatDuration } from "@wikipath/shared";

// -----------------------------------------------------------------------------
// Message types
// -----------------------------------------------------------------------------

type PopupMessage =
  | { type: "GET_STATE" }
  | { type: "END_SESSION" }
  | { type: "EXPORT" }
  | { type: "GET_RECENT_SESSIONS"; limit: number };

interface StateResponse {
  ok: true;
  state: SessionStateContext;
  session: Session | null;
  config: WikiPathConfig;
}

interface SessionsResponse {
  ok: true;
  sessions: Array<Session & { _duration?: string }>;
}

interface ExportResponse {
  ok: true;
  data: string;
}

type ErrorResponse = { ok: false; error: string };

async function sendMessage<T>(message: PopupMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

// -----------------------------------------------------------------------------
// DOM helpers
// -----------------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function show(id: string): void {
  el(id).style.display = "";
}

function hide(id: string): void {
  el(id).style.display = "none";
}

function setText(id: string, text: string): void {
  el(id).textContent = text;
}

function showError(msg: string): void {
  const errEl = el("error-msg");
  errEl.textContent = msg;
  errEl.style.display = "block";
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

async function triggerExport(): Promise<void> {
  const resp = (await sendMessage({ type: "EXPORT" })) as ExportResponse | ErrorResponse;
  if (!resp.ok) {
    showError("Export failed.");
    return;
  }
  const blob = new Blob([resp.data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wikipath-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// Render recent sessions
// -----------------------------------------------------------------------------

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderRecentSessions(sessions: Array<Session & { _duration?: string }>): void {
  const listEl = el("session-list");
  listEl.innerHTML = "";

  if (sessions.length === 0) {
    listEl.innerHTML = '<div class="empty">No sessions yet.</div>';
    show("recent-section");
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("div");
    item.className = "session-item";

    const duration =
      session._duration ??
      (session.endedAt !== null
        ? formatDuration(session.endedAt - session.startedAt)
        : "ongoing");

    item.innerHTML = `
      <div class="session-item-title">${escapeHtml(session.title)}</div>
      <div class="session-item-meta">${session.metadata.visitCount} pages · ${duration}</div>
      <div class="session-item-date">${formatDate(session.startedAt)}</div>
    `;
    listEl.appendChild(item);
  }

  show("recent-section");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------------------
// Main render
// -----------------------------------------------------------------------------

async function render(): Promise<void> {
  hide("loading");

  // Get current state
  const stateResp = (await sendMessage({ type: "GET_STATE" })) as
    | StateResponse
    | ErrorResponse;

  if (!stateResp.ok) {
    showError("Could not load state.");
    return;
  }

  const { state, session } = stateResp;

  // Update status indicator
  const dot = el("status-dot");
  const label = el<HTMLSpanElement>("status-label");

  if (state.state === "active" && session !== null) {
    dot.classList.add("active");
    label.textContent = "Active";
    label.classList.add("active");

    // Populate session card
    setText("session-title", session.title);
    setText("stat-visits", String(session.metadata.visitCount));
    setText("stat-unique", String(session.metadata.uniqueArticles));
    setText("stat-depth", String(session.metadata.maxDepth));
    setText("stat-wikis", String(session.metadata.wikis.length));

    show("active-section");
    hide("idle-section");
  } else {
    label.textContent = "Idle";
    hide("active-section");
    show("idle-section");
  }

  // Load recent sessions (last 10)
  const recentResp = (await sendMessage({
    type: "GET_RECENT_SESSIONS",
    limit: 10,
  })) as SessionsResponse | ErrorResponse;

  if (recentResp.ok) {
    // Filter out the currently active session from the list
    const filtered = recentResp.sessions.filter(
      (s) => s.id !== session?.id || state.state !== "active"
    );
    if (filtered.length > 0) {
      renderRecentSessions(filtered);
    }
  }
}

// -----------------------------------------------------------------------------
// Event wiring
// -----------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  void render();

  el("btn-end")?.addEventListener("click", async () => {
    await sendMessage({ type: "END_SESSION" });
    // Re-render
    void render();
  });

  el("btn-export")?.addEventListener("click", () => void triggerExport());
  el("btn-export-idle")?.addEventListener("click", () => void triggerExport());
});
