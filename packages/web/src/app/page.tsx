// Dashboard home — server component (no "use client" needed here)

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">
        {/* Logo / Title */}
        <div>
          <h1 className="text-4xl font-bold text-[var(--ctp-lavender)] mb-2">WikiPath</h1>
          <p className="text-[var(--ctp-subtext1)] text-lg">
            Track your Wikipedia rabbit holes. Visualize them as mind maps.
          </p>
        </div>

        {/* Status card */}
        <div className="rounded-xl border border-[var(--ctp-surface1)] bg-[var(--ctp-mantle)] p-6 text-left space-y-4">
          <h2 className="text-xl font-semibold text-[var(--ctp-text)]">Dashboard</h2>
          <p className="text-[var(--ctp-subtext0)]">
            The WikiPath dashboard is under construction. Install the Chrome extension to start
            tracking your Wikipedia sessions.
          </p>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <StatCard label="Sessions" value="0" />
            <StatCard label="Articles Visited" value="0" />
            <StatCard label="Total Time" value="—" />
            <StatCard label="Unique Wikis" value="0" />
          </div>
        </div>

        {/* Nav links (placeholders) */}
        <nav className="flex gap-4 justify-center text-sm">
          <NavLink href="/history" label="History" />
          <NavLink href="/explore" label="Explore" />
          <NavLink href="/settings" label="Settings" />
        </nav>
      </div>
    </main>
  );
}

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg bg-[var(--ctp-surface0)] p-4">
      <p className="text-xs text-[var(--ctp-overlay1)] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[var(--ctp-lavender)]">{value}</p>
    </div>
  );
}

interface NavLinkProps {
  href: string;
  label: string;
}

function NavLink({ href, label }: NavLinkProps) {
  return (
    <a
      href={href}
      className="px-4 py-2 rounded-lg bg-[var(--ctp-surface0)] text-[var(--ctp-subtext1)] hover:bg-[var(--ctp-surface1)] hover:text-[var(--ctp-text)] transition-colors"
    >
      {label}
    </a>
  );
}
