import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "WikiPath",
    template: "%s — WikiPath",
  },
  description:
    "Track your Wikipedia browsing sessions and visualize them as interactive mind maps.",
  keywords: ["wikipedia", "mind map", "browsing", "knowledge graph", "session tracker"],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--ctp-base)] text-[var(--ctp-text)] flex flex-col">
        <header className="border-b border-[var(--ctp-surface0)] bg-[var(--ctp-mantle)]">
          <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-6">
            <Link
              href="/"
              className="text-[var(--ctp-lavender)] font-bold text-base tracking-tight hover:text-[var(--ctp-blue)] transition-colors"
            >
              WikiPath
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/explore">Explore</NavLink>
              <NavLink href="/history">History</NavLink>
              <NavLink href="/settings">Settings</NavLink>
            </nav>
          </div>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-[var(--ctp-subtext1)] hover:text-[var(--ctp-text)] hover:bg-[var(--ctp-surface0)] transition-colors"
    >
      {children}
    </Link>
  );
}
