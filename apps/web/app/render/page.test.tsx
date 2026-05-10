import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import { dictionaries } from "@/lib/i18n/messages";

const mocks = vi.hoisted(() => ({
  projectParam: null as string | null,
  jobParam: null as string | null,
  replace: vi.fn(),
  push: vi.fn(),
  startRender: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "project") return mocks.projectParam;
      if (key === "job" || key === "renderId") return mocks.jobParam;
      return null;
    },
  }),
}));

vi.mock("@/lib/render/useRenderHistory", () => ({
  useRenderHistory: () => ({
    entries: [],
    purgeAll: vi.fn(),
    refresh: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@/lib/render/useRenderJob", () => ({
  useRenderJob: () => ({
    error: "",
    job: mocks.jobParam
      ? {
          bytes: 0,
          durationSec: null,
          etaSec: null,
          filename: "final.mp4",
          finishedAt: null,
          framesWritten: 0,
          id: mocks.jobParam,
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
          outputPath: "E:/projects/demo/renders/final.mp4",
          outputExists: true,
          phase: "verifying",
          preset: "final",
          progress: 1,
          speed: null,
          startedAt: "2026-05-09T00:00:00Z",
          status: "running",
        }
      : null,
    startRender: mocks.startRender,
  }),
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

beforeEach(() => {
  mocks.projectParam = null;
  mocks.jobParam = null;
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.startRender.mockReset();
  mocks.startRender.mockResolvedValue("r-started");
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={dictionaries.en}>
      <RenderPage />
    </NextIntlClientProvider>,
  );
}

it("shows no-project message when project param is absent", () => {
  renderPage();

  expect(screen.getByText(/No project open/i)).toBeInTheDocument();
  expect(mocks.startRender).not.toHaveBeenCalled();
});

it("auto-starts a final render for a project route", async () => {
  mocks.projectParam = "E:/projects/demo";
  renderPage();

  expect(screen.getByText("No render in progress")).toBeInTheDocument();
  await waitFor(() => expect(mocks.startRender).toHaveBeenCalledWith("final"));
  expect(mocks.replace).toHaveBeenCalledWith("/render?project=E%3A%2Fprojects%2Fdemo&job=r-started");
});

it("does not auto-start when viewing an existing render", () => {
  mocks.projectParam = "E:/projects/demo";
  mocks.jobParam = "r-existing";
  renderPage();

  expect(screen.getByText("Verifying alignment cache")).toBeInTheDocument();
  expect(mocks.startRender).not.toHaveBeenCalled();
});
