import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  test("renders the global shell navigation and page content", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Global" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Launcher" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Setup" })).toHaveAttribute("href", "/setup");
    expect(screen.getByRole("link", { name: "Editor" })).toHaveAttribute("href", "/editor");
    expect(screen.getByRole("link", { name: "Render" })).toHaveAttribute("href", "/render");
    expect(screen.getByText("Page content")).toBeInTheDocument();
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

  test("renders the left brand cluster with mark, product name, and phase label", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const brandCluster = screen.getByTestId("brand-cluster");
    const mark = screen.getByText("VC");
    const productName = screen.getByText("Video Creator");
    const phase = screen.getByText("phase 1 - local");

    expect(brandCluster.className).toContain("gap-(--space-3)");
    expect(mark.className).toContain("h-7");
    expect(mark.className).toContain("w-7");
    expect(mark.className).toContain("rounded-(--r-sm)");
    expect(productName.className).toContain("vc-type-body");
    expect(phase.className).toContain("vc-type-caption");
    expect(phase.className).toContain("text-(--text-3)");
  });

  test("keeps RootLayout server-rendered while delegating shell UI to AppShell", () => {
    const layoutSource = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");

    expect(layoutSource).toContain("import { AppShell }");
    expect(layoutSource).toContain("<AppShell>{children}</AppShell>");
    expect(layoutSource).not.toContain("from \"next/link\"");
  });
});
