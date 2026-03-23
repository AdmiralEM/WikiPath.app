import type { Metadata } from "next";
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
      <body className="min-h-screen bg-[var(--ctp-base)] text-[var(--ctp-text)]">
        {children}
      </body>
    </html>
  );
}
