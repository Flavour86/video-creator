import type { Metadata } from "next";
import Link from "next/link";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Video Creator",
  description: "Local-first AI-augmented video creator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-neutral-200 px-6 py-3">
          <div className="mx-auto flex max-w-5xl gap-4 text-sm font-medium">
            <Link href="/">Launcher</Link>
            <Link href="/setup">Setup</Link>
            <Link href="/editor">Editor</Link>
            <Link href="/render">Render</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
