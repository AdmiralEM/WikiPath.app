// =============================================================================
// WikiPath Extension — Background Worker Tests
// =============================================================================
// Tests for the isNonArticle filter and URL-based namespace detection.
// =============================================================================

import { describe, it, expect, vi } from "vitest";

// Minimal chrome stub so background.ts imports don't crash at module level
vi.stubGlobal("chrome", {
  storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() } },
  webNavigation: { onCompleted: { addListener: vi.fn() } },
  tabs: { onCreated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() } },
  alarms: {
    onAlarm: { addListener: vi.fn() },
    create: vi.fn(),
    clear: vi.fn(),
  },
  runtime: { onMessage: { addListener: vi.fn() } },
});

// Import after stubbing globals
const { isNonArticle } = await import("./background.js");

// -----------------------------------------------------------------------------
// isNonArticle
// -----------------------------------------------------------------------------

describe("isNonArticle", () => {
  it("returns false for a regular article title", () => {
    expect(isNonArticle("JavaScript")).toBe(false);
    expect(isNonArticle("World War II")).toBe(false);
    expect(isNonArticle("Albert Einstein")).toBe(false);
  });

  it("returns true for Special: namespace", () => {
    expect(isNonArticle("Special:Search")).toBe(true);
    expect(isNonArticle("Special:RecentChanges")).toBe(true);
  });

  it("returns true for Wikipedia: namespace", () => {
    expect(isNonArticle("Wikipedia:About")).toBe(true);
  });

  it("returns true for Talk: namespace", () => {
    expect(isNonArticle("Talk:JavaScript")).toBe(true);
  });

  it("returns true for User: namespace", () => {
    expect(isNonArticle("User:SomeEditor")).toBe(true);
  });

  it("returns true for User_talk: namespace", () => {
    expect(isNonArticle("User_talk:SomeEditor")).toBe(true);
  });

  it("returns true for File: namespace", () => {
    expect(isNonArticle("File:Example.png")).toBe(true);
  });

  it("returns true for Category: namespace", () => {
    expect(isNonArticle("Category:Programming_languages")).toBe(true);
  });

  it("returns true for Template: namespace", () => {
    expect(isNonArticle("Template:Infobox")).toBe(true);
  });

  it("returns true for Help: namespace", () => {
    expect(isNonArticle("Help:Contents")).toBe(true);
  });

  it("returns true for Portal: namespace", () => {
    expect(isNonArticle("Portal:Technology")).toBe(true);
  });

  it("returns false for a title that looks similar but isn't a namespace", () => {
    // "Specialist" starts with "Special" but not "Special:"
    expect(isNonArticle("Specialist")).toBe(false);
    // "Category theory" is a real article, not Category:
    expect(isNonArticle("Category theory")).toBe(false);
  });

  it("returns true for WP: shortcut namespace", () => {
    expect(isNonArticle("WP:NPOV")).toBe(true);
  });

  it("is case-sensitive (namespace must match exactly)", () => {
    // Wikipedia namespaces are capitalized; lowercase should not be filtered
    expect(isNonArticle("special:search")).toBe(false);
    expect(isNonArticle("talk:foo")).toBe(false);
  });
});
