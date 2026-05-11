import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";

// Mutable so individual tests can override the "projectId" param value
let _projectIdParam: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === "projectId" ? _projectIdParam : null) }),
}));

beforeEach(() => {
  _projectIdParam = null;
  global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
  Element.prototype.scrollIntoView = vi.fn();
});

// EditorPage wraps EditorContent in Suspense internally
import EditorPage from "./page";

function renderEditor() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Suspense fallback={null}>
        <EditorPage />
      </Suspense>
    </NextIntlClientProvider>,
  );
}

it("shows no-project message when project id param is absent", () => {
  renderEditor();
  expect(screen.getByText(/No project open/i)).toBeInTheDocument();
});

it("shows launcher recovery when project id param is malformed", () => {
  _projectIdParam = "E:/projects/demo";
  renderEditor();
  expect(screen.getByText(/No project open/i)).toBeInTheDocument();
});

it("shows project id in toolbar when project id param is present", () => {
  _projectIdParam = "p_demo";
  renderEditor();
  expect(screen.getByText("p_demo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /render draft/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /render final/i })).toBeInTheDocument();
});

const TEST_PROJECT_ID = "p_test01";

const TEST_ALIGNMENT = {
  sentences: [
    { index: 1, text: "Capitalism begins here.", start_s: 0, end_s: 5, confidence_avg: 0.95 },
    { index: 2, text: "A product demo uses PiP.", start_s: 5, end_s: 10, confidence_avg: 0.92 },
    { index: 3, text: "Capitalism changes incentives.", start_s: 10, end_s: 15, confidence_avg: 0.93 },
    { index: 4, text: "The foreground returns.", start_s: 15, end_s: 20, confidence_avg: 0.91 },
    { index: 5, text: "Assign a new asset here.", start_s: 20, end_s: 25, confidence_avg: 0.9 },
  ],
  words: [],
  cache_hit: true,
};

const TEST_PROJECT = {
  version: 1,
  name: "test01",
  audio: "voice.mp3",
  transcript: { kind: "plain_text", path: "transcript.txt" },
  output: { preset: "final" },
  layers: [
    { id: "subtitles", kind: "sub", name: "Subtitles", items: [{ id: "sub-auto", auto: true, label: "Auto subtitles", style: "default" }] },
    {
      id: "pip-z3",
      kind: "pip",
      name: "PiP z3",
      items: [{
        id: "pip-1",
        mediaId: "PIP.png",
        sentences: [2, 2],
        start: 5,
        end: 10,
        motion: { kind: "none", easing: "ease_in_out" },
        transitions: { in: "fade", out: "cut" },
        pip: { posX: 68, posY: 14, size: 30, radius: 12, opacity: 100 },
      }],
    },
    {
      id: "fg-z1",
      kind: "fg",
      name: "Foreground z1",
      items: [{
        id: "fg-1",
        mediaId: "foreground.png",
        sentences: [1, 1],
        start: 0,
        end: 5,
        motion: { kind: "none", easing: "ease_in_out" },
        transitions: { in: "fade", out: "cut" },
      }],
    },
    {
      id: "bg-main",
      kind: "bg",
      name: "Background",
      items: [{
        id: "bg-1",
        mediaId: "bg0.png",
        sentences: [1, 1],
        start: 0,
        end: 30,
        motion: { kind: "ken_burns", easing: "ease_in_out" },
        transitions: { in: "cut", out: "cut" },
        crossfade: 0.6,
      }],
    },
  ],
  subtitles: null,
  watermark: null,
};

const TEST_MEDIA = ["PIP.png", "bg0.png", "bg1.png", "bg2.png", "foreground.png"].map((filename) => ({
  filename,
  kind: "image",
  size: 123456,
  thumb_url: `/projects/thumb?project=test01&filename=${filename.replace(/\.[^.]+$/, ".jpg")}`,
}));

function mockTest01Fetch(options: { hasUnrenderedChanges?: boolean } = {}) {
  const hasUnrenderedChanges = options.hasUnrenderedChanges ?? false;
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/alignment`)) return ok(TEST_ALIGNMENT);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT") return ok({ project_id: TEST_PROJECT_ID, config_hash: "h2", saved_at: "2026-05-11T00:00:00Z", has_unrendered_changes: true });
    if (url.includes(`/projects/${TEST_PROJECT_ID}/config`)) return ok({ project_id: TEST_PROJECT_ID, config: TEST_PROJECT, config_hash: "h1", has_unrendered_changes: hasUnrenderedChanges });
    if (url.includes(`/projects/${TEST_PROJECT_ID}/media`)) return ok(TEST_MEDIA);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/renders/r-test01/cancel`)) return ok({ ok: true });
    if (url.includes(`/projects/${TEST_PROJECT_ID}/render`)) return ok({ render_id: "r-test01", output_path: "renders/r-test01.mp4" });
    return { ok: false, json: async () => ({}) } as Response;
  });
}

function ok(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

it("renders the test01 editor from project, alignment, and media data", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByText(TEST_PROJECT_ID)).toBeInTheDocument();
  expect(screen.getByText("cache 3/3")).toBeInTheDocument();
  expect(screen.getByText(/Transcript/i)).toHaveTextContent("5");
  expect(screen.getByText("Subtitles · 1")).toBeInTheDocument();
  expect(screen.getAllByText("PiP · z3").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole("button", { name: "PIP.png over s2" })).toBeInTheDocument();
  expect(screen.getByText("Background · 1 strip")).toBeInTheDocument();
  expect(screen.getByText("posX 68 · posY 14 · size 30 · radius 12 · opacity 100")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "bg0.png over s1" }));
  expect(screen.getByText("Crossfade 0.6s")).toBeInTheDocument();
});

it("highlights search matches, scrolls to the first match, and advances with Enter", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  const search = await screen.findByRole("searchbox", { name: /search transcript/i });
  fireEvent.change(search, { target: { value: "capitalism" } });

  await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  expect(screen.getAllByText("Capitalism", { selector: "mark" })).toHaveLength(2);

  fireEvent.keyDown(search, { key: "Enter" });
  await waitFor(() => expect(screen.getByText("s3")).toBeInTheDocument());
});

it("opens assign media with the clicked sentence range and real thumbnails", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  fireEvent.click(await screen.findByRole("button", { name: "Assign media to sentence 5" }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByLabelText("From")).toHaveValue(5);
  expect(within(dialog).getByLabelText("To")).toHaveValue(5);
  expect(within(dialog).getAllByRole("img")).toHaveLength(5);
});

it("keeps draft render progress in the editor and can cancel it", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: true });
  const sockets: MockWebSocket[] = [];
  class MockWebSocket {
    onerror: (() => void) | null = null;
    onmessage: ((message: { data: string }) => void) | null = null;
    url: string;

    constructor(url: string) {
      this.url = url;
      sockets.push(this);
    }

    close = vi.fn();
  }
  vi.stubGlobal("WebSocket", MockWebSocket);

  renderEditor();

  fireEvent.click(await screen.findByRole("button", { name: /render draft/i }));
  expect(await screen.findByText("Rendering draft : Queued")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Draft render progress" })).toHaveAttribute("aria-valuenow", "0");

  sockets[0]?.onmessage?.({ data: JSON.stringify({ type: "progress", render_id: "r-test01", stage: "compose", percent: 42, message: "ffmpeg compose" }) });
  expect(await screen.findByText("Rendering draft : Running")).toBeInTheDocument();
  expect(screen.getByText("42%")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByText("Rendering draft : Cancelled")).toBeInTheDocument();
});
