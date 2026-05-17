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
  window.localStorage.clear();
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
  uploadsResult?: Array<{ mediaId: string; media: Record<string, unknown> }>;
} = {}) {
  const hasUnrenderedChanges = options.hasUnrenderedChanges ?? false;
  const lastRenderedConfigHash = options.lastRenderedConfigHash ?? null;
  const project = options.project ?? TEST_PROJECT;
  const saveHasUnrenderedChanges = options.saveHasUnrenderedChanges ?? true;
  const uploadsResult = options.uploadsResult ?? [];
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
  expect(screen.getByLabelText("PiP size")).toHaveValue(30);
  expect(screen.getByLabelText("PiP radius")).toHaveValue(12);
  expect(screen.getByLabelText("PiP opacity")).toHaveValue(100);
  fireEvent.click(screen.getByRole("button", { name: "bg0.png over s1" }));
  expect(screen.getByLabelText("Background crossfade")).toHaveValue(0.6);
});

it("defaults selection to background on editor entry when background exists", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByLabelText("Background crossfade")).toHaveValue(0.6);
  expect(screen.queryByLabelText("PiP placement")).not.toBeInTheDocument();
});

it("defaults selection to first non-subtitle item when background is absent", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch({ project: TEST_PROJECT_NO_BG });

  renderEditor();
  await screen.findByText("test01");

  expect(screen.getByLabelText("PiP placement")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add Background" })).toBeInTheDocument();
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

  const watermark = screen.getByText("Watermark");
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
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "bg0.png over s1" }));

  fireEvent.change(screen.getByLabelText("Background crossfade"), { target: { value: "1.2" } });
  fireEvent.change(screen.getByLabelText("Background motion"), { target: { value: "ken_burns_strong" } });
  fireEvent.change(screen.getByLabelText("Background easing"), { target: { value: "ease_out" } });

  expect(readUndo()).toHaveLength(3);

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

it("edits PiP inspector placement, edge margins, and style fields, then deletes PiP item", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();
  await screen.findByText("test01");
  fireEvent.click(screen.getByRole("button", { name: "PIP.png over s2" }));

  fireEvent.change(screen.getByLabelText("PiP placement"), { target: { value: "TL" } });
  fireEvent.change(screen.getByLabelText("Edge margin X"), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText("Edge margin Y"), { target: { value: "18" } });
  fireEvent.change(screen.getByLabelText("PiP size"), { target: { value: "42" } });
  fireEvent.change(screen.getByLabelText("PiP radius"), { target: { value: "22" } });
  fireEvent.change(screen.getByLabelText("PiP opacity"), { target: { value: "80" } });

  expect(readUndo()).toHaveLength(6);

  fireEvent.click(screen.getByRole("button", { name: "Delete PiP item" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /PIP\.png over/i })).not.toBeInTheDocument());
  expect(readUndo()).toHaveLength(7);
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
  fireEvent.click(within(modal).getByRole("switch", { name: "Burn-in" }));
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

  expect(await screen.findByTestId("preview-watermark")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Remove watermark" }));
  await waitFor(() => expect(screen.queryByTestId("preview-watermark")).not.toBeInTheDocument());

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

it("merges transcript sentences, remaps clip anchors, and appends one operation-log entry", async () => {
  _projectIdParam = TEST_PROJECT_ID;
  mockTest01Fetch();

  renderEditor();

  fireEvent.contextMenu(await screen.findByRole("button", { name: /1 00:00-00:05 Capitalism begins here/i }), { clientX: 30, clientY: 40 });
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
  fireEvent.click(await screen.findByRole("button", { name: "Assign media to sentence 5" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /assign media to range/i }));

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
  fireEvent.click(await screen.findByRole("button", { name: "Assign media to sentence 5" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /assign media to range/i }));

  fireEvent.click(screen.getByAltText("PIP.png").closest("button")!);
  fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

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
