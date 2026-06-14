import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { preparePage } from "./e2e-utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SERVER_DIR = path.join(REPO_ROOT, "apps", "server");
const PYTHON_EXE = process.platform === "win32"
  ? path.join(SERVER_DIR, ".venv", "Scripts", "python.exe")
  : path.join(SERVER_DIR, ".venv", "bin", "python");
const TEST01_SOURCE = path.join(REPO_ROOT, "projects", "test01");
const RENDER_RESOLUTION = { width: 1280, height: 720 };
const TASK06_RENDER_RESOLUTIONS = [
  { label: "16x9", value: "1280x720", width: 1280, height: 720 },
  { label: "9x16", value: "1080x1920", width: 1080, height: 1920 },
] as const;
const FIXTURE_DURATION_S = 60;
const SUBTITLE_FORCE_STYLE = [
  "Fontname=Arial",
  "Fontsize=21",
  "PrimaryColour=&H00FFFFFF",
  "OutlineColour=&H00000000",
  "BackColour=&H00000000",
  "BorderStyle=1",
  "Outline=2",
  "Shadow=1",
  "Alignment=2",
  "MarginV=60",
].join(",");

type BackendHandle = {
  baseUrl: string;
  stop: () => Promise<void>;
};

type RenderFixture = {
  projectDir: string;
  projectId: string;
  srtPath: string;
  voicePath: string;
};

type RenderHistoryRow = {
  id: string;
  output_exists: boolean;
  output_path: string;
  preset: string | null;
  resolution: string | null;
  status: string;
};

type Cue = {
  end: number;
  index: number;
  lines: string[];
  start: number;
  text: string;
};

type RenderResolution = {
  height: number;
  width: number;
};

type Bounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type PngFrame = PNG & { data: Buffer };

test.describe("Render correctness E2E", () => {
  test("probes the test01 draft and verifies sampled frames", async ({}, testInfo) => {
    test.setTimeout(420_000);

    const backend = await startBackend(testInfo);
    try {
      const fixture = await prepareTest01Fixture(testInfo);
      await registerProject(backend.baseUrl, fixture.projectDir);
      const outputPath = await ensureDraftRender(backend.baseUrl, fixture.projectId, fixture.projectDir);

      const voiceDuration = await ffprobeDuration(fixture.voicePath);
      const outputProbe = await ffprobeJson(outputPath);
      expect(Math.abs(outputProbe.duration - voiceDuration), "render duration should match voice").toBeLessThanOrEqual(0.1);
      expect(outputProbe.video?.width).toBe(RENDER_RESOLUTION.width);
      expect(outputProbe.video?.height).toBe(RENDER_RESOLUTION.height);
      expect(outputProbe.audio, "audio stream should be present").toBeTruthy();
      expect(await hasFaststart(outputPath), "MP4 moov atom should precede mdat").toBe(true);

      const cues = await parseSrt(fixture.srtPath);
      expect(cues.length, "fixture should produce subtitle cues").toBeGreaterThan(0);

      const artifactPaths: string[] = [];
      for (const cue of cues) {
        const actualPath = testInfo.outputPath(`subtitle-${cue.index}-actual.png`);
        const expectedPath = testInfo.outputPath(`subtitle-${cue.index}-expected.png`);
        await extractFrame(outputPath, cue.start + 0.2, actualPath);
        await renderExpectedSubtitleFrame(fixture.srtPath, cue.start + 0.2, expectedPath);
        artifactPaths.push(actualPath, expectedPath);
        const similarity = await subtitleSimilarity(actualPath, expectedPath);
        expect(similarity, `subtitle cue ${cue.index} should match "${cue.text}"`).toBeGreaterThanOrEqual(0.85);
      }

      artifactPaths.push(
        ...(await assertBoundary(outputPath, testInfo, "foreground-start", 4.8, 5.2, undefined, 8, 3)),
        ...(await assertBoundary(outputPath, testInfo, "foreground-end", 14.9, 15.2, undefined, 8, 3)),
        ...(await assertBoundary(outputPath, testInfo, "background-bg1", 19.8, 20.2, undefined, 8, 3)),
        ...(await assertBoundary(outputPath, testInfo, "background-bg2", 39.8, 40.2, undefined, 8, 3)),
      );

      const pipMcArtifacts = await assertBoundary(
        outputPath,
        testInfo,
        "pip-mc-start",
        21.8,
        22.2,
        middleCellBounds(),
        4,
        2,
      );
      artifactPaths.push(...pipMcArtifacts);
      await assertPipPlacement(pipMcArtifacts[0], pipMcArtifacts[1], "MC");

      const pipTrArtifacts = await assertBoundary(
        outputPath,
        testInfo,
        "pip-tr-start",
        41.8,
        42.2,
        topRightCellBounds(),
        4,
        2,
      );
      artifactPaths.push(...pipTrArtifacts);
      await assertPipPlacement(pipTrArtifacts[0], pipTrArtifacts[1], "TR");

      artifactPaths.push(
        ...(await assertBoundary(outputPath, testInfo, "pip-mc-end", 31.9, 32.2, middleCellBounds(), 4, 2)),
        ...(await assertBoundary(outputPath, testInfo, "pip-tr-end", 51.9, 52.2, topRightCellBounds(), 4, 2)),
      );

      const uniqueArtifacts = [...new Set(artifactPaths)];
      for (const artifact of uniqueArtifacts) {
        if (!artifact.endsWith("-expected.png")) {
          await assertWatermarkPresent(artifact);
        }
        expect((await fs.stat(artifact)).size, `${path.basename(artifact)} should be captured`).toBeGreaterThan(0);
      }
    } finally {
      await backend.stop();
    }
  });

  test("renders max-20 subtitle wrapping in 16:9 and 9:16 outputs", async ({}, testInfo) => {
    test.setTimeout(420_000);

    const backend = await startBackend(testInfo);
    try {
      for (const resolution of TASK06_RENDER_RESOLUTIONS) {
        const fixture = await prepareMaxCharsSubtitleFixture(testInfo, resolution.label);
        await registerProject(backend.baseUrl, fixture.projectDir);
        const outputPath = await ensureDraftRender(
          backend.baseUrl,
          fixture.projectId,
          fixture.projectDir,
          resolution.value,
        );
        const probe = await ffprobeJson(outputPath);
        expect(probe.video?.width).toBe(resolution.width);
        expect(probe.video?.height).toBe(resolution.height);

        const cues = await parseSrt(fixture.srtPath);
        expect(cues, `${resolution.label} fixture should produce a subtitle cue`).toHaveLength(1);
        const cue = cues[0];
        expect(cue.lines).toEqual(["Capitalism begins", "here."]);
        expect(cue.lines.every((line) => line.length <= 20), `${resolution.label} SRT lines should honor max 20`).toBe(true);

        const actualPath = testInfo.outputPath(`task06-max20-${resolution.label}-actual.png`);
        const expectedPath = testInfo.outputPath(`task06-max20-${resolution.label}-expected.png`);
        await extractFrame(outputPath, cue.start + 0.8, actualPath);
        await renderExpectedSubtitleFrame(fixture.srtPath, cue.start + 0.8, expectedPath, resolution);
        const similarity = await subtitleSimilarity(actualPath, expectedPath, resolution);
        expect(similarity, `${resolution.label} rendered subtitle frame should match generated SRT wrapping`).toBeGreaterThanOrEqual(0.85);
      }
    } finally {
      await backend.stop();
    }
  });

  test("covers render route guards and editor gating in browser", async ({ page }) => {
    await preparePage(page, "dark");
    await installRenderGatingMocks(page);

    await page.goto("/render/not-project/r-existing");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/render/p_guard/not-a-render");
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/editor/p_new_aligned");
    const newFinalButton = page.getByRole("button", { name: /Render final \(ready\)/ });
    await expect(newFinalButton).toBeEnabled();
    await newFinalButton.click();
    await expect(page).toHaveURL(/\/render\/p_new_aligned\/r-new-aligned$/);

    await page.goto("/editor/p_rendered_clean");
    await expect(page.getByRole("button", { name: /Render draft \(disabled\)/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Render final \(disabled\)/ })).toBeDisabled();

    await page.goto("/editor/p_rendered_dirty");
    await expect(page.getByRole("button", { name: /Render draft \(ready\)/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /Render final \(ready\)/ })).toBeEnabled();
  });
});

async function startBackend(testInfo: TestInfo): Promise<BackendHandle> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const appDbPath = testInfo.outputPath("backend", "app.db");
  await fs.mkdir(path.dirname(appDbPath), { recursive: true });

  const child = spawn(PYTHON_EXE, ["-m", "server"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      VC_APP_DB_PATH: appDbPath,
      VC_DEBUG: "0",
      VC_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
  collectProcessLogs(child, logs);

  try {
    await waitForHealth(baseUrl, logs);
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
}

async function prepareTest01Fixture(testInfo: TestInfo): Promise<RenderFixture> {
  const fixtureRoot = testInfo.outputPath("fixture");
  const projectDir = path.join(fixtureRoot, "test01");
  const mediaDir = path.join(projectDir, "media");
  const vcDir = path.join(projectDir, ".vc");
  await fs.rm(fixtureRoot, { force: true, recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, "renders"), { recursive: true });
  await fs.mkdir(path.join(vcDir, "drafts"), { recursive: true });
  await fs.mkdir(path.join(vcDir, "clips"), { recursive: true });
  await fs.mkdir(path.join(vcDir, "logs"), { recursive: true });

  for (const name of ["bg0.png", "bg1.png", "bg2.png", "foreground.png"]) {
    await fs.copyFile(path.join(TEST01_SOURCE, name), path.join(mediaDir, name));
  }
  await fs.copyFile(path.join(TEST01_SOURCE, "PIP.png"), path.join(mediaDir, "pip.png"));

  const voicePath = path.join(projectDir, "voice.wav");
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path.join(TEST01_SOURCE, "voice.mp3"),
    "-t",
    String(FIXTURE_DURATION_S),
    "-ac",
    "2",
    "-ar",
    "48000",
    voicePath,
  ]);

  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=magenta:s=240x120",
    "-frames:v",
    "1",
    path.join(mediaDir, "watermark.png"),
  ]);

  const sentences = [
    { index: 1, text: "A clean subtitle appears here.", start_s: 1, end_s: 4, confidence_avg: 0.99 },
    { index: 2, text: "Picture in picture sits in the middle.", start_s: 24, end_s: 28, confidence_avg: 0.99 },
    { index: 3, text: "The watermark stays visible after the change.", start_s: 44, end_s: 48, confidence_avg: 0.99 },
  ];
  const words = sentences.flatMap((sentence) => wordsForSentence(sentence));
  const transcriptText = sentences.map((sentence) => sentence.text).join(" ");
  await fs.writeFile(path.join(projectDir, "transcript.txt"), transcriptText, "utf-8");
  const alignment = { cache_hit: true, sentences, words };
  await fs.writeFile(path.join(vcDir, "alignment.json"), `${JSON.stringify(alignment)}\n`, "utf-8");
  await fs.writeFile(path.join(vcDir, "alignment.hash"), await alignmentHash(voicePath, transcriptText), "utf-8");

  const now = new Date("2026-05-24T00:00:00.000Z").toISOString();
  const media = ["bg0.png", "bg1.png", "bg2.png", "foreground.png", "pip.png", "watermark.png"].map((name) => ({
    id: name,
    import_mode: "copy",
    imported_at: now,
    kind: name === "watermark.png" ? "watermark_image" : "image",
    name,
    path: `media/${name}`,
  }));
  const project = {
    audio: "voice.wav",
    created_at: now,
    layers: [
      { id: "subtitles", items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }], kind: "sub", name: "Subtitles" },
      {
        id: "pip-z3",
        items: [
          visualItem("pip-mc", "pip.png", 22, 32, { pip: { opacity: 100, posX: 50, posY: 50, radius: 0, size: 22 } }),
          visualItem("pip-tr", "pip.png", 42, 52, { pip: { opacity: 100, posX: 90, posY: 10, radius: 0, size: 22 } }),
        ],
        kind: "pip",
        name: "PiP",
      },
      { id: "fg-z2", items: [visualItem("fg-1", "foreground.png", 5, 15)], kind: "fg", name: "Foreground" },
      {
        id: "bg-z1",
        items: [
          visualItem("bg-0", "bg0.png", 0, 20, { crossfade: 0 }),
          visualItem("bg-1", "bg1.png", 20, 40, { crossfade: 0 }),
          visualItem("bg-2", "bg2.png", 40, 60, { crossfade: 0 }),
        ],
        kind: "bg",
        name: "Background",
      },
    ],
    media,
    name: "test01",
    output: { fps: 30, preset: "draft", resolution: "720p" },
    subtitles: {
      burn_in: true,
      style: { bg_style: "shadow", font: "Arial", max_chars_per_line: 42, position: "bottom", size: 36 },
    },
    transcript: { kind: "plain_text", path: "transcript.txt" },
    updated_at: now,
    version: 1,
    watermark: { mediaId: "watermark.png", opacity: 100, posX: 100, posY: 0, scale: 0.08 },
  };
  await fs.writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(project, null, 2)}\n`, "utf-8");

  return {
    projectDir,
    projectId: projectIdForPath(projectDir),
    srtPath: path.join(projectDir, "subtitles.srt"),
    voicePath,
  };
}

async function prepareMaxCharsSubtitleFixture(testInfo: TestInfo, label: string): Promise<RenderFixture> {
  const fixtureRoot = testInfo.outputPath(`task06-max20-${label}-fixture`);
  const projectDir = path.join(fixtureRoot, "subtitle-wrap");
  const vcDir = path.join(projectDir, ".vc");
  await fs.rm(fixtureRoot, { force: true, recursive: true });
  await fs.mkdir(path.join(vcDir, "drafts"), { recursive: true });
  await fs.mkdir(path.join(vcDir, "clips"), { recursive: true });
  await fs.mkdir(path.join(vcDir, "logs"), { recursive: true });
  await fs.mkdir(path.join(projectDir, "renders"), { recursive: true });

  const voicePath = path.join(projectDir, "voice.wav");
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=4",
    "-ac",
    "2",
    "-ar",
    "48000",
    voicePath,
  ]);

  const sentence = { index: 1, text: "Capitalism begins here.", start_s: 0.5, end_s: 3.0, confidence_avg: 0.99 };
  const transcriptText = sentence.text;
  await fs.writeFile(path.join(projectDir, "transcript.txt"), transcriptText, "utf-8");
  const alignment = { cache_hit: true, sentences: [sentence], words: wordsForSentence(sentence) };
  await fs.writeFile(path.join(vcDir, "alignment.json"), `${JSON.stringify(alignment)}\n`, "utf-8");
  await fs.writeFile(path.join(vcDir, "alignment.hash"), await alignmentHash(voicePath, transcriptText), "utf-8");

  const now = new Date("2026-06-05T00:00:00.000Z").toISOString();
  const project = {
    audio: "voice.wav",
    created_at: now,
    layers: [
      { id: "subtitles", items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }], kind: "sub", name: "Subtitles" },
    ],
    media: [],
    name: `subtitle-wrap-${label}`,
    output: { fps: 30, preset: "draft", resolution: "720p" },
    subtitles: {
      burn_in: true,
      style: { bg_style: "shadow", font: "Arial", max_chars_per_line: 20, position: "bottom", size: 36 },
    },
    transcript: { kind: "plain_text", path: "transcript.txt" },
    updated_at: now,
    version: 1,
    watermark: null,
  };
  await fs.writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(project, null, 2)}\n`, "utf-8");

  return {
    projectDir,
    projectId: projectIdForPath(projectDir),
    srtPath: path.join(projectDir, "subtitles.srt"),
    voicePath,
  };
}

function visualItem(id: string, mediaId: string, start: number, end: number, extra: Record<string, unknown> = {}) {
  return {
    cache_status: "cold",
    id,
    mediaId,
    motion: { easing: "linear", kind: "none" },
    sentences: [1, 1],
    start,
    end,
    transitions: { in: "cut", out: "cut" },
    ...extra,
  };
}

function wordsForSentence(sentence: { index: number; text: string; start_s: number; end_s: number }) {
  const rawWords = sentence.text.split(/\s+/);
  const step = (sentence.end_s - sentence.start_s) / rawWords.length;
  return rawWords.map((word, index) => ({
    confidence: 0.99,
    end_s: sentence.start_s + step * (index + 1),
    sentence_index: sentence.index,
    start_s: sentence.start_s + step * index,
    text: word,
  }));
}

async function registerProject(baseUrl: string, projectDir: string): Promise<void> {
  const response = await fetch(`${baseUrl}/projects/open`, {
    body: JSON.stringify({ path: projectDir }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  await expectResponseOk(response);
}

async function ensureDraftRender(
  baseUrl: string,
  projectId: string,
  projectDir: string,
  resolution = "1280x720",
): Promise<string> {
  const reusable = await latestSuccessfulDraft(baseUrl, projectId, resolution);
  if (reusable) return reusable;

  const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(projectId)}/render?preset=draft&resolution=${encodeURIComponent(resolution)}`, {
    method: "POST",
  });
  await expectResponseOk(response);
  const body = (await response.json()) as { output_path: string; render_id: string };
  const row = await waitForRender(baseUrl, projectId, body.render_id);
  expect(row.output_exists, `render output should exist for ${body.render_id}`).toBe(true);
  expect(path.resolve(row.output_path).startsWith(path.resolve(projectDir, ".vc", "drafts"))).toBe(true);
  return row.output_path;
}

async function latestSuccessfulDraft(baseUrl: string, projectId: string, resolution = "1280x720"): Promise<string | null> {
  const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(projectId)}/history`);
  if (!response.ok) return null;
  const rows = (await response.json()) as RenderHistoryRow[];
  const row = rows.find((entry) =>
    entry.output_exists
    && entry.preset === "draft"
    && entry.resolution === resolution
    && ["done", "rendered"].includes(entry.status)
  );
  return row?.output_path ?? null;
}

async function expectResponseOk(response: Response): Promise<void> {
  if (response.ok) return;
  throw new Error(`HTTP ${response.status}: ${await response.text()}`);
}

async function waitForRender(baseUrl: string, projectId: string, renderId: string): Promise<RenderHistoryRow> {
  const deadline = Date.now() + 330_000;
  let lastRow: RenderHistoryRow | undefined;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(projectId)}/history`);
    await expectResponseOk(response);
    const rows = (await response.json()) as RenderHistoryRow[];
    lastRow = rows.find((row) => row.id === renderId);
    if (lastRow && ["done", "rendered"].includes(lastRow.status)) return lastRow;
    if (lastRow && ["failed", "cancelled", "output_missing", "ffmpeg_fatal_error"].includes(lastRow.status)) {
      throw new Error(`Render ${renderId} finished with ${lastRow.status}`);
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for render ${renderId}; last row: ${JSON.stringify(lastRow)}`);
}

async function assertBoundary(
  videoPath: string,
  testInfo: TestInfo,
  label: string,
  beforeTime: number,
  afterTime: number,
  bounds?: Bounds,
  minHashDistance = 8,
  minMeanDiff = 3,
): Promise<[string, string]> {
  const beforePath = testInfo.outputPath(`${label}-before.png`);
  const afterPath = testInfo.outputPath(`${label}-after.png`);
  await extractFrame(videoPath, beforeTime, beforePath);
  await extractFrame(videoPath, afterTime, afterPath);
  const before = await readPng(beforePath);
  const after = await readPng(afterPath);
  const distance = hammingDistance(perceptualHash(before, bounds), perceptualHash(after, bounds));
  const meanDiff = meanAbsoluteDifference(before, after, bounds);
  expect(distance, `${label} perceptual hash distance`).toBeGreaterThanOrEqual(minHashDistance);
  expect(meanDiff, `${label} mean pixel diff`).toBeGreaterThanOrEqual(minMeanDiff);
  return [beforePath, afterPath];
}

async function assertPipPlacement(beforePath: string, afterPath: string, expectedCell: "MC" | "TR"): Promise<void> {
  const before = await readPng(beforePath);
  const after = await readPng(afterPath);
  const bbox = diffBoundingBox(before, after, 28);
  expect(bbox, `${expectedCell} PiP diff box`).toBeTruthy();
  if (!bbox) return;
  const centerX = bbox.x + bbox.width / 2;
  const centerY = bbox.y + bbox.height / 2;
  if (expectedCell === "MC") {
    expect(centerX).toBeGreaterThan(RENDER_RESOLUTION.width / 3);
    expect(centerX).toBeLessThan((RENDER_RESOLUTION.width * 2) / 3);
    expect(centerY).toBeGreaterThan(RENDER_RESOLUTION.height / 3);
    expect(centerY).toBeLessThan((RENDER_RESOLUTION.height * 2) / 3);
    expect(bbox.x, "MC PiP should not use an edge margin").toBeGreaterThan(120);
    expect(bbox.y, "MC PiP should not use an edge margin").toBeGreaterThan(80);
    expect(bbox.x + bbox.width, "MC PiP should not touch right edge").toBeLessThan(RENDER_RESOLUTION.width - 120);
    expect(bbox.y + bbox.height, "MC PiP should not touch bottom edge").toBeLessThan(RENDER_RESOLUTION.height - 80);
    return;
  }
  expect(centerX).toBeGreaterThan((RENDER_RESOLUTION.width * 2) / 3);
  expect(centerY).toBeLessThan(RENDER_RESOLUTION.height / 3);
}

async function assertWatermarkPresent(framePath: string): Promise<void> {
  const frame = await readPng(framePath);
  const region = {
    height: 90,
    width: 120,
    x: RENDER_RESOLUTION.width - 122,
    y: 0,
  };
  let magentaPixels = 0;
  let total = 0;
  forEachPixel(frame, region, (r, g, b) => {
    total += 1;
    if (r > 180 && g < 110 && b > 180) magentaPixels += 1;
  });
  expect(magentaPixels / total, `watermark signature in ${path.basename(framePath)}`).toBeGreaterThan(0.12);
}

async function subtitleSimilarity(
  actualPath: string,
  expectedPath: string,
  resolution: RenderResolution = RENDER_RESOLUTION,
): Promise<number> {
  const actual = await readPng(actualPath);
  const expected = await readPng(expectedPath);
  let maskPixels = 0;
  let matchedPixels = 0;
  const region = {
    height: Math.round(resolution.height * 0.45),
    width: resolution.width,
    x: 0,
    y: Math.round(resolution.height * 0.55),
  };
  forEachPixel(expected, region, (r, g, b, _a, x, y) => {
    if (brightness(r, g, b) < 160) return;
    maskPixels += 1;
    const actualOffset = (actual.width * y + x) << 2;
    if (brightness(actual.data[actualOffset], actual.data[actualOffset + 1], actual.data[actualOffset + 2]) >= 120) {
      matchedPixels += 1;
    }
  });
  expect(maskPixels, "expected subtitle mask should contain text pixels").toBeGreaterThan(80);
  return matchedPixels / maskPixels;
}

async function extractFrame(videoPath: string, seconds: number, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-ss",
    seconds.toFixed(3),
    "-frames:v",
    "1",
    outputPath,
  ]);
}

async function renderExpectedSubtitleFrame(
  srtPath: string,
  seconds: number,
  outputPath: string,
  resolution: RenderResolution = RENDER_RESOLUTION,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=black:s=${resolution.width}x${resolution.height}:r=30:d=${FIXTURE_DURATION_S}`,
    "-ss",
    seconds.toFixed(3),
    "-frames:v",
    "1",
    "-vf",
    `subtitles='${escapeSubtitlePath(srtPath)}':original_size=${resolution.width}x${resolution.height}:force_style='${SUBTITLE_FORCE_STYLE}'`,
    outputPath,
  ]);
}

async function parseSrt(srtPath: string): Promise<Cue[]> {
  const content = await fs.readFile(srtPath, "utf-8");
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\n+/).filter((block) => block.trim());
  return blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const index = Number(lines[0]);
    const [startRaw, endRaw] = lines[1].split(/\s+-->\s+/);
    const cueLines = lines.slice(2);
    return {
      end: parseSrtTime(endRaw),
      index,
      lines: cueLines,
      start: parseSrtTime(startRaw),
      text: cueLines.join(" "),
    };
  });
}

function parseSrtTime(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
  const [, hours, minutes, seconds, millis] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

async function ffprobeDuration(filePath: string): Promise<number> {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return Number(result.stdout.trim());
}

async function ffprobeJson(filePath: string): Promise<{ audio?: Record<string, unknown>; duration: number; video?: Record<string, unknown> }> {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-print_format",
    "json",
    filePath,
  ]);
  const payload = JSON.parse(result.stdout) as { format?: { duration?: string }; streams?: Array<Record<string, unknown>> };
  const streams = payload.streams ?? [];
  return {
    audio: streams.find((stream) => stream.codec_type === "audio"),
    duration: Number(payload.format?.duration ?? 0),
    video: streams.find((stream) => stream.codec_type === "video"),
  };
}

async function hasFaststart(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const limit = Math.min(stat.size, 1024 * 1024);
    const buffer = Buffer.alloc(limit);
    await handle.read(buffer, 0, limit, 0);
    let offset = 0;
    let seenMdat = false;
    while (offset + 8 <= limit) {
      const atomSize = buffer.readUInt32BE(offset);
      const atomType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
      if (atomSize < 8) return false;
      if (atomType === "moov") return !seenMdat;
      if (atomType === "mdat") seenMdat = true;
      offset += atomSize;
    }
    return false;
  } finally {
    await handle.close();
  }
}

function perceptualHash(frame: PngFrame, bounds: Bounds = { height: frame.height, width: frame.width, x: 0, y: 0 }): bigint {
  const size = 16;
  const samples: number[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(bounds.x + bounds.width - 1, bounds.x + Math.floor((x / size) * bounds.width));
      const sy = Math.min(bounds.y + bounds.height - 1, bounds.y + Math.floor((y / size) * bounds.height));
      const offset = (frame.width * sy + sx) << 2;
      samples.push(brightness(frame.data[offset], frame.data[offset + 1], frame.data[offset + 2]));
    }
  }
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return samples.reduce((hash, value, index) => (value >= avg ? hash | (1n << BigInt(index)) : hash), 0n);
}

function hammingDistance(left: bigint, right: bigint): number {
  let value = left ^ right;
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function meanAbsoluteDifference(left: PngFrame, right: PngFrame, bounds: Bounds = { height: left.height, width: left.width, x: 0, y: 0 }): number {
  let total = 0;
  let count = 0;
  forEachPixel(left, bounds, (r, g, b, _a, x, y) => {
    const offset = (right.width * y + x) << 2;
    total += Math.abs(r - right.data[offset]) + Math.abs(g - right.data[offset + 1]) + Math.abs(b - right.data[offset + 2]);
    count += 3;
  });
  return total / count;
}

function diffBoundingBox(left: PngFrame, right: PngFrame, threshold: number): Bounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  forEachPixel(left, { height: left.height, width: left.width, x: 0, y: 0 }, (r, g, b, _a, x, y) => {
    const offset = (right.width * y + x) << 2;
    const delta = Math.abs(r - right.data[offset]) + Math.abs(g - right.data[offset + 1]) + Math.abs(b - right.data[offset + 2]);
    if (delta <= threshold) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  if (maxX < 0 || maxY < 0) return null;
  return { height: maxY - minY + 1, width: maxX - minX + 1, x: minX, y: minY };
}

function forEachPixel(
  frame: PngFrame,
  bounds: Bounds,
  visit: (r: number, g: number, b: number, a: number, x: number, y: number) => void,
): void {
  const maxY = Math.min(frame.height, bounds.y + bounds.height);
  const maxX = Math.min(frame.width, bounds.x + bounds.width);
  for (let y = Math.max(0, bounds.y); y < maxY; y += 1) {
    for (let x = Math.max(0, bounds.x); x < maxX; x += 1) {
      const offset = (frame.width * y + x) << 2;
      visit(frame.data[offset], frame.data[offset + 1], frame.data[offset + 2], frame.data[offset + 3], x, y);
    }
  }
}

function brightness(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function middleCellBounds(): Bounds {
  return {
    height: Math.round(RENDER_RESOLUTION.height / 3),
    width: Math.round(RENDER_RESOLUTION.width / 3),
    x: Math.round(RENDER_RESOLUTION.width / 3),
    y: Math.round(RENDER_RESOLUTION.height / 3),
  };
}

function topRightCellBounds(): Bounds {
  return {
    height: Math.round(RENDER_RESOLUTION.height / 3),
    width: Math.round(RENDER_RESOLUTION.width / 3),
    x: Math.round((RENDER_RESOLUTION.width * 2) / 3),
    y: 0,
  };
}

async function readPng(filePath: string): Promise<PngFrame> {
  return PNG.sync.read(await fs.readFile(filePath)) as PngFrame;
}

async function alignmentHash(voicePath: string, transcriptText: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(voicePath));
  hash.update("\n---\n");
  hash.update(transcriptText, "utf-8");
  return hash.digest("hex");
}

function projectIdForPath(projectDir: string): string {
  return `p_${createHash("sha256").update(path.resolve(projectDir).toLowerCase()).digest("hex").slice(0, 24)}`;
}

function escapeSubtitlePath(srtPath: string): string {
  return path.resolve(srtPath).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function installRenderGatingMocks(page: Page): Promise<void> {
  await page.route("**/api/server/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace(/^\/api\/server/, "");
    const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ? decodeURIComponent(pathname.match(/^\/projects\/([^/]+)/)![1]) : "";
    if (pathname.endsWith("/config") && request.method() === "GET") {
      await route.fulfill({ json: configResponse(projectId) });
      return;
    }
    if (pathname.endsWith("/config") && request.method() === "PUT") {
      await route.fulfill({ json: { config_hash: `${projectId}-next`, has_unrendered_changes: true, project_id: projectId, saved_at: new Date().toISOString() } });
      return;
    }
    if (pathname.endsWith("/alignment") && request.method() === "GET") {
      await route.fulfill({
        json: {
          cache_hit: true,
          sentences: [{ confidence_avg: 0.99, end_s: 4, index: 1, start_s: 0, text: "One aligned sentence." }],
          words: [],
        },
      });
      return;
    }
    if (pathname.endsWith("/inspect") && request.method() === "POST") {
      await route.fulfill({ json: { path: `E:/video-projects/${projectId}` } });
      return;
    }
    if (pathname.endsWith("/render-cache")) {
      await route.fulfill({ json: { cached_count: 0, project_id: projectId, state: "cold", total_count: 0 } });
      return;
    }
    if (pathname.endsWith("/render") && request.method() === "POST") {
      await route.fulfill({ json: { output_path: "E:/video-projects/test01/.vc/drafts/r-new-aligned.mp4", render_id: "r-new-aligned" } });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

function configResponse(projectId: string) {
  const rendered = projectId === "p_rendered_clean";
  const dirty = projectId === "p_rendered_dirty";
  const configHash = rendered || dirty ? "rendered-hash" : "new-project-hash";
  return {
    config: {
      audio: "voice.wav",
      layers: [{ id: "subtitles", items: [{ auto: true, id: "sub-auto", label: "Auto subtitles", style: "default" }], kind: "sub", name: "Subtitles" }],
      name: projectId.replace(/^p_/, ""),
      output: { preset: "draft", resolution: "720p" },
      subtitles: null,
      transcript: { kind: "plain_text", path: "transcript.txt" },
      version: 1,
      watermark: null,
    },
    config_hash: dirty ? "dirty-hash" : configHash,
    has_unrendered_changes: dirty,
    last_rendered_config_hash: rendered || dirty ? "rendered-hash" : null,
    project_id: projectId,
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("No free TCP port returned.")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, logs: string[]): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Wait for uvicorn to bind.
    }
    await delay(250);
  }
  throw new Error(`Backend did not become healthy. Logs:\n${logs.join("\n")}`);
}

function collectProcessLogs(child: ChildProcessWithoutNullStreams, logs: string[]): void {
  const append = (chunk: Buffer) => {
    logs.push(chunk.toString("utf-8").trim());
    while (logs.join("\n").length > 12_000) logs.shift();
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
}

function run(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${stderr}`));
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
