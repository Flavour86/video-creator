import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SetupDraft, SetupSubtitleGenerationResult } from "@vc/shared-schemas";
import { beforeEach, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import SetupPage from "./page";

const mocks = vi.hoisted(() => ({
  pathParam: null as string | null,
  projectIdParam: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "path") return mocks.pathParam;
      if (key === "projectId") return mocks.projectIdParam;
      return null;
    },
  }),
}));

function renderSetup() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SetupPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.pathParam = null;
  mocks.projectIdParam = "";
  mocks.push.mockReset();
  global.fetch = vi.fn();
});

it("starts with an empty form and hides post-subtitle panels", async () => {
  mockSetupDraft(draft());

  renderSetup();

  expect(await screen.findByRole("textbox", { name: "Project name" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Output preset" })).toHaveValue("final");
  expect(screen.getByText("Voice for video")).toBeInTheDocument();
  expect(screen.queryByText("subtitle.srt")).not.toBeInTheDocument();
  expect(screen.queryByText("Subtitle Alignment")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Run alignment API" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate subtitle" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
});

it("shows voice selected state without revealing subtitle or alignment panels", async () => {
  mockSetupDraft(draft({
    name: "Ss",
    voice: voice(),
    subtitle_generation: subtitle("ready"),
  }));

  renderSetup();

  expect(await screen.findByText("voice.mp3")).toBeInTheDocument();
  expect(screen.getByText("selected")).toBeInTheDocument();
  expect(screen.queryByText("subtitle.srt")).not.toBeInTheDocument();
  expect(screen.queryByText("Subtitle Alignment")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate subtitle" })).toBeEnabled();
});

it("keeps alignment hidden when subtitle generation fails", async () => {
  mockSetupDraft(draft({
    name: "Ss",
    voice: voice(),
    subtitle_generation: subtitle("failed", { error_message: "generator timeout." }),
  }));

  renderSetup();

  expect(await screen.findByText("failed")).toBeInTheDocument();
  expect(screen.getByText("subtitle.srt generation failed: generator timeout.")).toBeInTheDocument();
  expect(screen.queryByText("subtitle.srt")).not.toBeInTheDocument();
  expect(screen.queryByText("Subtitle Alignment")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Run alignment API" })).not.toBeInTheDocument();
});

it("reveals subtitle and alignment sections only after subtitle generation succeeds", async () => {
  mockSetupDraft(draft({
    name: "Ss",
    voice: voice(),
    subtitle_generation: subtitle("succeeded"),
  }));

  renderSetup();

  expect(await screen.findByText("subtitle.srt")).toBeInTheDocument();
  expect(screen.getByText("21 subtitles / 15:42")).toBeInTheDocument();
  expect(screen.getByText("Subtitle Alignment")).toBeInTheDocument();
  expect(screen.getByText("transcript for alignment")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
});

it("enables alignment after transcript selection", async () => {
  mockSetupDraft(draft({
    name: "Ss",
    voice: voice(),
    transcript: transcript(),
    subtitle_generation: subtitle("succeeded"),
  }));

  renderSetup();

  expect(await screen.findByText("transcript.txt")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
});

it("enables Create project after alignment succeeds and routes to the editor", async () => {
  mockSetupDraft(
    draft({
      alignment: alignment("aligned"),
      name: "Ss",
      subtitle_generation: subtitle("succeeded"),
      transcript: transcript(),
      voice: voice(),
    }),
    { createProjectId: "p_ss" },
  );

  renderSetup();

  await waitFor(() => expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/editor/p_ss"));
});

it("calls project inspect when setup is opened for an existing project", async () => {
  mocks.projectIdParam = "p_tokyo";
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/projects/p_tokyo/inspect")) {
      return okJson({
        path: "E:\\video-projects\\tokyo-essay",
        name: "Tokyo Essay",
        voice: voice({ path: "voice.wav" }),
        transcript: transcript(),
        subtitle_generation: subtitle("succeeded"),
        alignment: alignment("aligned"),
      });
    }
    return okJson({});
  });

  renderSetup();

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/projects/p_tokyo/inspect",
      expect.objectContaining({ method: "POST" }),
    ),
  );
});

function mockSetupDraft(initialDraft: SetupDraft, options: { createProjectId?: string } = {}) {
  let currentDraft = initialDraft;
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/setup/drafts") && method === "POST") {
      return okJson({ setup_id: "setup_test", draft: currentDraft });
    }
    if (url.endsWith("/setup/drafts/setup_test") && method === "PATCH") {
      currentDraft = {
        ...currentDraft,
        ...(JSON.parse(String(init?.body ?? "{}")) as Partial<SetupDraft>),
      };
      return okJson({ setup_id: "setup_test", draft: currentDraft });
    }
    if (url.endsWith("/projects") && method === "POST") {
      return okJson({ project_id: options.createProjectId ?? "p_created" });
    }
    return okJson({ setup_id: "setup_test", draft: currentDraft });
  });
}

function okJson(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function draft(values: Partial<SetupDraft> = {}): SetupDraft {
  return {
    alignment: alignment("pending"),
    name: "",
    output_preset: "final",
    path: "E:\\video-projects\\untitled-project",
    subtitle_generation: subtitle("ready"),
    transcript: null,
    voice: null,
    ...values,
  };
}

function voice(values: Partial<NonNullable<SetupDraft["voice"]>> = {}): NonNullable<SetupDraft["voice"]> {
  return {
    channels: 2,
    codec: "mpeg layer iii",
    duration: 942,
    path: "voice.mp3",
    sample_rate: 44100,
    state: "copied",
    ...values,
  };
}

function transcript(values: Partial<NonNullable<SetupDraft["transcript"]>> = {}): NonNullable<SetupDraft["transcript"]> {
  return {
    path: "transcript.txt",
    sentence_count: 21,
    state: "parsed",
    ...values,
  };
}

function subtitle(
  status: SetupSubtitleGenerationResult["status"],
  values: Partial<SetupSubtitleGenerationResult> = {},
): SetupSubtitleGenerationResult {
  return {
    cache_state: status === "succeeded" ? "miss" : "unknown",
    cue_count: status === "succeeded" ? 21 : 0,
    error_message: null,
    status,
    total_duration_s: status === "succeeded" ? 942 : 0,
    ...values,
  };
}

function alignment(status: SetupDraft["alignment"]["status"]): SetupDraft["alignment"] {
  return {
    audio_duration: 942,
    cache_hit: status === "aligned",
    device: "cuda fp16",
    hash: "abc123",
    model: "large-v3",
    status,
  };
}
