import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/AppShell";
import { ThemeInitScript } from "@/components/app-shell/ThemeInitScript";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Video Creator",
  description: "Local-first AI-augmented video creator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeInitScript />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
