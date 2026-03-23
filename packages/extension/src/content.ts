// =============================================================================
// WikiPath Extension — Content Script
// =============================================================================
// Injected on wiki pages. Captures article excerpts and scroll depth,
// then forwards them to the background service worker.
// =============================================================================

// -----------------------------------------------------------------------------
// Types (mirroring background message protocol)
// -----------------------------------------------------------------------------

interface UpdateMetadataMessage {
  type: "UPDATE_METADATA";
  visitId: string;
  excerpt?: string;
  scrollDepth?: number;
}

// -----------------------------------------------------------------------------
// Excerpt extraction
// -----------------------------------------------------------------------------

function extractExcerpt(maxLength: number = 200): string | null {
  // Wikipedia article body is inside #mw-content-text .mw-parser-output
  const content =
    document.querySelector("#mw-content-text .mw-parser-output") ??
    document.querySelector(".mw-content-ltr") ??
    document.querySelector("#content");

  if (!content) return null;

  // Find the first meaningful paragraph (non-empty, not a hatnote/notice)
  const paragraphs = content.querySelectorAll("p");
  for (const p of paragraphs) {
    const text = p.textContent?.trim() ?? "";
    if (text.length < 20) continue; // skip stubs / empty paragraphs
    if (p.classList.contains("mw-empty-elt")) continue;
    return text.slice(0, maxLength);
  }

  return null;
}

// -----------------------------------------------------------------------------
// Scroll depth tracking
// -----------------------------------------------------------------------------

let maxScrollDepth = 0;

function calculateScrollDepth(): number {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (docHeight <= 0) return 1;
  return Math.min(1, scrollTop / docHeight);
}

function onScroll(): void {
  const depth = calculateScrollDepth();
  if (depth > maxScrollDepth) {
    maxScrollDepth = depth;
  }
}

// Throttled scroll listener (fire at most once per 500ms)
let scrollThrottle: ReturnType<typeof setTimeout> | null = null;
window.addEventListener("scroll", () => {
  if (scrollThrottle !== null) return;
  scrollThrottle = setTimeout(() => {
    onScroll();
    scrollThrottle = null;
  }, 500);
});

// -----------------------------------------------------------------------------
// Communication with background
// -----------------------------------------------------------------------------

// We need the current visit ID from the background. We get it by reading the
// tab visit map — but from a content script we can't directly. Instead we use
// a two-pass approach: send excerpt immediately, and let the background resolve
// the current tab's visit ID via the sender tab ID.

type ContentMessage = UpdateMetadataMessage;

function sendToBackground(message: ContentMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Background may not be ready; ignore
  });
}

// The background identifies which visit to update by matching the sender's
// tab ID to the tab→visit map. We encode this via a special message type
// that the background resolves internally.

interface TabMetadataMessage {
  type: "TAB_METADATA";
  excerpt?: string;
  scrollDepth?: number;
}

function sendTabMetadata(excerpt?: string, scrollDepth?: number): void {
  const msg: TabMetadataMessage = { type: "TAB_METADATA" };
  if (excerpt !== undefined) msg.excerpt = excerpt;
  if (scrollDepth !== undefined) msg.scrollDepth = scrollDepth;
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init(): void {
  // Send excerpt immediately on page load
  const excerpt = extractExcerpt(200);
  sendTabMetadata(excerpt ?? undefined);

  // Send scroll depth before the page unloads
  window.addEventListener("beforeunload", () => {
    onScroll(); // capture final scroll position
    sendTabMetadata(undefined, maxScrollDepth);
  });

  // Also send scroll depth periodically (every 30s) in case service worker restarts
  setInterval(() => {
    onScroll();
    sendTabMetadata(undefined, maxScrollDepth);
  }, 30_000);
}

// Run after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
