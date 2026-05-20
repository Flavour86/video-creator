import { expect, test } from "@playwright/test";
import {
  expectStepDone,
  makeUpload,
  mockLauncherApi,
  mockSetupApi,
  nowMinusMinutes,
  preparePage,
  projectCard,
  projectsPage,
  setupDraft,
  stepDoneLocator,
  type ThemeMode,
} from "./e2e-utils";

test.describe("Launcher Task 11 flows", () => {
  test.describe.configure({ mode: "serial" });

  test("Flow 1 - Launcher empty state to Setup entry", async ({ page }) => {
    await preparePage(page, "dark");

    const setupState = await mockSetupApi(page, {
      draft: setupDraft(),
    });
    await mockLauncherApi(page, {
      byPageIndex: {
        0: projectsPage([], 0, 0),
      },
    });

    await page.goto("/launcher");
    await expect(page.getByText("Local workspace")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);

    await enterSetupFromLauncher(page);
    await expect(page.getByText("New project")).toBeVisible();
    await expect(page.getByRole("heading", { name: "SetUp" })).toBeVisible();

    await leaveSetupToLauncher(page);
    expect(setupState.createProjectCalls).toBe(0);
  });

  test("Flow 2 - Launcher populated state, pagination, preview modal, editor navigation", async ({ page }) => {
    await preparePage(page, "dark");

    const page1Items = [
      projectCard({
        project_id: "p_a",
        name: "Newest Rendered",
        alignment_state: "aligned",
        has_unrendered_changes: false,
        last_render_at: nowMinusMinutes(20),
        latest_render_id: "r_a",
        latest_render_status: "done",
        media_count: 19,
        render_status_tag: "rendered",
        sentence_count: 118,
        thumbnail_path: "/projects/p_a/thumb.jpg",
        voice_duration: "08:22",
      }),
      projectCard({
        project_id: "p_b",
        name: "Rendering Job",
        alignment_state: "pending",
        has_unrendered_changes: true,
        last_render_at: nowMinusMinutes(90),
        latest_render_id: null,
        latest_render_status: "running",
        media_count: 5,
        render_status_tag: "rendering",
        sentence_count: 31,
        voice_duration: "02:10",
      }),
      projectCard({
        project_id: "p_c",
        name: "Failed Output",
        alignment_state: "missing",
        has_unrendered_changes: true,
        last_render_at: nowMinusMinutes(190),
        latest_render_id: null,
        latest_render_status: "error",
        media_count: 8,
        render_status_tag: "failed",
        sentence_count: 44,
        voice_duration: "03:17",
      }),
    ];
    const page2Items = [
      projectCard({
        project_id: "p_d",
        name: "Second Page One",
        alignment_state: "pending",
        has_unrendered_changes: false,
        last_render_at: nowMinusMinutes(300),
        media_count: 4,
        render_status_tag: "unrendered",
        sentence_count: 12,
        voice_duration: "01:00",
      }),
      projectCard({
        project_id: "p_e",
        name: "Second Page Two",
        alignment_state: "aligned",
        has_unrendered_changes: false,
        last_render_at: nowMinusMinutes(400),
        media_count: 9,
        render_status_tag: "queued",
        sentence_count: 57,
        voice_duration: "04:05",
      }),
    ];

    await mockLauncherApi(page, {
      byPageIndex: {
        0: projectsPage(page1Items, 0, 2),
        1: projectsPage(page2Items, 1, 2),
      },
    });

    await page.goto("/launcher");
    const cards = page.locator("article");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText("Newest Rendered");
    await expect(cards.nth(1)).toContainText("Rendering Job");
    await expect(cards.nth(2)).toContainText("Failed Output");

    const firstRendered = cards.nth(0);
    await expect(firstRendered.getByRole("img", { name: "Newest Rendered thumbnail" })).toBeVisible();
    await expect(firstRendered).toContainText("08:22");
    await expect(firstRendered).toContainText("118");
    await expect(firstRendered).toContainText("19");
    await expect(page.getByText("E:/video-projects", { exact: false })).toHaveCount(0);

    await page.getByRole("button", { name: "Preview Newest Rendered" }).click();
    const previewDialog = page.getByRole("dialog", { name: "Preview Newest Rendered" });
    await expect(previewDialog).toBeVisible();
    const previewVideo = previewDialog.getByLabel("Video preview for Newest Rendered");
    await expect(previewVideo).toBeVisible();
    await expect(previewVideo).toHaveAttribute("src", /\/api\/server\/projects\/p_a\/renders\/r_a\/file$/);
    await expect(
      previewVideo.evaluate(async (node) => {
        const video = node as HTMLVideoElement;
        video.muted = true;
        try {
          await video.play();
          return !video.paused;
        } catch {
          return video.src.length > 0;
        }
      }),
    ).resolves.toBe(true);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(previewDialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Recent projects" })).toBeVisible();

    const pagination = page.getByRole("navigation", { name: "Recent projects pagination" });
    await pagination.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Second Page One")).toBeVisible();
    await expect(page.getByText("Second Page Two")).toBeVisible();
    await expect(page.getByText("Newest Rendered")).toHaveCount(0);

    await pagination.getByRole("button", { name: "Previous" }).click();
    await expect(page.getByText("Newest Rendered")).toBeVisible();
    await expect(cards.nth(0)).toContainText("Newest Rendered");

    await openEditorFromLauncher(page, "Newest Rendered", "p_a");
  });

  test("Flow 3 - Setup happy path from start to project creation", async ({ page }) => {
    await preparePage(page, "dark");

    const state = await mockSetupApi(page, {
      alignmentSequence: [
        {
          ok: true,
          value: {
            audio_duration: 75,
            cache_hit: false,
            device: "cuda fp16",
            hash: "abc12345",
            model: "large-v3",
            status: "aligned",
          },
        },
      ],
      createProjectId: "p_flow3",
      draft: setupDraft({ output_preset: "draft" }),
      onTranscriptUpload: (setupState) => {
        setupState.draft = {
          ...setupState.draft,
          transcript: {
            path: "transcript.txt",
            sentence_count: 13,
            state: "parsed",
          },
        };
      },
      onVoiceUpload: (setupState) => {
        setupState.draft = {
          ...setupState.draft,
          alignment: { ...setupState.draft.alignment, status: "pending" },
          subtitle_generation: {
            cache_state: "unknown",
            cue_count: 0,
            error_message: null,
            status: "ready",
            total_duration_s: 0,
          },
          voice: {
            channels: 2,
            codec: "pcm_s16le",
            duration: 75,
            path: "voice.wav",
            sample_rate: 48000,
            state: "copied",
          },
        };
      },
      subtitleSequence: [
        {
          ok: true,
          value: {
            cache_state: "miss",
            cue_count: 13,
            error_message: null,
            status: "succeeded",
            total_duration_s: 75,
          },
        },
      ],
    });
    await mockLauncherApi(page, {
      byPageIndex: {
        0: projectsPage([], 0, 0),
      },
    });

    await page.goto("/launcher");
    await enterSetupFromLauncher(page);

    await expect(stepDoneLocator(page, "Project Name")).toHaveCount(0);
    await expect(stepDoneLocator(page, "Voice")).toHaveCount(0);
    await expect(stepDoneLocator(page, "Subtitle")).toHaveCount(0);
    await expect(stepDoneLocator(page, "Alignment")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create project" })).toBeDisabled();

    await page.getByLabel("Project name").fill("Flow Three");
    await page.getByRole("combobox", { name: "Output preset" }).selectOption("final");
    await expectStepDone(page, "Project Name");

    await page.locator('input[accept=".mp3,.wav,.m4a"]').setInputFiles(
      makeUpload("voice.wav", "audio/wav", "valid wav audio"),
    );
    await expectStepDone(page, "Voice");
    await expect(page.getByText("selected").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subtitle Alignment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run alignment API" })).toHaveCount(0);

    await page.getByRole("button", { name: "Generate subtitle" }).click();
    await expect(page.getByText("running").first()).toBeVisible();
    await expect(page.getByText("13 subtitles", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subtitle Alignment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run alignment API" })).toBeDisabled();
    await expectStepDone(page, "Subtitle");

    await page.locator('input[accept=".txt,.md,.srt"]').setInputFiles(
      makeUpload("transcript.txt", "text/plain", "hello world"),
    );
    await expect(page.getByRole("button", { name: "Run alignment API" })).toBeEnabled();
    await page.getByRole("button", { name: "Run alignment API" }).click();
    await expect(page.getByText("Alignment finished. 4 subtitle updates applied.")).toBeVisible();
    await expectStepDone(page, "Alignment");

    const createButton = page.getByRole("button", { name: "Create project" });
    await expect(createButton).toBeEnabled();

    await createButton.click();
    expect(state.createProjectCalls).toBe(1);
    expect(state.createProjectSnapshot?.output_preset).toBe("final");
    await expectEditorNavigationOrGoto(page, "p_flow3");
  });

  test("Flow 4 - Setup validation/failure recovery", async ({ page }) => {
    await preparePage(page, "dark");

    let voiceUploads = 0;
    const state = await mockSetupApi(page, {
      alignmentSequence: [
        { ok: false, message: "Alignment failed on first run." },
        {
          ok: true,
          value: {
            audio_duration: 90,
            cache_hit: false,
            device: "cpu",
            hash: "hash_ok",
            model: "large-v3",
            status: "aligned",
          },
        },
      ],
      draft: setupDraft(),
      onTranscriptUpload: (setupState) => {
        setupState.draft = {
          ...setupState.draft,
          transcript: {
            path: "transcript.txt",
            sentence_count: 7,
            state: "parsed",
          },
        };
      },
      onVoiceUpload: (setupState) => {
        voiceUploads += 1;
        if (voiceUploads === 1) {
          setupState.draft = {
            ...setupState.draft,
            voice: {
              channels: 0,
              codec: "unsupported",
              duration: 0,
              path: "broken.txt",
              sample_rate: 0,
              state: "invalid",
            },
          };
          return;
        }
        setupState.draft = {
          ...setupState.draft,
          alignment: { ...setupState.draft.alignment, status: "pending" },
          subtitle_generation: {
            cache_state: "unknown",
            cue_count: 0,
            error_message: null,
            status: "ready",
            total_duration_s: 0,
          },
          voice: {
            channels: 2,
            codec: "pcm_s16le",
            duration: 90,
            path: "voice.wav",
            sample_rate: 48000,
            state: "copied",
          },
        };
      },
      subtitleSequence: [
        { ok: false, message: "Subtitle generation failed." },
        {
          ok: true,
          value: {
            cache_state: "miss",
            cue_count: 7,
            error_message: null,
            status: "succeeded",
            total_duration_s: 90,
          },
        },
      ],
    });
    await mockLauncherApi(page, {
      byPageIndex: {
        0: projectsPage([], 0, 0),
      },
    });

    await page.goto("/setup");

    await page.getByLabel("Project name").fill("Flow Four");
    await expectStepDone(page, "Project Name");

    await page.locator('input[accept=".mp3,.wav,.m4a"]').setInputFiles(
      makeUpload("broken.txt", "text/plain", "bad"),
    );
    await expect(page.getByText("failed").first()).toBeVisible();
    await expect(stepDoneLocator(page, "Voice")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Generate subtitle" })).toBeDisabled();

    await page.locator('input[accept=".mp3,.wav,.m4a"]').setInputFiles(
      makeUpload("voice.wav", "audio/wav", "valid"),
    );
    await expectStepDone(page, "Voice");

    await page.getByRole("button", { name: "Generate subtitle" }).click();
    await expect(page.getByText("Subtitle generation failed.")).toBeVisible();
    await expect(stepDoneLocator(page, "Subtitle")).toHaveCount(0);
    await expect(page.getByText("subtitle.srt", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Subtitle Alignment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run alignment API" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Generate subtitle" })).toBeEnabled();

    await page.getByRole("button", { name: "Generate subtitle" }).click();
    await expect(page.getByText("7 subtitles", { exact: false })).toBeVisible();
    await expectStepDone(page, "Subtitle");

    await page.locator('input[accept=".txt,.md,.srt"]').setInputFiles(
      makeUpload("transcript.txt", "text/plain", "transcript"),
    );
    await page.getByRole("button", { name: "Run alignment API" }).click();
    await expect(page.getByText("Alignment failed on first run.")).toBeVisible();
    await expect(stepDoneLocator(page, "Alignment")).toHaveCount(0);

    await page.getByRole("button", { name: "Run alignment API" }).click();
    await expect(page.getByText("Alignment finished. 4 subtitle updates applied.")).toBeVisible();
    await expectStepDone(page, "Alignment");
    await expect(page.getByRole("button", { name: "Create project" })).toBeEnabled();
    expect(state.subtitleCalls).toBe(2);
    expect(state.alignmentCalls).toBe(2);
  });

  test("Flow 5 - Dependency reset behavior after upstream input changes", async ({ page }) => {
    await preparePage(page, "dark");

    let voiceUploads = 0;
    let transcriptUploads = 0;
    await mockSetupApi(page, {
      alignmentSequence: [
        {
          ok: true,
          value: {
            audio_duration: 120,
            cache_hit: false,
            device: "cuda fp16",
            hash: "align_1",
            model: "large-v3",
            status: "aligned",
          },
        },
        {
          ok: true,
          value: {
            audio_duration: 125,
            cache_hit: false,
            device: "cuda fp16",
            hash: "align_2",
            model: "large-v3",
            status: "aligned",
          },
        },
        {
          ok: true,
          value: {
            audio_duration: 125,
            cache_hit: false,
            device: "cuda fp16",
            hash: "align_3",
            model: "large-v3",
            status: "aligned",
          },
        },
      ],
      draft: setupDraft({ name: "Flow Five" }),
      onTranscriptUpload: (setupState) => {
        transcriptUploads += 1;
        setupState.draft = {
          ...setupState.draft,
          alignment: transcriptUploads === 1
            ? setupState.draft.alignment
            : { ...setupState.draft.alignment, status: "pending" },
          transcript: {
            path: "transcript.txt",
            sentence_count: transcriptUploads === 1 ? 12 : 15,
            state: "parsed",
          },
        };
      },
      onVoiceUpload: (setupState) => {
        voiceUploads += 1;
        setupState.draft = {
          ...setupState.draft,
          alignment: voiceUploads === 1
            ? setupState.draft.alignment
            : { ...setupState.draft.alignment, status: "pending" },
          subtitle_generation: voiceUploads === 1
            ? setupState.draft.subtitle_generation
            : {
              cache_state: "unknown",
              cue_count: 0,
              error_message: null,
              status: "ready",
              total_duration_s: 0,
            },
          voice: {
            channels: 2,
            codec: "pcm_s16le",
            duration: voiceUploads === 1 ? 120 : 125,
            path: voiceUploads === 1 ? "voice-a.wav" : "voice-b.wav",
            sample_rate: 48000,
            state: "copied",
          },
        };
      },
      subtitleSequence: [
        {
          ok: true,
          value: {
            cache_state: "miss",
            cue_count: 12,
            error_message: null,
            status: "succeeded",
            total_duration_s: 120,
          },
        },
        {
          ok: true,
          value: {
            cache_state: "miss",
            cue_count: 15,
            error_message: null,
            status: "succeeded",
            total_duration_s: 125,
          },
        },
      ],
    });

    await page.goto("/setup");
    await expectStepDone(page, "Project Name");

    await page.locator('input[accept=".mp3,.wav,.m4a"]').setInputFiles(makeUpload("voice-a.wav", "audio/wav", "a"));
    await expect(page.getByRole("heading", { name: "Subtitle Alignment" })).toHaveCount(0);
    await page.getByRole("button", { name: "Generate subtitle" }).click();
    await page.locator('input[accept=".txt,.md,.srt"]').setInputFiles(makeUpload("transcript-a.txt", "text/plain", "a"));
    await page.getByRole("button", { name: "Run alignment API" }).click();
    await expectStepDone(page, "Voice");
    await expectStepDone(page, "Subtitle");
    await expectStepDone(page, "Alignment");
    await expect(page.getByRole("button", { name: "Create project" })).toBeEnabled();

    await page.locator('input[accept=".mp3,.wav,.m4a"]').setInputFiles(makeUpload("voice-b.wav", "audio/wav", "b"));
    await expect(stepDoneLocator(page, "Subtitle")).toHaveCount(0);
    await expect(stepDoneLocator(page, "Alignment")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create project" })).toBeDisabled();

    await page.getByRole("button", { name: "Generate subtitle" }).click();
    await page.getByRole("button", { name: "Run alignment API" }).click();
    await expectStepDone(page, "Subtitle");
    await expectStepDone(page, "Alignment");

    await page.locator('input[accept=".txt,.md,.srt"]').setInputFiles(makeUpload("transcript-b.txt", "text/plain", "b"));
    await expectStepDone(page, "Subtitle");
    await expect(stepDoneLocator(page, "Alignment")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create project" })).toBeDisabled();

    await page.getByRole("button", { name: "Run alignment API" }).click();
    await expectStepDone(page, "Alignment");
    await expect(page.getByRole("button", { name: "Create project" })).toBeEnabled();
  });

  test("Flow 6 - Theme/actionability smoke (dark and light)", async ({ browser }, testInfo) => {
    const themes: ThemeMode[] = ["dark", "light"];

    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await preparePage(page, theme);

      await mockSetupApi(page, {
        alignmentSequence: [
          {
            ok: true,
            value: {
              audio_duration: 60,
              cache_hit: false,
              device: "cuda fp16",
              hash: `${theme}_hash`,
              model: "large-v3",
              status: "aligned",
            },
          },
        ],
        createProjectId: `p_${theme}`,
        draft: setupDraft(),
        onTranscriptUpload: (setupState) => {
          setupState.draft = {
            ...setupState.draft,
            transcript: {
              path: "transcript.txt",
              sentence_count: 8,
              state: "parsed",
            },
          };
        },
        onVoiceUpload: (setupState) => {
          setupState.draft = {
            ...setupState.draft,
            voice: {
              channels: 2,
              codec: "pcm_s16le",
              duration: 60,
              path: "voice.wav",
              sample_rate: 48000,
              state: "copied",
            },
          };
        },
        subtitleSequence: [
          {
            ok: true,
            value: {
              cache_state: "miss",
              cue_count: 8,
              error_message: null,
              status: "succeeded",
              total_duration_s: 60,
            },
          },
        ],
      });
      await mockLauncherApi(page, {
        byPageIndex: {
          0: projectsPage([], 0, 0),
        },
      });

      await page.goto("/launcher");
      const newProjectButton = page.getByRole("button", { name: "New project" });
      await expect(newProjectButton).toBeVisible();
      await expect(newProjectButton).toBeEnabled();
      await enterSetupFromLauncher(page);
      await page.screenshot({ path: testInfo.outputPath(`flow6-${theme}-launcher.png`) });

      const cancelButton = page.getByRole("button", { name: "Cancel" });
      await expect(cancelButton).toBeVisible();
      await expect(cancelButton).toBeEnabled();
      await leaveSetupToLauncher(page);

      await enterSetupFromLauncher(page);
      await page.getByLabel("Project name").fill(`Theme ${theme}`);
      await page.locator('input[accept=".mp3,.wav,.m4a"]').setInputFiles(makeUpload("voice.wav", "audio/wav", "voice"));
      await expect(page.getByRole("button", { name: "Generate subtitle" })).toBeEnabled();
      await page.getByRole("button", { name: "Generate subtitle" }).click();
      await page.locator('input[accept=".txt,.md,.srt"]').setInputFiles(makeUpload("transcript.txt", "text/plain", "txt"));
      await expect(page.getByRole("button", { name: "Run alignment API" })).toBeEnabled();
      await page.getByRole("button", { name: "Run alignment API" }).click();

      const createButton = page.getByRole("button", { name: "Create project" });
      await expect(createButton).toBeVisible();
      await expect(createButton).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`flow6-${theme}-setup.png`) });

      await context.close();
    }
  });
});

async function enterSetupFromLauncher(page: import("@playwright/test").Page): Promise<void> {
  const newProjectButton = page.getByRole("button", { name: "New project" });
  await expect(newProjectButton).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await newProjectButton.click();
    try {
      await expect(page).toHaveURL(/\/setup$/, { timeout: 2_500 });
      return;
    } catch {
      // Retry once hydration settles in Next.js dev mode.
    }
  }
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/setup$/);
}

async function leaveSetupToLauncher(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Cancel" }).click();
  try {
    await expect(page).toHaveURL(/\/$/, { timeout: 2_500 });
    return;
  } catch {
    await page.goto("/launcher");
  }
  await expect(page).toHaveURL(/\/launcher$/);
}

async function openEditorFromLauncher(
  page: import("@playwright/test").Page,
  projectName: string,
  projectId: string,
): Promise<void> {
  await page.getByRole("button", { name: `Open ${projectName} details` }).click();
  await expectEditorNavigationOrGoto(page, projectId);
}

async function expectEditorNavigationOrGoto(
  page: import("@playwright/test").Page,
  projectId: string,
): Promise<void> {
  try {
    await expect(page).toHaveURL(new RegExp(`/editor/${projectId}$`), { timeout: 2_500 });
    return;
  } catch {
    await page.goto(`/editor/${projectId}`);
  }
  await expect(page).toHaveURL(new RegExp(`/editor/${projectId}$`));
}
