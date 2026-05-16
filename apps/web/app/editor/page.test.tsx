import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense, type ImgHTMLAttributes } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { editorOperationStorageKey } from "@/lib/editor-operation-log/operation-log";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

// Mutable so individual tests can override the "projectId" param value
let _projectIdParam: string | null = null;
let _pathname = "/editor";
const _routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: _routerPush }),
  useSearchParams: () => ({ get: (k: string) => (k === "projectId" ? _projectIdParam : null) }),
  usePathname: () => _pathname,
}));

beforeEach(() => {
  _projectIdParam = null;
  _pathname = "/editor";
  _routerPush.mockReset();
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
  expect(screen.getByText("projectId: p_demo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /render draft/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /render final/i })).toBeInTheDocument();
});

it("reads project id from the dynamic editor path", () => {
  _pathname = "/editor/p_path_demo";
  renderEditor();
  expect(screen.getByText("projectId: p_path_demo")).toBeInTheDocument();
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

function mockTest01Fetch(options: {
  hasUnrenderedChanges?: boolean;
  lastRenderedConfigHash?: string | null;
  project?: typeof TEST_PROJECT;
  saveHasUnrenderedChanges?: boolean;
} = {}) {
  const hasUnrenderedChanges = options.hasUnrenderedChanges ?? false;
  const lastRenderedConfigHash = options.lastRenderedConfigHash ?? null;
  const project = options.project ?? TEST_PROJECT;
  const saveHasUnrenderedChanges = options.saveHasUnrenderedChanges ?? true;
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/projects")) return ok([{ project_id: TEST_PROJECT_ID, path: "E:/projects/test01" }]);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/alignment`)) return ok(TEST_ALIGNMENT);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT") {
      return ok({ project_id: TEST_PROJECT_ID, config_hash: "h2", saved_at: "2026-05-11T00:00:00Z", has_unrendered_changes: saveHasUnrenderedChanges });
    }
    if (url.includes(`/projects/${TEST_PROJECT_ID}/config`)) {
      return ok({
        project_id: TEST_PROJECT_ID,
        config: project,
        config_hash: "h1",
        last_rendered_config_hash: lastRenderedConfigHash,
        has_unrendered_changes: hasUnrenderedChanges,
      });
    }
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
  expect(screen.getByText(`projectId: ${TEST_PROJECT_ID}`)).toBeInTheDocument();
  expect(screen.getByText("cache 3/3")).toBeInTheDocument();
  expect(await screen.findByText("Transcript · 5 aligned")).toBeInTheDocument();
  expect(screen.getByText("Subtitles · 1")).toBeInTheDocument();
  expect(screen.getAllByText("PiP · z3").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole("button", { name: "PIP.png over s2" })).toBeInTheDocument();
  expect(screen.getByText("Background · 1 strip")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "PIP.png over s2" }));
  expect(screen.getByText(/posX 68.*posY 14.*size 30.*radius 12.*opacity 100/)).toBeInTheDocument();
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
  fireEvent.click(await screen.findByRole("menuitem", { name: /assign media to range/i }));

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
  expect(await screen.findByText("Rendering draft : queued")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Draft render progress" })).toHaveAttribute("aria-valuenow", "0");

  sockets[0]?.onmessage?.({ data: JSON.stringify({ type: "progress", render_id: "r-test01", stage: "compose", percent: 42, message: "ffmpeg compose" }) });
  expect(await screen.findByText("Rendering draft : running")).toBeInTheDocument();
  expect(screen.getByText("42%")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByText("Rendering draft : cancelled")).toBeInTheDocument();
});

it("enables render for aligned projects even without visual clips", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({
    hasUnrenderedChanges: true,
    project: { ...TEST_PROJECT, layers: [{ id: "subtitles", kind: "sub", name: "Subtitles", items: [{ id: "sub-auto", auto: true, label: "Auto subtitles", style: "default" }] }] },
  });

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("button", { name: /render draft/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /render final/i })).toBeEnabled();
});

it("disables render when working hash matches latest successful rendered hash", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: false, lastRenderedConfigHash: "h1" });

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("button", { name: /render draft/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /render final/i })).toBeDisabled();
});

it("Render Draft saves then queues draft with selected resolution", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: true, saveHasUnrenderedChanges: true });

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("radio", { name: "9:16" }));
  fireEvent.click(screen.getByRole("button", { name: /render draft/i }));

  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCalls = calls.filter(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    const renderCalls = calls.filter(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/render`) && init?.method === "POST");
    expect(putConfigCalls).toHaveLength(1);
    expect(renderCalls).toHaveLength(1);
  });

  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const putIndex = calls.findIndex(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
  const renderIndex = calls.findIndex(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/render`) && init?.method === "POST");
  expect(putIndex).toBeGreaterThanOrEqual(0);
  expect(renderIndex).toBeGreaterThan(putIndex);
  expect(String(calls[renderIndex]?.[0] ?? "")).toContain("preset=draft");
  expect(String(calls[renderIndex]?.[0] ?? "")).toContain("resolution=1080x1920");
});

it("Render Final saves, queues final with selected resolution, and navigates to render path", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: true, saveHasUnrenderedChanges: true });

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("radio", { name: "720p" }));
  fireEvent.click(screen.getByRole("button", { name: /render final/i }));

  await waitFor(() => expect(_routerPush).toHaveBeenCalledWith(`/render/${TEST_PROJECT_ID}/r-test01`));
  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const renderCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/render`) && init?.method === "POST");
  expect(renderCall).toBeDefined();
  expect(String(renderCall?.[0] ?? "")).toContain("preset=final");
  expect(String(renderCall?.[0] ?? "")).toContain("resolution=1280x720");
});

it("writes browser autosave recovery state without PUT config sync", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  fireEvent.click(await screen.findByRole("button", { name: /assign media to sentence 5/i }));

  await waitFor(() => {
    expect(window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID))).not.toBeNull();
    expect(window.localStorage.getItem(`vc.editor.recovery.${TEST_PROJECT_ID}`)).not.toBeNull();
  });

  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const putConfigCalls = calls.filter(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
  expect(putConfigCalls).toHaveLength(0);
});

it("explicit Save syncs config via PUT and clears committed operations", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: false });
  window.localStorage.setItem(
    editorOperationStorageKey(TEST_PROJECT_ID),
    JSON.stringify({
      version: 1,
      redo: [],
      undo: [{ id: "op-1", at: "2026-05-11T00:00:00.000Z", op: { type: "global_config_update", before: { preset: "final" }, after: { preset: "final", resolution: "9:16" } } }],
    }),
  );

  renderEditor();
  await screen.findByText("test01");

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));

  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCalls = calls.filter(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCalls).toHaveLength(1);
  });

  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
  expect(putConfigCall).toBeDefined();
  const putBody = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
  expect(putBody.config.output.resolution).toBe("9:16");
  expect(window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID))).toBeNull();
});

it("reload replays operation log and restores recovery range, scroll, and resolution", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: false });
  window.localStorage.setItem(
    editorOperationStorageKey(TEST_PROJECT_ID),
    JSON.stringify({
      version: 1,
      redo: [],
      undo: [{ id: "op-1", at: "2026-05-11T00:00:00.000Z", op: { type: "global_config_update", before: { preset: "final" }, after: { preset: "final", resolution: "9:16" } } }],
    }),
  );
  window.localStorage.setItem(
    `vc.editor.recovery.${TEST_PROJECT_ID}`,
    JSON.stringify({
      version: 1,
      resolution: "9:16",
      selected: null,
      selectedRange: [2, 3],
      transcriptScrollTop: 120,
    }),
  );

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("radio", { name: "9:16" })).toHaveAttribute("aria-checked", "true");
  await waitFor(() => expect(screen.getByText("s2-s3")).toBeInTheDocument());

  const transcriptSearch = screen.getByRole("searchbox", { name: /search transcript/i });
  const transcriptScroller = transcriptSearch.closest("aside")?.querySelector(".overflow-y-auto") as HTMLDivElement | null;
  expect(transcriptScroller).not.toBeNull();
  await waitFor(() => expect(transcriptScroller?.scrollTop ?? 0).toBeGreaterThan(0));
});

it("discards malformed recovery state without blocking canonical project load", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: false });
  window.localStorage.setItem(`vc.editor.recovery.${TEST_PROJECT_ID}`, "{bad json");

  renderEditor();
  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(window.localStorage.getItem(`vc.editor.recovery.${TEST_PROJECT_ID}`)).toBeNull();
});
