import { render, screen, waitFor } from "@testing-library/react";
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

it("shows the prototype setup title, optional watermark slot, and project-id inspect", async () => {
  renderSetup();

  expect(screen.getByRole("heading", { name: "Detect inputs and align" })).toBeInTheDocument();
  expect(screen.getByText("watermark.png")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run alignment API" })).toBeInTheDocument();
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/server/projects/p_tokyo/inspect",
      expect.objectContaining({ method: "POST" }),
    ),
  );
});
