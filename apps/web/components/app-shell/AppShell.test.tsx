import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { LANGUAGE_STORAGE_KEY, useLanguageStore } from "@/lib/i18n/language-store";
import { THEME_STORAGE_KEY, useThemeStore } from "@/lib/theme/theme-store";
import { AppShell } from "./AppShell";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("AppShell", () => {
  beforeEach(() => {
    mockPathname = "/";
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.lang = "en";
    useLanguageStore.setState({ hydrated: false, language: "en" });
    useThemeStore.setState({ hydrated: false, theme: "dark" });
  });

  test("renders the global shell navigation and page content", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Global" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Launcher" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Editor" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Render" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tokens" })).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  test("centers navigation and follows the current route", () => {
    mockPathname = "/editor";

    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const navigation = screen.getByRole("navigation", { name: "Global" });
    const editor = screen.getByRole("radio", { name: "Editor" });
    const launcher = screen.getByRole("radio", { name: "Launcher" });

    expect(navigation.className).toContain("left-1/2");
    expect(navigation.className).toContain("-translate-x-1/2");
    expect(editor).toHaveAttribute("aria-checked", "true");
    expect(editor.className).toContain("bg-(--bg-4)");
    expect(launcher).toHaveAttribute("aria-checked", "false");
    expect(launcher.className).toContain("text-(--text-2)");
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

  test("renders an icon-only theme toggle on the right side", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const controls = screen.getByTestId("shell-right-controls");
    const toggle = screen.getByRole("button", { name: "Toggle theme" });

    expect(controls.className).toContain("ml-auto");
    expect(toggle).toHaveTextContent("");
    expect(toggle.querySelector(".lucide-sun")).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(toggle.querySelector(".lucide-moon")).toBeInTheDocument();
  });

  test("renders a stable right-side language selector", () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const selector = screen.getByRole("radiogroup", { name: "Language" });
    const english = screen.getByRole("radio", { name: "EN" });
    const chinese = screen.getByRole("radio", { name: "中文" });

    expect(selector.className).toContain("grid-cols-2");
    expect(english).toHaveAttribute("aria-checked", "true");
    expect(chinese).toHaveAttribute("aria-checked", "false");

    fireEvent.click(chinese);

    expect(english).toHaveAttribute("aria-checked", "false");
    expect(chinese).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
    expect(document.documentElement.lang).toBe("zh");
    expect(chinese.className).toContain("bg-(--bg-4)");
  });

  test("hydrates global shell copy from the stored Chinese dictionary", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");

    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    expect(await screen.findByRole("navigation", { name: "全局" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "主要导航" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "启动器" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "编辑器" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "渲染" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "令牌" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "语言" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo", { name: "全局状态" })).toBeInTheDocument();
    expect(screen.getByText("命令")).toBeInTheDocument();
  });

  test("switches global shell copy when the language changes", async () => {
    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "中文" }));

    expect(await screen.findByRole("radio", { name: "启动器" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
    expect(screen.getByText("命令")).toBeInTheDocument();
  });

  test("marks technical shell metadata as language-neutral while localizing labels", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");

    render(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    expect(await screen.findByText("缓存 24/24 已预热")).toBeInTheDocument();

    const neutralMetadata = screen.getAllByTestId("shell-technical-metadata");

    expect(neutralMetadata).toHaveLength(2);
    expect(neutralMetadata.map((item) => item.textContent)).toEqual(["tokyo-essay/project.json", "v0.1.0-prototype"]);
    for (const item of neutralMetadata) {
      expect(item).toHaveAttribute("data-i18n-neutral", "true");
    }
  });

  test("renders the global status bar", () => {
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
    expect(screen.getByText("alignment cached")).toBeInTheDocument();
    expect(screen.getByText("cache 24/24 warm")).toBeInTheDocument();
    expect(screen.getByText("autosave · 02s ago")).toBeInTheDocument();
    expect(screen.getByText("tokyo-essay/project.json")).toBeInTheDocument();
    expect(screen.getByText("v0.1.0-prototype")).toBeInTheDocument();
  });

  test("allows screen-specific status content", () => {
    render(
      <AppShell statusContent={<span>render queued</span>}>
        <main>Page content</main>
      </AppShell>,
    );

    const center = screen.getByTestId("status-center");

    expect(center).toHaveTextContent("render queued");
    expect(screen.queryByText("alignment cached")).not.toBeInTheDocument();
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
