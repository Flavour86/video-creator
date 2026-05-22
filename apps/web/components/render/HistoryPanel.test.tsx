import { fireEvent, render, screen, within } from "@testing-library/react";
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

function renderPanel({
  activeId = null,
  entries = [DONE_ENTRY],
  onDelete = vi.fn(),
  revealEnabled,
}: {
  activeId?: string | null;
  entries?: RenderHistoryEntry[];
  onDelete?: (id: string) => void;
  revealEnabled: boolean;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en}>
      <HistoryPanel
        activeId={activeId}
        entries={entries}
        onDelete={onDelete}
        onPurge={vi.fn()}
        onReveal={vi.fn()}
        onSelect={vi.fn()}
        revealEnabled={revealEnabled}
      />
    </NextIntlClientProvider>,
  );
}

it("hides reveal action when reveal capability is unsupported", () => {
  renderPanel({ revealEnabled: false });
  expect(screen.queryByRole("button", { name: /reveal/i })).not.toBeInTheDocument();
});

it("shows reveal action when reveal capability is supported", () => {
  renderPanel({ revealEnabled: true });
  expect(screen.getByRole("button", { name: /reveal/i })).toBeInTheDocument();
});

it("shows the empty history state", () => {
  renderPanel({ entries: [], revealEnabled: true });
  expect(screen.getByText("No renders yet.")).toBeInTheDocument();
});

it("shows filename, resolution, duration, status, and size for done rows", () => {
  renderPanel({ revealEnabled: true });
  expect(screen.getByText("final-1.mp4")).toBeInTheDocument();
  expect(screen.getByText(/1080p.*0:03.*done.*2.0 KB/)).toBeInTheDocument();
});

it.each<Array<[string, Partial<RenderHistoryEntry>, RegExp]>>([
  ["missing.mp4", { outputExists: false, status: "done" }, /1080p.*missing output/],
  ["partial.mp4", { status: "partial_excluded" }, /1080p.*partial output excluded.*excluded/],
  ["failed.mp4", { status: "failed" }, /1080p.*failed.*excluded/],
  ["warning.mp4", { status: "ffmpeg_warning" }, /1080p.*ffmpeg warning.*excluded/],
  ["fatal.mp4", { status: "ffmpeg_fatal_error" }, /1080p.*ffmpeg fatal error.*excluded/],
])("shows %s state in history", (filename, overrides, expected) => {
  renderPanel({ entries: [entry({ filename, ...overrides })], revealEnabled: true });
  expect(screen.getByText(expected)).toBeInTheDocument();
});

it("confirms history deletion", () => {
  const onDelete = vi.fn();
  renderPanel({ entries: [entry({ outputExists: false, status: "done" })], onDelete, revealEnabled: true });

  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

  expect(onDelete).toHaveBeenCalledWith("r-1");
});

function entry(overrides: Partial<RenderHistoryEntry> = {}): RenderHistoryEntry {
  return {
    ...DONE_ENTRY,
    ...overrides,
  };
}
