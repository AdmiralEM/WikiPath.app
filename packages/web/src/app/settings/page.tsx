"use client";
// =============================================================================
// WikiPath — /settings
// =============================================================================
// Session timeout config, tracked domains, import/export, clear all data.
// Config is stored in IndexedDB alongside sessions/visits (key: "config").
// =============================================================================

import { useState, useEffect, useRef } from "react";
import type { WikiPathConfig } from "@wikipath/shared";
import { DEFAULT_CONFIG } from "@wikipath/shared";
import { storageAdapter } from "@/lib/storage";

// We persist settings in a small wrapper on top of the storage adapter.
const CONFIG_KEY = "wikipath:config";

function loadConfig(): WikiPathConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<WikiPathConfig>) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: WikiPathConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export default function SettingsPage() {
  const [config, setConfig] = useState<WikiPathConfig>(DEFAULT_CONFIG);
  const [newDomain, setNewDomain] = useState("");
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  function update(patch: Partial<WikiPathConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function addDomain() {
    const d = newDomain.trim();
    if (!d || config.trackedDomains.includes(d)) return;
    update({ trackedDomains: [...config.trackedDomains, d] });
    setNewDomain("");
  }

  function removeDomain(domain: string) {
    update({ trackedDomains: config.trackedDomains.filter((d) => d !== domain) });
  }

  async function handleExport() {
    const data = await storageAdapter.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wikipath-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Parameters<typeof storageAdapter.importAll>[0];
      const result = await storageAdapter.importAll(data);
      alert(`Imported ${result.sessions} sessions and ${result.visits} visits.`);
    } catch {
      alert("Import failed: invalid file format.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return; }
    setClearing(true);
    try {
      await storageAdapter.clear();
      setConfirmClear(false);
      alert("All data cleared.");
    } finally {
      setClearing(false);
    }
  }

  const timeoutMinutes = Math.round(config.sessionTimeoutMs / 60_000);

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-[var(--ctp-lavender)]">Settings</h1>
        {saved && (
          <span className="text-xs text-[var(--ctp-green)] bg-[var(--ctp-surface0)] px-2 py-1 rounded-md">
            Saved
          </span>
        )}
      </div>

      {/* Session timeout */}
      <Section title="Session Detection">
        <label className="block">
          <span className="text-sm text-[var(--ctp-subtext1)] block mb-2">
            Session idle timeout: <strong className="text-[var(--ctp-lavender)]">{timeoutMinutes} min</strong>
          </span>
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={timeoutMinutes}
            onChange={(e) =>
              update({ sessionTimeoutMs: parseInt(e.target.value, 10) * 60_000 })
            }
            className="w-full accent-[var(--ctp-lavender)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--ctp-overlay0)] mt-1">
            <span>5 min</span>
            <span>120 min</span>
          </div>
        </label>
        <p className="text-xs text-[var(--ctp-overlay0)] mt-2">
          After this period of inactivity, the current session is automatically closed.
        </p>
      </Section>

      {/* Capture options */}
      <Section title="Capture Options">
        <Toggle
          label="Capture article excerpts"
          description="Store the first ~200 characters of each article for search and preview."
          checked={config.captureExcerpts}
          onChange={(v) => update({ captureExcerpts: v })}
        />
        <Toggle
          label="Track scroll depth"
          description="Record how far you scrolled on each article page."
          checked={config.trackScrollDepth}
          onChange={(v) => update({ trackScrollDepth: v })}
        />
      </Section>

      {/* Tracked domains */}
      <Section title="Tracked Domains">
        <p className="text-xs text-[var(--ctp-overlay0)] mb-3">
          Wildcard patterns like <code className="text-[var(--ctp-mauve)]">*.wikipedia.org</code> are supported.
        </p>
        <ul className="space-y-1 mb-3">
          {config.trackedDomains.map((domain) => (
            <li
              key={domain}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--ctp-surface0)]"
            >
              <span className="flex-1 text-sm text-[var(--ctp-text)] font-mono">{domain}</span>
              <button
                onClick={() => removeDomain(domain)}
                className="text-[var(--ctp-overlay0)] hover:text-[var(--ctp-red)] text-xs transition-colors"
                aria-label={`Remove ${domain}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain()}
            placeholder="e.g. *.fandom.com"
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--ctp-mantle)] border border-[var(--ctp-surface1)] text-[var(--ctp-text)] placeholder-[var(--ctp-overlay0)] focus:outline-none focus:border-[var(--ctp-lavender)] transition-colors font-mono"
          />
          <button
            onClick={addDomain}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--ctp-lavender)] text-[var(--ctp-base)] font-medium hover:opacity-90 transition-opacity"
          >
            Add
          </button>
        </div>
      </Section>

      {/* Import / Export */}
      <Section title="Data">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void handleExport()}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--ctp-surface0)] text-[var(--ctp-subtext1)] hover:bg-[var(--ctp-surface1)] hover:text-[var(--ctp-text)] transition-colors"
          >
            Export all data (JSON)
          </button>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--ctp-surface0)] text-[var(--ctp-subtext1)] hover:bg-[var(--ctp-surface1)] hover:text-[var(--ctp-text)] transition-colors disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import from JSON"}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => void handleImport(e)}
          />
        </div>
      </Section>

      {/* Danger zone */}
      <Section title="Danger Zone">
        <div className="flex items-center gap-4">
          <button
            onClick={() => void handleClear()}
            disabled={clearing}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50 ${
              confirmClear
                ? "bg-[var(--ctp-red)] text-[var(--ctp-base)] hover:opacity-90"
                : "bg-[var(--ctp-surface0)] text-[var(--ctp-red)] hover:bg-[var(--ctp-surface1)]"
            }`}
          >
            {clearing ? "Clearing…" : confirmClear ? "Confirm: delete everything" : "Clear all data"}
          </button>
          {confirmClear && (
            <button
              onClick={() => setConfirmClear(false)}
              className="text-xs text-[var(--ctp-overlay0)] hover:text-[var(--ctp-text)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--ctp-overlay0)] mt-2">
          Permanently deletes all sessions and visits from this browser. This cannot be undone.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--ctp-subtext1)] uppercase tracking-wide border-b border-[var(--ctp-surface0)] pb-2">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-9 h-5 rounded-full transition-colors ${
            checked ? "bg-[var(--ctp-lavender)]" : "bg-[var(--ctp-surface1)]"
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--ctp-base)] shadow transition-transform ${
              checked ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </div>
      </div>
      <div>
        <div className="text-sm text-[var(--ctp-text)]">{label}</div>
        <div className="text-xs text-[var(--ctp-overlay0)]">{description}</div>
      </div>
    </label>
  );
}
