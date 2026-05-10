import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useLanguageStore } from "@/lib/i18n/language-store";
import { useThemeStore } from "@/lib/theme/theme-store";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/editor",
}));

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.lang = "en";
    useLanguageStore.setState({ hydrated: false, language: "en" });
    useThemeStore.setState({ hydrated: false, theme: "dark" });
  });

  test("renders product shell chrome without product-visible global navigation", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByTestId("brand-cluster")).toHaveTextContent("VCVideo Creator");
    expect(screen.queryByText("phase 1 路 local")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Launcher" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Editor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Render" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Tokens" })).not.toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  test("hides persistent theme and language controls from normal product chrome", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    expect(screen.queryByRole("button", { name: "Toggle theme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Language" })).not.toBeInTheDocument();
  });

  test("renders a compact full-width tokenized header surface", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const header = screen.getByRole("banner");

    expect(header.className).toContain("h-11");
    expect(header.className).toContain("w-full");
    expect(header.className).toContain("bg-(--bg-1)");
    expect(header.className).toContain("border-(--line)");
    expect(header.className).not.toMatch(/rounded|shadow/);
  });

  test("keeps only the command pill and version badge in the bottom shell", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const statusBar = screen.getByRole("contentinfo", { name: "Global status" });

    expect(statusBar.parentElement?.className).toContain("pb-(--space-10)");
    expect(statusBar.className).toContain("fixed");
    expect(statusBar.className).toContain("bottom-0");
    expect(statusBar.className).toContain("h-(--space-10)");
    expect(screen.getByText("⌘K")).toBeInTheDocument();
    expect(screen.getByText("command")).toBeInTheDocument();
    expect(screen.getByText("command").parentElement).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("command").parentElement?.className).toContain("focus-visible:outline");
    expect(screen.getByText("v0.1.0-prototype")).toBeInTheDocument();
    expect(screen.queryByTestId("status-center")).not.toBeInTheDocument();
    expect(screen.queryByText("sidecar 127.0.0.1:8787")).not.toBeInTheDocument();
    expect(screen.queryByText("ffmpeg 6.1.1")).not.toBeInTheDocument();
    expect(screen.queryByText("tokyo-essay/project.json")).not.toBeInTheDocument();
  });

  test("keeps RootLayout server-rendered while delegating shell UI to AppShell", () => {
    const layoutSource = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");

    expect(layoutSource).toContain("import { AppShell }");
    expect(layoutSource).toContain("import { ThemeInitScript }");
    expect(layoutSource.indexOf("<ThemeInitScript />")).toBeLessThan(layoutSource.indexOf("<AppShell>{children}</AppShell>"));
    expect(layoutSource).toContain("<AppShell>{children}</AppShell>");
    expect(layoutSource).not.toContain("from \"next/link\"");
  });
});
