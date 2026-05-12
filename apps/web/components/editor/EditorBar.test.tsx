import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { EditorBar } from "./EditorBar";

function renderBar(overrides: Partial<ComponentProps<typeof EditorBar>> = {}) {
  const props: ComponentProps<typeof EditorBar> = {
    cacheLabel: "cache 2/3",
    onHome: vi.fn(),
    onRenderDraft: vi.fn(),
    onRenderFinal: vi.fn(),
    onSave: vi.fn(),
    projectId: "p_demo",
    projectName: "Demo",
    renderDisabled: false,
    renderJob: { phase: "", progress: 0, running: false, status: "idle" },
    saveStatus: "pending",
    saving: false,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditorBar {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("EditorBar", () => {
  it("shows home, project title, project id, cache, save, and render actions", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "Open Launcher" })).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("projectId: p_demo")).toBeInTheDocument();
    expect(screen.getByText("cache 2/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /render draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /render final/i })).toBeInTheDocument();
  });

  it("omits subtitles and background toolbar actions", () => {
    renderBar();

    expect(screen.queryByRole("button", { name: /subtitles/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change bg/i })).not.toBeInTheDocument();
  });

  it("disables render actions when config has no unrendered changes", () => {
    renderBar({ renderDisabled: true });

    expect(screen.getByRole("button", { name: /render draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /render final/i })).toBeDisabled();
  });

  it("calls home action from the home icon", () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Open Launcher" }));
    expect(props.onHome).toHaveBeenCalled();
  });
});
