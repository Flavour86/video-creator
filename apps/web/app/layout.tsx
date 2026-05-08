import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/AppShell";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Video Creator",
  description: "Local-first AI-augmented video creator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
