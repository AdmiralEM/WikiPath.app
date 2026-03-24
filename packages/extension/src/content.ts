// =============================================================================
// WikiPath Extension — Content Script
// =============================================================================
// Injected on wiki pages. Captures article excerpts, scroll depth, wiki links,
// and categories, then forwards them to the background service worker.
// =============================================================================

import { extractArticleTitle } from "@wikipath/shared";

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
// Wiki link extraction
// -----------------------------------------------------------------------------

function extractWikiLinks(): string[] {
  const content = document.querySelector("#mw-content-text .mw-parser-output");
  if (!content) return [];

  const anchors = content.querySelectorAll<HTMLAnchorElement>('a[href*="/wiki/"]');
  const titles = new Set<string>();

  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;
    // Build a full URL so extractArticleTitle can parse it
    const fullUrl = new URL(href, window.location.origin).href;
    const title = extractArticleTitle(fullUrl);
    if (title) titles.add(title);
  }

  return [...titles];
}

// -----------------------------------------------------------------------------
// Category extraction
// -----------------------------------------------------------------------------

function extractCategories(): string[] {
  // Wikipedia: #mw-normal-catlinks ul li a
  const catLinks = document.querySelectorAll<HTMLAnchorElement>(
    "#mw-normal-catlinks ul li a"
  );
  const categories: string[] = [];
  for (const a of catLinks) {
    const text = a.textContent?.trim();
    if (text) categories.push(text);
  }
  return categories;
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
// Message types
// -----------------------------------------------------------------------------

interface TabMetadataMessage {
  type: "TAB_METADATA";
  excerpt?: string;
  scrollDepth?: number;
  categories?: string[];
}

interface ContentLinksMessage {
  type: "CONTENT_LINKS";
  articleTitles: string[];
}

type ContentMessage = TabMetadataMessage | ContentLinksMessage;

// -----------------------------------------------------------------------------
// Communication with background
// -----------------------------------------------------------------------------

function sendToBackground(message: ContentMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Background may not be ready; ignore
  });
}

function sendTabMetadata(excerpt?: string, scrollDepth?: number, categories?: string[]): void {
  const msg: TabMetadataMessage = { type: "TAB_METADATA" };
  if (excerpt !== undefined) msg.excerpt = excerpt;
  if (scrollDepth !== undefined) msg.scrollDepth = scrollDepth;
  if (categories !== undefined && categories.length > 0) msg.categories = categories;
  sendToBackground(msg);
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init(): void {
  // Send excerpt + categories immediately on page load
  const excerpt = extractExcerpt(200);
  const categories = extractCategories();
  sendTabMetadata(excerpt ?? undefined, undefined, categories.length > 0 ? categories : undefined);

  // Scan wiki links and send to background for contextual edge detection
  const articleTitles = extractWikiLinks();
  if (articleTitles.length > 0) {
    sendToBackground({ type: "CONTENT_LINKS", articleTitles });
  }

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
