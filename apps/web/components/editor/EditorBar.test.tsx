import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { EditorBar } from "./EditorBar";

function renderBar(overrides: Partial<ComponentProps<typeof EditorBar>> = {}) {
  const props: ComponentProps<typeof EditorBar> = {
    onHome: vi.fn(),
    onRenderDraft: vi.fn(),
    onRenderFinal: vi.fn(),
    onSave: vi.fn(),
    projectId: "p_demo",
    projectName: "Demo",
    renderDraftDisabled: false,
    renderFinalDisabled: false,
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
  it("shows launcher, project title, save, and render actions", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "Open Launcher" })).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save project config/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /render draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /render final/i })).toBeInTheDocument();
  });

  it("omits subtitles and background toolbar actions", () => {
    renderBar();

    expect(screen.queryByRole("button", { name: /subtitles/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change bg/i })).not.toBeInTheDocument();
  });

  it("shows Pending save label when unsaved edits exist", () => {
    renderBar({ saveStatus: "pending" });
    expect(screen.getByRole("button", { name: /save project config \(pending\)/i })).toHaveTextContent("Pending");
  });

  it("disables render actions when config has no unrendered changes", () => {
    renderBar({ renderDraftDisabled: true, renderFinalDisabled: true });

    expect(screen.getByRole("button", { name: /render draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /render final/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /render draft \(disabled\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /render final \(disabled\)/i })).toBeInTheDocument();
  });

  it("renders draft progress with integer percentage only", () => {
    renderBar({
      renderJob: { phase: "compose", progress: 32.97451065147766, running: true, status: "running" },
    });
    expect(screen.getByRole("button", { name: /render draft \(queued\/running\)/i })).toHaveTextContent("Drafting · 32%");
  });

  it("calls home action from the home icon", () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Open Launcher" }));
    expect(props.onHome).toHaveBeenCalled();
  });
});
