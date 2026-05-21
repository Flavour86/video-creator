import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import { dictionaries } from "@/lib/i18n/messages";
import type { RenderHistoryEntry } from "@/lib/render/types";
import { HistoryPanel } from "./HistoryPanel";

const DONE_ENTRY: RenderHistoryEntry = {
  artifacts: [],
  bytes: 2048,
  capabilities: { reveal_in_explorer_supported: true },
  durationSec: 2.5,
  events: [],
  filename: "final-1.mp4",
  finishedAt: "2026-05-09T00:00:02Z",
  id: "r-1",
  outputExists: true,
  outputPath: "E:/project/renders/final-1.mp4",
  preset: "final",
  resolution: "1920x1080",
  status: "done",
};

function renderPanel(revealEnabled: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en}>
      <HistoryPanel
        activeId={null}
        entries={[DONE_ENTRY]}
        onDelete={vi.fn()}
        onPurge={vi.fn()}
        onReveal={vi.fn()}
        onSelect={vi.fn()}
        revealEnabled={revealEnabled}
      />
    </NextIntlClientProvider>,
  );
}

it("hides reveal action when reveal capability is unsupported", () => {
  renderPanel(false);
  expect(screen.queryByRole("button", { name: /reveal/i })).not.toBeInTheDocument();
});

it("shows reveal action when reveal capability is supported", () => {
  renderPanel(true);
  expect(screen.getByRole("button", { name: /reveal/i })).toBeInTheDocument();
});
