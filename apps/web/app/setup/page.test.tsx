import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import SetupPage from "./page";

const mocks = vi.hoisted(() => ({
  pathParam: "E:\\video-projects\\tokyo-essay" as string | null,
  projectIdParam: "p_tokyo",
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
  mocks.pathParam = "E:\\video-projects\\tokyo-essay";
  mocks.projectIdParam = "p_tokyo";
  mocks.push.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      path: "E:\\video-projects\\tokyo-essay",
      name: "Tokyo Essay",
      voice: { path: "voice.wav", duration: 942, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" },
      transcript: { path: "transcript.txt", sentence_count: 164, state: "parsed" },
      subtitle_generation: {
        status: "ready",
        cue_count: 0,
        total_duration_s: 0,
        cache_state: "unknown",
        error_message: null,
      },
      alignment: {
        status: "pending",
        hash: "8a3f2c1df91c",
        device: "cuda · fp16",
        model: "large-v3",
        audio_duration: 942,
        cache_hit: false,
      },
    }),
  });
});

it("shows the four-step setup layout and project-id inspect", async () => {
  renderSetup();

  expect(screen.getByRole("heading", { name: "SetUp" })).toBeInTheDocument();
  expect(screen.getAllByText("Project Name").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Voice").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Subtitle").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Alignment").length).toBeGreaterThan(0);
  expect(screen.getByRole("radio", { name: "720p" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "1080p" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "9:16" })).toBeInTheDocument();
  expect(screen.getByText("watermark.png")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate subtitle" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/projects/p_tokyo/inspect",
      expect.objectContaining({ method: "POST" }),
    ),
  );
});

it("keeps Setup cancel local and does not persist partial state", async () => {
  renderSetup();

  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Local Draft" } });
  fireEvent.click(screen.getByRole("radio", { name: "9:16" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(mocks.push).toHaveBeenCalledWith("/");
  expect(
    (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).includes("/setup/drafts")),
  ).toBe(false);
});

it("routes Create project only with a canonical project id", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      path: "E:\\video-projects\\tokyo-essay",
      name: "Tokyo Essay",
      voice: { path: "voice.wav", duration: 942, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" },
      transcript: { path: "transcript.txt", sentence_count: 164, state: "parsed" },
      subtitle_generation: {
        status: "succeeded",
        cue_count: 164,
        total_duration_s: 942,
        cache_state: "miss",
        error_message: null,
      },
      alignment: {
        status: "aligned",
        hash: "8a3f2c1df91c",
        device: "cuda 路 fp16",
        model: "large-v3",
        audio_duration: 942,
        cache_hit: false,
      },
    }),
  });

  renderSetup();

  await waitFor(() => expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/editor/p_tokyo"));
});

it("shows a recoverable message when final setup creation fails", async () => {
  mocks.pathParam = null;
  mocks.projectIdParam = "";
  let setupDraftCalls = 0;
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/setup/drafts")) {
      setupDraftCalls += 1;
      if (setupDraftCalls > 1) {
        return {
          ok: true,
          json: async () => ({
            setup_id: "setup_refill",
            draft: {
              project_id: null,
              path: "E:\\video-projects\\untitled-project",
              name: "",
              output_preset: "final",
              voice: null,
              transcript: null,
              subtitle_generation: {
                status: "ready",
                cue_count: 0,
                total_duration_s: 0,
                cache_state: "unknown",
                error_message: null,
              },
              alignment: {
                status: "pending",
                hash: "",
                device: "cuda fp16",
                model: "large-v3",
                audio_duration: 0,
                cache_hit: false,
              },
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          setup_id: "setup_abc123",
          draft: {
            project_id: null,
            path: "E:\\video-projects\\tokyo-essay",
            name: "Tokyo Essay",
            output_preset: "final",
            voice: {
              path: "voice.wav",
              duration: 12,
              sample_rate: 48000,
              channels: 2,
              codec: "pcm_s16le",
              state: "copied",
            },
            transcript: { path: "transcript.txt", sentence_count: 3, state: "parsed" },
            subtitle_generation: {
              status: "succeeded",
              cue_count: 3,
              total_duration_s: 12,
              cache_state: "miss",
              error_message: null,
            },
            alignment: {
              status: "aligned",
              hash: "abc123",
              device: "cuda fp16",
              model: "large-v3",
              audio_duration: 12,
              cache_hit: false,
            },
          },
        }),
      } as Response;
    }
    if (url.endsWith("/projects") && init?.method === "POST") {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: "NOT_EMPTY",
            message: "Project directory already exists and is not empty.",
          },
        }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });

  renderSetup();

  await waitFor(() => expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Project directory already exists and is not empty.",
    ),
  );
  await waitFor(() => expect(setupDraftCalls).toBeGreaterThan(1));
  expect(mocks.push).not.toHaveBeenCalled();
});

it("generates subtitles before enabling alignment", async () => {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/projects/p_tokyo/inspect")) {
      return {
        ok: true,
        json: async () => ({
          path: "E:\\video-projects\\tokyo-essay",
          name: "Tokyo Essay",
          voice: { path: "voice.wav", duration: 942, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" },
          transcript: { path: "transcript.txt", sentence_count: 164, state: "parsed" },
          subtitle_generation: {
            status: "ready",
            cue_count: 0,
            total_duration_s: 0,
            cache_state: "unknown",
            error_message: null,
          },
          alignment: {
            status: "pending",
            hash: "8a3f2c1df91c",
            device: "cuda 路 fp16",
            model: "large-v3",
            audio_duration: 942,
            cache_hit: false,
          },
        }),
      } as Response;
    }
    if (url.endsWith("/subtitle") && init?.method === "POST") {
      return {
        ok: true,
        json: async () => ({
          status: "succeeded",
          cue_count: 164,
          total_duration_s: 942,
          cache_state: "miss",
          error_message: null,
        }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });

  renderSetup();

  await waitFor(() => expect(screen.getByRole("button", { name: "Generate subtitle" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Generate subtitle" }));

  await waitFor(() => expect(screen.getByText(/164 cues/)).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeEnabled();
  expect(global.fetch).toHaveBeenCalledWith(
    "/api/server/subtitle",
    expect.objectContaining({
      body: JSON.stringify({ project_id: "p_tokyo" }),
      method: "POST",
    }),
  );
});

it("keeps alignment disabled when subtitle generation fails", async () => {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/projects/p_tokyo/inspect")) {
      return {
        ok: true,
        json: async () => ({
          path: "E:\\video-projects\\tokyo-essay",
          name: "Tokyo Essay",
          voice: { path: "voice.wav", duration: 942, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" },
          transcript: { path: "transcript.txt", sentence_count: 164, state: "parsed" },
          subtitle_generation: {
            status: "ready",
            cue_count: 0,
            total_duration_s: 0,
            cache_state: "unknown",
            error_message: null,
          },
          alignment: {
            status: "pending",
            hash: "8a3f2c1df91c",
            device: "cuda 路 fp16",
            model: "large-v3",
            audio_duration: 942,
            cache_hit: false,
          },
        }),
      } as Response;
    }
    if (url.endsWith("/subtitle") && init?.method === "POST") {
      return {
        ok: false,
        json: async () => ({ error: { code: "SUBTITLE_GENERATION_FAILED" } }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });

  renderSetup();

  await waitFor(() => expect(screen.getByRole("button", { name: "Generate subtitle" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Generate subtitle" }));

  await waitFor(() => expect(screen.getByText("failed")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeDisabled();
});

it("keeps subtitle and alignment disabled when voice is invalid", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      path: "E:\\video-projects\\tokyo-essay",
      name: "Tokyo Essay",
      voice: { path: "voice.wav", duration: 0, sample_rate: 0, channels: 0, codec: "unknown", state: "invalid" },
      transcript: { path: "transcript.txt", sentence_count: 164, state: "parsed" },
      subtitle_generation: {
        status: "ready",
        cue_count: 0,
        total_duration_s: 0,
        cache_state: "unknown",
        error_message: null,
      },
      alignment: {
        status: "pending",
        hash: "",
        device: "cuda fp16",
        model: "large-v3",
        audio_duration: 0,
        cache_hit: false,
      },
    }),
  });

  renderSetup();
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate subtitle" })).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Generate subtitle" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeDisabled();
});

it("does not start alignment when transcript is empty", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      path: "E:\\video-projects\\tokyo-essay",
      name: "Tokyo Essay",
      voice: { path: "voice.wav", duration: 942, sample_rate: 48000, channels: 2, codec: "pcm_s16le", state: "copied" },
      transcript: { path: "transcript.txt", sentence_count: 0, state: "empty" },
      subtitle_generation: {
        status: "succeeded",
        cue_count: 164,
        total_duration_s: 942,
        cache_state: "miss",
        error_message: null,
      },
      alignment: {
        status: "pending",
        hash: "8a3f2c1df91c",
        device: "cuda fp16",
        model: "large-v3",
        audio_duration: 942,
        cache_hit: false,
      },
    }),
  });

  renderSetup();
  await waitFor(() => expect(screen.getByRole("button", { name: "Run alignment API" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Run alignment API" }));
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
