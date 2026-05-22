import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import { dictionaries } from "@/lib/i18n/messages";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  historyEntries: [] as Array<Record<string, unknown>>,
  jobPhase: "verifying",
  push: vi.fn(),
  redirect: vi.fn((target: string): never => {
    throw new Error(`redirect:${target}`);
  }),
  replace: vi.fn(),
  startRender: vi.fn(),
  useRenderHistory: vi.fn(),
  useRenderJob: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({
    back: mocks.back,
    push: mocks.push,
    replace: mocks.replace,
  }),
}));

vi.mock("@/lib/render/useRenderHistory", () => ({
  useRenderHistory: (projectId: string, activeId: string) => {
    mocks.useRenderHistory(projectId, activeId);
    return {
      entries: mocks.historyEntries,
      purgeAll: vi.fn(),
      refresh: vi.fn(),
      remove: vi.fn(),
    };
  },
}));

vi.mock("@/lib/render/useRenderJob", () => ({
  useRenderJob: (projectId: string, jobId: string | null) => {
    mocks.useRenderJob(projectId, jobId);
    return {
      error: "",
      job: jobId ? renderJob(jobId, mocks.jobPhase) : null,
      startRender: mocks.startRender,
    };
  },
}));

vi.mock("@/lib/render/useSystemActions", () => ({
  useSystemOpen: () => vi.fn(),
  useSystemReveal: () => vi.fn(),
}));

vi.mock("@/lib/render/useRenderCancel", () => ({
  useRenderCancel: () => vi.fn(),
}));

vi.mock("@/lib/render/useFfmpegLog", () => ({
  useFfmpegLog: () => ({
    follow: vi.fn(),
    lines: [],
    pause: vi.fn(),
    paused: false,
  }),
}));

import RenderPage from "./page";
import RenderPathPage from "./[projectId]/[renderId]/page";
import { RenderPageClient } from "./RenderPageClient";

beforeEach(() => {
  mocks.back.mockReset();
  mocks.historyEntries = [];
  mocks.jobPhase = "verifying";
  mocks.push.mockReset();
  mocks.redirect.mockClear();
  mocks.replace.mockReset();
  mocks.startRender.mockReset();
  mocks.startRender.mockResolvedValue("r-started");
  mocks.useRenderHistory.mockReset();
  mocks.useRenderJob.mockReset();
});

function renderClient(projectId = "p_demo", renderId = "r-existing") {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en}>
      <RenderPageClient projectId={projectId} renderId={renderId} />
    </NextIntlClientProvider>,
  );
}

async function expectRedirect(promise: Promise<unknown>, target: string) {
  await expect(promise).rejects.toThrow(`redirect:${target}`);
  expect(mocks.redirect).toHaveBeenCalledWith(target);
}

it("redirects missing render route segments to Launcher", async () => {
  await expectRedirect(RenderPage({ searchParams: Promise.resolve({}) }), "/");
});

it("redirects legacy query-string render navigation to the dynamic route", async () => {
  await expectRedirect(
    RenderPage({ searchParams: Promise.resolve({ projectId: "p_demo", job: "r-started" }) }),
    "/render/p_demo/r-started",
  );
});

it("redirects invalid dynamic render route segments to Launcher", async () => {
  await expectRedirect(
    RenderPathPage({ params: Promise.resolve({ projectId: "E:/projects/demo", renderId: "r-existing" }) }),
    "/",
  );
  await expectRedirect(
    RenderPathPage({ params: Promise.resolve({ projectId: "p_demo", renderId: "not-a-render" }) }),
    "/",
  );
});

it("renders an existing render from the dynamic route params", () => {
  renderClient();

  expect(screen.getByText("Verifying alignment cache")).toBeInTheDocument();
  expect(mocks.useRenderJob).toHaveBeenCalledWith("p_demo", "r-existing");
  expect(mocks.useRenderHistory).toHaveBeenCalledWith("p_demo", "r-existing");
  expect(mocks.startRender).not.toHaveBeenCalled();
});

it("retries failed renders and replaces with the dynamic render route", async () => {
  mocks.jobPhase = "failed";
  renderClient("p_demo", "r-failed");

  fireEvent.click(screen.getByRole("button", { name: /retry render/i }));

  await waitFor(() => expect(mocks.startRender).toHaveBeenCalledWith("final"));
  expect(mocks.replace).toHaveBeenCalledWith("/render/p_demo/r-started");
});

function renderJob(id: string, phase: string) {
  return {
    artifacts: [],
    bytes: 0,
    capabilities: { reveal_in_explorer_supported: false },
    durationSec: null,
    etaSec: null,
    events: [],
    filename: "final.mp4",
    finishedAt: null,
    framesWritten: 0,
    id,
    manifest: {
      audioBitrate: 192000,
      audioCodec: "aac",
      colorMatrix: "bt.709",
      codec: "H.264",
      crf: 18,
      estimatedBytes: 100,
      fps: 30,
      height: 1080,
      pixfmt: "yuv420p",
      preset: "x264 slow",
      width: 1920,
    },
    outputExists: phase !== "failed",
    outputPath: "E:/projects/demo/renders/final.mp4",
    phase,
    preset: "final",
    progress: phase === "failed" ? 0 : 1,
    resolution: "1920x1080",
    speed: null,
    startedAt: "2026-05-09T00:00:00Z",
    status: phase === "failed" ? "failed" : "running",
  };
}
