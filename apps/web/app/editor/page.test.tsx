import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Suspense, type ImgHTMLAttributes } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/lib/i18n/messages/en.json";
import { editorOperationStorageKey } from "@/lib/editor-operation-log/operation-log";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

const testCanvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  clip: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  restore: vi.fn(),
  roundRect: vi.fn(),
  save: vi.fn(),
  strokeText: vi.fn(),
} as unknown as CanvasRenderingContext2D;

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
  window.localStorage.clear();
  global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
  Element.prototype.scrollIntoView = vi.fn();
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(testCanvasContext);
});

afterEach(() => {
  vi.restoreAllMocks();
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

it("shows launcher recovery for invalid dynamic editor path segment", () => {
  _projectIdParam = null;
  _pathname = "/editor/E:/projects/demo";
  renderEditor();
  expect(screen.getByText(/No project open/i)).toBeInTheDocument();
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

const TEST_ALIGNMENT_RERUN = {
  sentences: [
    { index: 1, text: "Capitalism begins here.", start_s: 1, end_s: 6, confidence_avg: 0.95 },
    { index: 2, text: "A product demo uses PiP.", start_s: 7, end_s: 14, confidence_avg: 0.92 },
    { index: 3, text: "Capitalism changes incentives.", start_s: 15, end_s: 21, confidence_avg: 0.93 },
    { index: 4, text: "The foreground returns.", start_s: 22, end_s: 29, confidence_avg: 0.91 },
  ],
  words: [],
  cache_hit: false,
};

const TEST_PROJECT_MEDIA = ["PIP.png", "bg0.png", "bg1.png", "bg2.png", "foreground.png"].map((filename) => ({
  id: filename,
  name: filename,
  kind: "image" as const,
  path: `media/${filename}`,
  thumb_path: `uploads/thumb/${filename.replace(/\.[^.]+$/, ".jpg")}`,
  import_mode: "copy" as const,
  imported_at: "2026-05-11T00:00:00Z",
  created_at: "2026-05-11T00:00:00Z",
}));

const TEST_PROJECT = {
  version: 1,
  name: "test01",
  audio: "voice.mp3",
  transcript: { kind: "plain_text", path: "transcript.txt" },
  output: { preset: "final" },
  media: TEST_PROJECT_MEDIA,
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
        cache_status: "warm",
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
        cache_status: "warm",
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
        cache_status: "warm",
      }],
    },
  ],
  subtitles: null,
  watermark: null,
};

const TEST_PROJECT_NO_BG = {
  ...TEST_PROJECT,
  layers: TEST_PROJECT.layers.filter((layer) => layer.kind !== "bg"),
};

const TEST_PROJECT_NO_SUBTITLES_LAYER = {
  ...TEST_PROJECT,
  layers: TEST_PROJECT.layers.filter((layer) => layer.kind !== "sub"),
};

const TEST_PROJECT_STALE_INVALID = {
  ...TEST_PROJECT,
  layers: TEST_PROJECT.layers.map((layer) => {
    if (layer.kind !== "fg") return layer;
    return {
      ...layer,
      items: layer.items.map((item, index) => index === 0 ? { ...item, cache_status: "invalid" as const } : item),
    };
  }),
};

const TEST_PROJECT_FG_OVERLAP = {
  ...TEST_PROJECT,
  layers: TEST_PROJECT.layers.map((layer) => {
    if (layer.kind !== "fg") return layer;
    return {
      ...layer,
      items: [
        {
          id: "fg-1",
          mediaId: "foreground.png",
          sentences: [1, 1] as [number, number],
          start: 0,
          end: 5,
          motion: { kind: "none", easing: "ease_in_out" },
          transitions: { in: "fade", out: "cut" },
          cache_status: "warm",
        },
        {
          id: "fg-2",
          mediaId: "foreground-2.png",
          sentences: [3, 3] as [number, number],
          start: 10,
          end: 15,
          motion: { kind: "none", easing: "ease_in_out" },
          transitions: { in: "fade", out: "cut" },
          cache_status: "warm",
        },
      ],
    };
  }),
};

const TEST_PROJECT_PIP_OVERLAP = {
  ...TEST_PROJECT,
  layers: TEST_PROJECT.layers.map((layer) => {
    if (layer.kind !== "pip") return layer;
    return {
      ...layer,
      items: [
        {
          id: "pip-1",
          mediaId: "PIP.png",
          sentences: [2, 2] as [number, number],
          start: 5,
          end: 10,
          motion: { kind: "none", easing: "ease_in_out" },
          transitions: { in: "fade", out: "cut" },
          cache_status: "warm",
          pip: { posX: 68, posY: 14, size: 30, radius: 12, opacity: 100 },
        },
        {
          id: "pip-2",
          mediaId: "PIP-2.png",
          sentences: [4, 4] as [number, number],
          start: 15,
          end: 20,
          motion: { kind: "none", easing: "ease_in_out" },
          transitions: { in: "fade", out: "cut" },
          cache_status: "warm",
          pip: { posX: 88, posY: 88, size: 30, radius: 12, opacity: 100 },
        },
      ],
    };
  }),
};

const TEST_MEDIA = ["PIP.png", "bg0.png", "bg1.png", "bg2.png", "foreground.png"].map((filename) => ({
  filename,
  kind: "image",
  size: 123456,
  thumb_url: `/projects/thumb?project=test01&filename=${filename.replace(/\.[^.]+$/, ".jpg")}`,
}));

function mockTest01Fetch(options: {
  alignment?: typeof TEST_ALIGNMENT;
  hasUnrenderedChanges?: boolean;
  lastRenderedConfigHash?: string | null;
  project?: typeof TEST_PROJECT;
  renderCache?: { cached_count: number; state: "warm" | "cold" | "partial" | "invalid"; total_count: number };
  renderCacheSequence?: Array<{ cached_count: number; state: "warm" | "cold" | "partial" | "invalid"; total_count: number } | null>;
  saveHasUnrenderedChanges?: boolean;
  uploadsResult?: Array<{ mediaId: string; media: Record<string, unknown> }>;
} = {}) {
  const hasUnrenderedChanges = options.hasUnrenderedChanges ?? false;
  const lastRenderedConfigHash = options.lastRenderedConfigHash ?? null;
  const alignment = options.alignment ?? TEST_ALIGNMENT;
  const project = options.project ?? TEST_PROJECT;
  const defaultRenderCacheTotal = (project.layers ?? [])
    .filter((layer) => layer.kind === "bg" || layer.kind === "fg" || layer.kind === "pip")
    .reduce((count, layer) => count + layer.items.length, 0);
  const defaultRenderCache = {
    state: defaultRenderCacheTotal > 0 ? "warm" as const : "cold" as const,
    cached_count: defaultRenderCacheTotal,
    total_count: defaultRenderCacheTotal,
  };
  const renderCache = options.renderCache;
  const renderCacheSequence = options.renderCacheSequence ?? null;
  let renderCacheCallCount = 0;
  const saveHasUnrenderedChanges = options.saveHasUnrenderedChanges ?? true;
  const uploadsResult = options.uploadsResult ?? [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/inspect`) && init?.method === "POST") {
      return ok({ path: "E:/projects/test01" });
    }
    if (url.endsWith("/projects")) return ok([{ project_id: TEST_PROJECT_ID, path: "E:/projects/test01" }]);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/alignment`)) return ok(alignment);
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
    if (url.includes(`/projects/${TEST_PROJECT_ID}/render-cache`)) {
      const currentRenderCache = renderCacheSequence
        ? renderCacheSequence[Math.min(renderCacheCallCount, renderCacheSequence.length - 1)] ?? null
        : renderCache ?? defaultRenderCache;
      renderCacheCallCount += 1;
      if (currentRenderCache) {
        return ok({ ...currentRenderCache, project_id: TEST_PROJECT_ID });
      }
      return { ok: false, status: 503, json: async () => ({}) } as Response;
    }
    if (url.includes(`/projects/${TEST_PROJECT_ID}/media`)) return ok(TEST_MEDIA);
    if (url.endsWith("/uploads") && init?.method === "POST") return ok(uploadsResult);
    if (url.includes(`/projects/${TEST_PROJECT_ID}/renders/r-test01/cancel`)) return ok({ ok: true });
    if (url.includes(`/projects/${TEST_PROJECT_ID}/render`)) return ok({ render_id: "r-test01", output_path: "renders/r-test01.mp4" });
    return { ok: false, json: async () => ({}) } as Response;
  });
}

function ok(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function readUndo(projectId = TEST_PROJECT_ID): Array<{ op?: Record<string, unknown> }> {
  const raw = window.localStorage.getItem(editorOperationStorageKey(projectId));
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { undo?: Array<{ op?: Record<string, unknown> }> };
  return parsed.undo ?? [];
}

async function openAssignModalFromSentence(sentenceName: RegExp) {
  const sentence = await screen.findByRole("button", { name: sentenceName });
  fireEvent.contextMenu(sentence, { clientX: 30, clientY: 40 });
  fireEvent.click(await screen.findByRole("menuitem", { name: /assign media to range/i }));
}

it("renders the test01 editor from project, alignment, and media data", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByText(`projectId: ${TEST_PROJECT_ID}`)).toBeInTheDocument();
  expect(screen.getByText("cache warm 3/3")).toBeInTheDocument();
  expect(await screen.findByText("Transcript · 5 aligned")).toBeInTheDocument();
  expect(await screen.findByText("Subtitles · 5")).toBeInTheDocument();
  expect(screen.getAllByText("PiP · z3").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole("button", { name: "PIP.png over s2" })).toBeInTheDocument();
  expect(screen.getByText("Background · 1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "PIP.png over s2" }));
  expect(screen.getByLabelText("PiP size")).toHaveValue("30");
  expect(screen.getByLabelText("PiP radius")).toHaveValue("12");
  expect(screen.getByLabelText("PiP opacity")).toHaveValue("100");
  fireEvent.click(screen.getByRole("button", { name: "bg0.png over s1" }));
  expect(screen.getByLabelText("Background crossfade")).toHaveValue(0.6);
});

it("restores the subtitles timeline layer for aligned projects whose saved config is missing it", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: false, project: TEST_PROJECT_NO_SUBTITLES_LAYER });

  renderEditor();
  await screen.findByText("test01");

  expect(await screen.findByText("Subtitles · 5")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Layers - 4" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));

  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    expect(payload?.config?.layers?.[0]).toMatchObject({
      id: "subtitles",
      kind: "sub",
      name: "Subtitles",
    });
  });
});

it("remaps clip timestamps on alignment rerun and keeps unmappable anchors orphaned without deleting clips", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  const project = {
    ...TEST_PROJECT,
    media: [...TEST_PROJECT.media, { ...TEST_PROJECT.media[0], id: "orphan.png", name: "orphan.png", path: "media/orphan.png" }],
    layers: TEST_PROJECT.layers.map((layer) => {
      if (layer.kind !== "fg") return layer;
      return {
        ...layer,
        items: [
          ...layer.items,
          {
            id: "fg-orphan",
            mediaId: "orphan.png",
            sentences: [5, 5] as [number, number],
            start: 20,
            end: 25,
            motion: { kind: "none", easing: "ease_in_out" },
            transitions: { in: "fade", out: "cut" },
            cache_status: "warm" as const,
          },
        ],
      };
    }),
  };
  mockTest01Fetch({ project, alignment: TEST_ALIGNMENT_RERUN });

  renderEditor();
  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "orphan.png over s5" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("cache invalid 3/4")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCalls = calls.filter(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCalls).toHaveLength(1);
  });

  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
  const putBody = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
  const savedLayers = putBody.config.layers as Array<{ kind: string; items: Array<Record<string, unknown>> }>;
  const pipItem = savedLayers.find((layer) => layer.kind === "pip")?.items.find((item) => item.id === "pip-1");
  expect(pipItem?.start).toBe(7);
  expect(pipItem?.end).toBe(14);
  expect(pipItem?.orphaned).not.toBe(true);

  const orphanItem = savedLayers.find((layer) => layer.kind === "fg")?.items.find((item) => item.id === "fg-orphan");
  expect(orphanItem).toBeDefined();
  expect(orphanItem?.sentences).toEqual([5, 5]);
  expect(orphanItem?.orphaned).toBe(true);
  expect(orphanItem?.orphan_reason).toBe("missing_sentence_anchor");
});

it("reflects backend render-cache state/count when response is available", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ renderCache: { state: "partial", cached_count: 1, total_count: 3 } });

  renderEditor();

  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByText("cache partial 1/3")).toBeInTheDocument();
});

it("clears stale persisted invalid cache status when backend render-cache is warm", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({
    project: TEST_PROJECT_STALE_INVALID,
    renderCache: { state: "warm", cached_count: 3, total_count: 3 },
  });

  renderEditor();

  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByText("cache warm 3/3")).toBeInTheDocument();
});

it("shows local invalid cache state immediately after clip edit even when backend cache was warm on load", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ renderCache: { state: "warm", cached_count: 3, total_count: 3 } });

  renderEditor();

  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByText("cache warm 3/3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "foreground.png over s1" }));
  fireEvent.change(screen.getByLabelText("Foreground motion"), { target: { value: "zoom_in" } });

  expect(screen.getByText("cache invalid 2/3")).toBeInTheDocument();
});

it("shows local cache invalidation after output resolution changes from a warm backend cache", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ renderCache: { state: "warm", cached_count: 3, total_count: 3 } });

  renderEditor();

  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByText("cache warm 3/3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "720p" }));

  expect(screen.getByText("cache invalid 0/3")).toBeInTheDocument();
});

it("tracks render-cache fetch failures as observable state without breaking editor load", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mockTest01Fetch({ renderCacheSequence: [null] });

  renderEditor();

  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(screen.getByTestId("editor-center-pane")).toHaveAttribute("data-cache-summary-error", "status:503");
  expect(warn).toHaveBeenCalledWith(
    "Editor render-cache summary fetch failed",
    expect.objectContaining({ error: "status:503", projectId: TEST_PROJECT_ID }),
  );
});

it("uses responsive layout guards so preview/transport do not clip on narrow widths", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  const layout = screen.getByTestId("editor-layout-grid");
  expect(layout.className).toContain("grid-cols-1");
  expect(layout.className).toContain("lg:grid-cols-[380px_minmax(0,1fr)_320px]");
  expect(layout.className).toContain("divide-y");
  expect(layout.className).toContain("lg:divide-y-0");

  const shell = layout.closest("main");
  expect(shell?.className ?? "").toContain("overflow-y-auto");
  expect(shell?.className ?? "").toContain("lg:overflow-hidden");
});

it("defaults selection to background on editor entry when background exists", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByLabelText("Background crossfade")).toHaveValue(0.6);
  expect(screen.queryByRole("button", { name: "PiP placement BR" })).not.toBeInTheDocument();
});

it("defaults selection to first non-subtitle item when background is absent", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ project: TEST_PROJECT_NO_BG });

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("button", { name: "PiP placement BR" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add Background" })).toBeInTheDocument();
});

it("restores valid recovered selection instead of replacing it with background default", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();
  window.localStorage.setItem(
    `vc.editor.recovery.${TEST_PROJECT_ID}`,
    JSON.stringify({
      version: 1,
      resolution: "1080p",
      selected: { layerId: "pip-z3", itemId: "pip-1" },
      selectedRange: null,
      transcriptScrollTop: 0,
    }),
  );

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("button", { name: "PiP placement BR" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Background crossfade")).not.toBeInTheDocument();
});

it("shows Add Background in global right-rail controls when background is absent", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ project: TEST_PROJECT_NO_BG });

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("button", { name: "Add Background" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Change Background" })).not.toBeInTheDocument();
});

it("shows Change Background in global right-rail controls when background is present", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("button", { name: "Change Background" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add Background" })).not.toBeInTheDocument();
});

it("renders Watermark, Subtitles, and Background controls before contextual inspector sections", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "PIP.png over s2" }));

  const watermark = screen.getByRole("button", { name: "Watermark" });
  const subtitles = screen.getByRole("button", { name: "Subtitles" });
  const background = screen.getByRole("button", { name: "Change Background" });
  const contextualHeading = screen.getByRole("heading", { name: "PiP · z3" });

  expect(watermark.compareDocumentPosition(contextualHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(subtitles.compareDocumentPosition(contextualHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(background.compareDocumentPosition(contextualHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("updates only background through Change Background modal and appends one operation", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "Change Background" }));

  expect(await screen.findByRole("heading", { name: "Change background" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /bg1\.png/i }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("button", { name: "bg1.png over s1-s5" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PIP.png over s2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "foreground.png over s1" })).toBeInTheDocument();

  const raw = window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID));
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw ?? "{}");
  expect(parsed.undo).toHaveLength(1);
  expect(parsed.undo[0]?.op?.type).toBe("replace_layers");

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    const bgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "bg");
    const fgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "fg");
    const pipLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "pip");
    expect(bgLayer?.items?.[0]?.cache_status).toBe("invalid");
    expect(fgLayer?.items?.[0]?.cache_status).toBe("warm");
    expect(pipLayer?.items?.[0]?.cache_status).toBe("warm");
  });
});

it("edits foreground via inspector Assign modal and invalidates only the edited foreground item", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "foreground.png over s1" }));
  fireEvent.click(screen.getByTitle("CHANGE"));

  expect(await screen.findByRole("heading", { name: "Edit media to range" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Motion"), { target: { value: "zoom_in" } });
  fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

  expect(readUndo()).toHaveLength(1);
  expect(readUndo()[0]?.op?.type).toBe("replace_layers");

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    const bgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "bg");
    const fgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "fg");
    const pipLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "pip");
    expect(fgLayer?.items?.[0]?.motion?.kind).toBe("zoom_in");
    expect(fgLayer?.items?.[0]?.cache_status).toBe("invalid");
    expect(bgLayer?.items?.[0]?.cache_status).toBe("warm");
    expect(pipLayer?.items?.[0]?.cache_status).toBe("warm");
  });
});

it("saves background motion with schema-valid values after Change Background", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "Change Background" }));

  const modal = await screen.findByRole("dialog");
  fireEvent.click(within(modal).getByRole("button", { name: /bg1\.png/i }));
  fireEvent.change(within(modal).getByLabelText(/motion/i), { target: { value: "ken_burns" } });
  fireEvent.click(within(modal).getByRole("button", { name: "Save changes" }));

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));

  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    const bgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "bg");
    const bgItem = bgLayer?.items?.[0];
    expect(bgItem?.motion?.kind).toBe("ken_burns");
  });
});

it("edits background inspector controls and invalidates only background cache entries", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ renderCache: { state: "warm", cached_count: 3, total_count: 3 } });

  renderEditor();
  await screen.findByText("test01");
  expect(screen.getByText("cache warm 3/3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "bg0.png over s1" }));

  fireEvent.change(screen.getByLabelText("Background crossfade"), { target: { value: "1.2" } });
  fireEvent.change(screen.getByLabelText("Background motion"), { target: { value: "ken_burns_strong" } });
  fireEvent.change(screen.getByLabelText("Background easing"), { target: { value: "ease_out" } });

  expect(readUndo()).toHaveLength(3);
  expect(screen.getByText("cache invalid 2/3")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    const bgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "bg");
    const fgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "fg");
    const pipLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "pip");
    expect(bgLayer?.items?.[0]?.crossfade).toBe(1.2);
    expect(bgLayer?.items?.[0]?.motion?.kind).toBe("ken_burns_strong");
    expect(bgLayer?.items?.[0]?.motion?.easing).toBe("ease_out");
    expect(bgLayer?.items?.[0]?.cache_status).toBe("invalid");
    expect(fgLayer?.items?.[0]?.cache_status).toBe("warm");
    expect(pipLayer?.items?.[0]?.cache_status).toBe("warm");
  });
});

it("persists schema-valid background motion when inspector selects subtle alias", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "bg0.png over s1" }));

  fireEvent.change(screen.getByLabelText("Background motion"), { target: { value: "ken_burns_subtle" } });
  expect(readUndo()).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    const bgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "bg");
    expect(bgLayer?.items?.[0]?.motion?.kind).toBe("ken_burns");
  });
});

it("persists schema-valid foreground motion when inspector receives subtle alias", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "foreground.png over s1" }));

  fireEvent.change(screen.getByLabelText("Foreground motion"), { target: { value: "ken_burns_subtle" } });
  expect(readUndo()).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    const fgLayer = payload?.config?.layers?.find((layer: { kind?: string }) => layer.kind === "fg");
    expect(fgLayer?.items?.[0]?.motion?.kind).not.toBe("ken_burns_subtle");
    expect(["none", "static", "ken_burns", "ken_burns_strong", "zoom_in", "zoom_out", "pan_left", "pan_right"]).toContain(fgLayer?.items?.[0]?.motion?.kind);
  });
});

it("edits foreground inspector fields and deletes foreground item with one op per action", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "foreground.png over s1" }));

  fireEvent.change(screen.getByLabelText("Range from"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Foreground motion"), { target: { value: "ken_burns_strong" } });
  fireEvent.change(screen.getByLabelText("Transition out"), { target: { value: "slide_left" } });

  expect(readUndo()).toHaveLength(3);
  expect(screen.getByRole("button", { name: "foreground.png over s2" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /foreground\.png over/i })).not.toBeInTheDocument());
  expect(readUndo()).toHaveLength(4);
});

it("rejects overlapping foreground range edits from inspector without appending operations", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ project: TEST_PROJECT_FG_OVERLAP });

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "foreground.png over s1" }));

  fireEvent.change(screen.getByLabelText("Range from"), { target: { value: "3" } });

  expect(readUndo()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "foreground.png over s1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "foreground-2.png over s3" })).toBeInTheDocument();
});

it("edits PiP inspector placement and style fields, then deletes PiP item", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "PIP.png over s2" }));

  fireEvent.click(screen.getByRole("button", { name: "PiP placement TL" }));
  fireEvent.change(screen.getByLabelText("PiP size"), { target: { value: "42" } });
  fireEvent.change(screen.getByLabelText("PiP radius"), { target: { value: "22" } });
  fireEvent.change(screen.getByLabelText("PiP opacity"), { target: { value: "80" } });

  expect(readUndo()).toHaveLength(4);

  fireEvent.click(screen.getByRole("button", { name: "Delete PiP item" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /PIP\.png over/i })).not.toBeInTheDocument());
  expect(readUndo()).toHaveLength(5);
});

it("deletes a selected non-background timeline clip via keyboard Delete", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "PIP.png over s2" }));

  fireEvent.keyDown(window, { key: "Delete" });

  await waitFor(() => expect(screen.queryByRole("button", { name: /PIP\.png over/i })).not.toBeInTheDocument());
  expect(readUndo()).toHaveLength(1);
});

it("does not delete background clips via keyboard Delete", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  fireEvent.keyDown(window, { key: "Delete" });

  expect(screen.getByRole("button", { name: "bg0.png over s1" })).toBeInTheDocument();
  expect(readUndo()).toHaveLength(0);
});

it("dragging a timeline clip body recalculates sentence range from updated span", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();
  const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 20,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  }));

  renderEditor();
  await screen.findByText("test01");

  fireEvent.mouseDown(screen.getByRole("button", { name: "foreground.png over s1" }), { clientX: 0 });
  fireEvent.mouseMove(window, { clientX: 20 });
  fireEvent.mouseUp(window);

  await waitFor(() => expect(screen.getByRole("button", { name: "foreground.png over s2" })).toBeInTheDocument());
  const audio = screen.getByTestId("editor-audio") as HTMLAudioElement;
  await waitFor(() => expect(audio.currentTime).toBeGreaterThanOrEqual(5));
  rectSpy.mockRestore();
});

it("rejects overlapping pip range edits from inspector without appending operations", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ project: TEST_PROJECT_PIP_OVERLAP });

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "PIP.png over s2" }));

  fireEvent.change(screen.getByLabelText("Range from"), { target: { value: "4" } });

  expect(readUndo()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "PIP.png over s2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PIP-2.png over s4" })).toBeInTheDocument();
});

it("Remove background deletes only background and appends one operation", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: /remove background/i }));

  await waitFor(() => expect(screen.queryByRole("button", { name: "bg0.png over s1" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "PIP.png over s2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "foreground.png over s1" })).toBeInTheDocument();

  const raw = window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID));
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw ?? "{}");
  expect(parsed.undo).toHaveLength(1);
  expect(parsed.undo[0]?.op?.type).toBe("replace_layers");
});

it("opens layers popover from Layers - 4 and shows header", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  fireEvent.click(screen.getByRole("button", { name: "Layers - 4" }));

  expect(screen.getByText("Layer order - top renders on top")).toBeInTheDocument();
});

it("clicking Layers - 4 when open closes popover", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  const trigger = screen.getByRole("button", { name: "Layers - 4" });
  fireEvent.click(trigger);
  expect(screen.getByText("Layer order - top renders on top")).toBeInTheDocument();

  fireEvent.click(trigger);
  await waitFor(() => expect(screen.queryByText("Layer order - top renders on top")).not.toBeInTheDocument());
});

it("closes layers popover on outside mousedown", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  fireEvent.click(screen.getByRole("button", { name: "Layers - 4" }));
  expect(screen.getByText("Layer order - top renders on top")).toBeInTheDocument();

  fireEvent.mouseDown(document.body);

  await waitFor(() => expect(screen.queryByText("Layer order - top renders on top")).not.toBeInTheDocument());
});

it("selects a foreground row from layers popover", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByLabelText("Background crossfade")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Layers - 4" }));
  const popover = document.getElementById("editor-layers-popover");
  expect(popover).not.toBeNull();
  fireEvent.click(within(popover!).getByRole("button", { name: /foreground z1/i }));

  expect(screen.getByLabelText("Foreground motion")).toBeInTheDocument();
  expect(screen.queryByLabelText("Background crossfade")).not.toBeInTheDocument();
});

it("removes background from layers popover trash and appends one operation", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  fireEvent.click(screen.getByRole("button", { name: "Layers - 4" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete layer" }));

  await waitFor(() => expect(screen.queryByRole("button", { name: "bg0.png over s1" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "PIP.png over s2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "foreground.png over s1" })).toBeInTheDocument();
  expect(readUndo()).toHaveLength(1);
  expect(readUndo()[0]?.op?.type).toBe("replace_layers");
});

it("closes layers popover on Escape", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  fireEvent.click(screen.getByRole("button", { name: "Layers - 4" }));
  expect(screen.getByText("Layer order - top renders on top")).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "Escape" });

  await waitFor(() => expect(screen.queryByText("Layer order - top renders on top")).not.toBeInTheDocument());
});

it("Apply in subtitles modal updates defaults, appends one operation, and closes", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "Subtitles" }));

  const modal = await screen.findByRole("dialog");
  fireEvent.change(within(modal).getByLabelText("Background"), { target: { value: "pill" } });
  fireEvent.change(within(modal).getByLabelText("Position"), { target: { value: "top" } });
  fireEvent.change(within(modal).getByLabelText("Font"), { target: { value: "Helvetica Neue" } });
  fireEvent.change(within(modal).getByLabelText("Max chars / line"), { target: { value: "30" } });
  fireEvent.change(within(modal).getByLabelText("Size"), { target: { value: "40" } });
  fireEvent.click(within(modal).getByRole("switch", { name: "Show subtitles" }));
  fireEvent.click(within(modal).getByRole("button", { name: "Apply" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  const raw = window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID));
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw ?? "{}");
  expect(parsed.undo).toHaveLength(1);
  expect(parsed.undo[0]?.op?.type).toBe("subtitle_settings_update");

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    expect(payload.config.subtitles).toEqual({
      burn_in: true,
      style: {
        bg_style: "pill",
        font: "Helvetica Neue",
        max_chars_per_line: 30,
        position: "top",
        size: 40,
      },
    });
  });
});

it("Cancel in subtitles modal closes without mutation", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "Subtitles" }));

  const modal = await screen.findByRole("dialog");
  fireEvent.change(within(modal).getByLabelText("Font"), { target: { value: "SF Pro" } });
  fireEvent.click(within(modal).getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  const raw = window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID));
  if (raw) {
    const parsed = JSON.parse(raw);
    expect(parsed.undo ?? []).toHaveLength(0);
  } else {
    expect(raw).toBeNull();
  }
});

it("updates watermark config, shows preview watermark, and persists watermark operations", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  fireEvent.click(screen.getByRole("switch", { name: /watermark enabled/i }));
  fireEvent.change(screen.getByRole("combobox", { name: "Watermark asset" }), { target: { value: "bg0.png" } });

  await waitFor(() => {
    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-watermark-visible", "true");
  });

  fireEvent.click(screen.getByRole("button", { name: "Remove watermark" }));
  await waitFor(() => {
    expect(screen.getByTestId("preview-canvas")).toHaveAttribute("data-watermark-visible", "false");
  });

  const raw = window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID));
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw ?? "{}");
  const wmOps = (parsed.undo ?? []).filter((entry: { op?: { type?: string } }) => entry.op?.type === "watermark_update");
  expect(wmOps.length).toBeGreaterThanOrEqual(2);
  expect(wmOps.some((entry: { op?: { after?: { mediaId?: string } } }) => entry.op?.after?.mediaId === "bg0.png")).toBe(true);
  expect(wmOps.at(-1)?.op?.after).toBeNull();
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

it("supports transcript search keyboard shortcuts and Cmd/Ctrl+F focus", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  const search = await screen.findByRole("searchbox", { name: /search transcript/i });
  const saveButton = screen.getByRole("button", { name: /save project config/i });
  saveButton.focus();
  expect(saveButton).toHaveFocus();

  fireEvent.keyDown(window, { key: "f", ctrlKey: true });
  expect(search).toHaveFocus();

  fireEvent.change(search, { target: { value: "capitalism" } });
  const audio = screen.getByTestId("editor-audio") as HTMLAudioElement;
  expect(audio.currentTime).toBe(0);

  fireEvent.keyDown(search, { key: "Enter" });
  await waitFor(() => expect(audio.currentTime).toBe(10));

  fireEvent.keyDown(search, { key: "Enter", shiftKey: true });
  await waitFor(() => expect(audio.currentTime).toBe(0));

  fireEvent.keyDown(search, { key: "ArrowDown" });
  await waitFor(() => expect(audio.currentTime).toBe(10));

  fireEvent.keyDown(search, { key: "Escape" });
  expect(search).toHaveValue("");
});

it("toggles play and pause with Space outside typing targets", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();
  const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);
  const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: " ", code: "Space" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());

  fireEvent.keyDown(window, { key: " ", code: "Space" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument());

  expect(playSpy).toHaveBeenCalled();
  expect(pauseSpy).toHaveBeenCalled();
  playSpy.mockRestore();
  pauseSpy.mockRestore();
});

it("ignores Space play/pause shortcut when typing in editable targets", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();
  const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);

  renderEditor();
  await screen.findByText("test01");

  const search = screen.getByRole("searchbox", { name: /search transcript/i });
  search.focus();
  fireEvent.keyDown(search, { key: " ", code: "Space" });

  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  expect(playSpy).not.toHaveBeenCalled();
});

it("ignores Space play/pause shortcut when focused on an interactive button", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();
  const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);

  renderEditor();
  await screen.findByText("test01");

  const saveButton = screen.getByRole("button", { name: /save project config/i });
  saveButton.focus();
  expect(saveButton).toHaveFocus();

  fireEvent.keyDown(saveButton, { key: " ", code: "Space" });

  expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  expect(playSpy).not.toHaveBeenCalled();
});

it("merges transcript sentences, remaps clip anchors, and appends one operation-log entry", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  const firstSentence = await screen.findByRole("button", { name: /1 00:00-00:05 Capitalism begins here/i });
  fireEvent.click(firstSentence);
  fireEvent.click(screen.getByRole("button", { name: /2 00:05-00:10 A product demo uses PiP/i }), { shiftKey: true });
  fireEvent.contextMenu(firstSentence, { clientX: 30, clientY: 40 });
  fireEvent.click(screen.getByRole("menuitem", { name: /merge 2 sentences/i }));

  expect(await screen.findByText(/Transcript .* 4 aligned/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PIP.png over s1" })).toBeInTheDocument();

  const raw = window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID));
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw ?? "{}");
  expect(parsed.undo).toHaveLength(1);
  expect(parsed.undo[0]?.op?.type).toBe("transcript_merge");

  fireEvent.click(screen.getByRole("button", { name: /save project config/i }));
  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const putConfigCall = calls.find(([input, init]) => String(input).includes(`/projects/${TEST_PROJECT_ID}/config`) && init?.method === "PUT");
    expect(putConfigCall).toBeDefined();
    const payload = JSON.parse(String(putConfigCall?.[1]?.body ?? "{}"));
    expect(Array.isArray(payload.config?.transcript?.sentences)).toBe(true);
    expect(payload.config?.transcript?.sentences).toHaveLength(4);
  });
});

it("imports media through POST /uploads and shows the imported asset in modal", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({
    uploadsResult: [
      {
        mediaId: "new-upload.jpg",
        media: {
          id: "new-upload.jpg",
          name: "new-upload.jpg",
          kind: "image",
          path: "uploads/new-upload.jpg",
          thumb_path: "uploads/.thumbs/new-upload.jpg",
          dimensions: { width: 1280, height: 720 },
          duration: null,
          size: 456789,
          hash: "abc",
          import_mode: "copy",
          imported_at: "2026-05-16T00:00:00Z",
          created_at: null,
        },
      },
    ],
  });

  renderEditor();
  await openAssignModalFromSentence(/5 00:20-00:25 Assign a new asset here/i);

  const fileInput = document.querySelector("input[type='file']") as HTMLInputElement | null;
  expect(fileInput).not.toBeNull();
  fireEvent.change(fileInput!, {
    target: { files: [new File([new Uint8Array([1, 2])], "new-upload.jpg", { type: "image/jpeg" })] },
  });

  await waitFor(() => {
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([input, init]) => String(input).endsWith("/uploads") && init?.method === "POST")).toBe(true);
  });
  expect((await screen.findAllByText("new-upload.jpg")).length).toBeGreaterThan(0);
});

it("creates a foreground clip from assign modal and appends one replace_layers operation", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await openAssignModalFromSentence(/5 00:20-00:25 Assign a new asset here/i);

  fireEvent.click(screen.getByAltText("PIP.png").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /add to project/i }));

  expect(await screen.findByRole("button", { name: "PIP.png over s5" })).toBeInTheDocument();
  const raw = window.localStorage.getItem(editorOperationStorageKey(TEST_PROJECT_ID));
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw ?? "{}");
  expect(parsed.undo).toHaveLength(1);
  expect(parsed.undo[0]?.op?.type).toBe("replace_layers");
});

it("opens assign media with the clicked sentence range and real thumbnails", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  await openAssignModalFromSentence(/5 00:20-00:25 Assign a new asset here/i);

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

it("disables render actions after draft completes with the latest saved hash", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: true, saveHasUnrenderedChanges: true });
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
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: /render draft/i }));
  await screen.findByText("Rendering draft : queued");

  sockets[0]?.onmessage?.({
    data: JSON.stringify({
      type: "progress",
      render_id: "r-test01",
      stage: "done",
      percent: 100,
      message: "done",
      output_path: "renders/r-test01.mp4",
    }),
  });

  expect(await screen.findByText("Rendering draft : done")).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /render draft/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /render final/i })).toBeDisabled();
  });
});

it("reconciles cache summary from invalid back to warm after successful draft render completion", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({
    hasUnrenderedChanges: true,
    saveHasUnrenderedChanges: true,
    renderCacheSequence: [
      { state: "warm", cached_count: 3, total_count: 3 },
      { state: "warm", cached_count: 3, total_count: 3 },
    ],
  });
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
  await screen.findByText("test01");
  expect(screen.getByText("cache warm 3/3")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "foreground.png over s1" }));
  fireEvent.change(screen.getByLabelText("Foreground motion"), { target: { value: "zoom_in" } });
  expect(screen.getByText("cache invalid 2/3")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /render draft/i }));
  await screen.findByText("Rendering draft : queued");
  sockets[0]?.onmessage?.({
    data: JSON.stringify({
      type: "progress",
      render_id: "r-test01",
      stage: "done",
      percent: 100,
      message: "done",
      output_path: "renders/r-test01.mp4",
    }),
  });

  await waitFor(() => expect(screen.getByText("cache warm 3/3")).toBeInTheDocument());
  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([input]) =>
    String(input).includes(`/projects/${TEST_PROJECT_ID}/render-cache`),
  );
  expect(calls.length).toBeGreaterThanOrEqual(2);
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

  await openAssignModalFromSentence(/5 00:20-00:25 Assign a new asset here/i);

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

it("reopen restores resolution from replayed operation log when recovery state is missing", async () => {
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

  expect(screen.getByRole("radio", { name: "9:16" })).toHaveAttribute("aria-checked", "true");
});

it("discards malformed recovery state without blocking canonical project load", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ hasUnrenderedChanges: false });
  window.localStorage.setItem(`vc.editor.recovery.${TEST_PROJECT_ID}`, "{bad json");

  renderEditor();
  expect(await screen.findByText("test01")).toBeInTheDocument();
  expect(window.localStorage.getItem(`vc.editor.recovery.${TEST_PROJECT_ID}`)).toBeNull();
});
