import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, expect, it, vi } from "vitest";

// Mock all heavy child components
vi.mock("@/components/preview-player/PreviewPlayer", () => ({
  PreviewPlayer: () => <div data-testid="preview-player" />,
}));
vi.mock("@/components/preview-player/Waveform", () => ({
  Waveform: () => <div data-testid="waveform" />,
}));
vi.mock("@/components/timeline/Timeline", () => ({
  Timeline: () => <div data-testid="timeline" />,
}));
vi.mock("@/components/transcript-panel/TranscriptPanel", () => ({
  TranscriptPanel: () => <div data-testid="transcript-panel" />,
}));
vi.mock("@/components/bg-modal/BgModal", () => ({
  BgModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable so individual tests can override the "project" param value
let _projectParam: string | null = null;

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k: string) => (k === "project" ? _projectParam : null) }),
}));

beforeEach(() => {
  _projectParam = null;
  global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
});

// EditorPage wraps EditorContent in Suspense internally
import EditorPage from "./page";

it("shows no-project message when project param is absent", () => {
  render(
    <Suspense fallback={null}>
      <EditorPage />
    </Suspense>,
  );
  expect(screen.getByText(/No project open/i)).toBeInTheDocument();
});

it("shows project path in toolbar when project param is present", () => {
  _projectParam = "E:/projects/demo";
  render(
    <Suspense fallback={null}>
      <EditorPage />
    </Suspense>,
  );
  expect(screen.getByText("E:/projects/demo")).toBeInTheDocument();
});
