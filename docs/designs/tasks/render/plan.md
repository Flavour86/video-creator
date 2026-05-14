# Implementation Plan: Render Spec

## Overview

Implement `docs/designs/SPEC_RENDER.md` as the Phase 1 Render contract. The work replaces conflicting render routes, query-string routing, coarse render states, partial UI affordances, and incomplete ffmpeg lifecycle handling with a project-scoped render queue, live progress/logs, current-project history, output playback, cancellation, render gating, and frame-level correctness checks.

## Planning Assumptions

- `docs/designs/SPEC_RENDER.md` is the source of truth for this plan. If existing code, tests, prototype behavior, or older docs conflict with it, SPEC_RENDER.md wins.
- Current conflicting surfaces should be removed or overridden, not preserved as primary behavior.
- Existing root `tasks/plan.md` and `tasks/todo.md` were deleted in the current worktree; this plan recreates them for Render work.
- Existing partial render files are useful starting points: `apps/server/server/routes/render.py`, `apps/server/server/pipeline/render.py`, `apps/server/server/db/renders.py`, `apps/server/server/routes/ws.py`, `apps/web/app/render/page.tsx`, `apps/web/components/render/*`, and `apps/web/lib/render/*`.
- Current public paths using `/projects/:projectId/renders`, `/projects/render?project=...`, `/render?projectId=...&job=...`, and `/projects/renders/:renderId/play` conflict with the spec where they replace the required API and route shape.
- Generated shared schema outputs are regenerated from `packages/shared-schemas/project.schema.json`; do not hand-edit generated TS/Python files.
- Verification commands should use the repo RTK convention, for example `rtk pnpm -F @vc/server test`.

## Current Codebase Notes

- Shared render status is currently coarse: `queued`, `running`, `done`, `error`, `cancelled`, and `partial`. The spec requires render page states and ordered stages including verifying cache, pre-rendering clips, building subtitles, composing, muxing, logging history, warnings, fatal errors, missing output, partial exclusion, and empty history.
- Backend routes already start renders, list/delete render rows, cancel jobs, and open/reveal paths, but the route names and semantics do not match `SPEC_RENDER.md`.
- The current render route can reject concurrent renders for a project. The spec requires multiple render requests to queue.
- The pipeline emits `cache_warm`, `compose`, and `muxing`, but the spec requires the exact stage order: queued -> verify alignment cache -> pre-render cached clips -> build `subtitles.srt` -> compose filtergraph -> mux MP4 with `+faststart` -> append render history to `app.db`.
- The frontend Render page currently uses query parameters and auto-starts a final render. The spec requires `/render/:projectId/:render_id` and route guards for invalid or missing segments.
- The current after-render panel always shows `Reveal in Explorer` and includes a YouTube upload action. The spec requires `Play locally` always, and `Reveal in Explorer` only when the backend exposes host file-manager invocation.
- Existing tests cover part of render history, progress, and UI, but many tests assert current non-spec routes and statuses. Those tests must be rewritten to the spec.

## Architecture Decisions

- Keep FastAPI, SQLite, ffmpeg, Next.js, React, Tailwind, Zustand/hooks, and existing render component boundaries where they can be made spec-compliant.
- Make SQLite the recovery source for render history, artifacts, events, output metadata, and latest stage. In-memory queue/task state is allowed only for active process control.
- Persist each render event before publishing it over WebSocket so refresh/reconnect can recover state.
- Use project-scoped route contracts as the public API:
  - `POST /projects/:projectId/render?preset=draft|final&resolution=1920x1080|1280x720|1080x1920`
  - `DELETE /projects/:projectId/render/:renderId`
  - `GET /projects/:projectId/history`
  - `DELETE /projects/:projectId/history/:renderId`
  - `GET /projects/:projectId/render/:renderId`
- Replace query-string Render navigation with App Router dynamic segments at `/render/:projectId/:render_id`. Keep any compatibility page only as a redirect or Launcher fallback if it does not conflict.
- Treat render gating as a project config hash concern: newly aligned projects can render immediately; already-rendered projects require current config hash to differ from the last successful render hash.
- Probe actual output files for size, duration, streams, resolution, and faststart where acceptance requires accuracy; do not rely on estimates for final output panel values.

## Dependency Graph

```text
Shared render contracts
  -> backend API route surface
  -> render DB/history/artifact/event model
  -> queue, cancellation, and persisted progress
  -> ffmpeg pipeline stages and output probing
  -> frontend render API hooks and dynamic route
  -> render page UI, history, output, and actions
  -> editor render gating
  -> backend/frontend edge tests
  -> frame-level E2E and visual parity
```

## Task List

### Phase 1: Contracts And Public Surface

## Task 1: Lock the SPEC_RENDER shared contract

**Description:** Update the shared schema and frontend/backend type surfaces for the render API, output resolutions, render stages, render page states, history rows, output metadata, artifacts, events, and backend capabilities.

**Acceptance criteria:**

- [ ] Generated types represent `draft` and `final` presets plus `1920x1080`, `1280x720`, and `1080x1920` render resolutions.
- [ ] Generated or local API types expose all SPEC_RENDER stages and render page states, including warning, fatal, missing output, partial excluded, and empty-history states.
- [ ] Render history rows include filename, preset or resolution, duration, status, output path, output existence, file size, and artifacts/events needed by the UI.
- [ ] Backend capability data can tell the web app whether `Reveal in Explorer` is supported.
- [ ] Existing coarse or conflicting status mappings are replaced or explicitly mapped to SPEC_RENDER states.

**Verification:**

- [ ] `rtk pnpm gen:types`
- [ ] `rtk pnpm gen:py`
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/server test`

**Dependencies:** None

**Files likely touched:**

- `packages/shared-schemas/project.schema.json`
- `packages/shared-schemas/ts/index.ts`
- `packages/shared-schemas/py/schemas.py`
- `apps/web/lib/render/types.ts`
- `apps/web/lib/render/normalize.ts`
- `apps/server/server/pipeline/render_progress.py`
- `apps/web/lib/i18n/messages/en.json`
- `apps/web/lib/i18n/messages/zh.json`

**Estimated scope:** Medium

## Task 2: Replace the backend render API with the spec surface

**Description:** Rewrite the render route layer so start, cancel, history, history deletion, and video playback use the project-scoped `SPEC_RENDER.md` paths. Update tests that currently assert old `/renders` or query-path behavior.

**Acceptance criteria:**

- [ ] `POST /projects/:projectId/render?preset=draft|final&resolution=...` accepts documented presets/resolutions and rejects unknown values.
- [ ] `DELETE /projects/:projectId/render/:renderId` cancels queued or active renders and rejects cross-project render IDs.
- [ ] `GET /projects/:projectId/history` returns only current-project render history.
- [ ] `DELETE /projects/:projectId/history/:renderId` removes the selected history row according to persistence rules.
- [ ] `GET /projects/:projectId/render/:renderId` serves the rendered MP4 and rejects missing, failed, cancelled, partial, or cross-project outputs.
- [ ] Old conflicting public route usage is removed from frontend callers and tests.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py`
- [ ] `rtk pnpm -F @vc/server test -- test_render_history.py`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/server/server/routes/render.py`
- `apps/server/server/db/renders.py`
- `apps/server/tests/test_render_endpoint.py`
- `apps/server/tests/test_render_history.py`
- `apps/web/lib/render/useRenderJob.ts`
- `apps/web/lib/render/useRenderHistory.ts`
- `apps/web/lib/render/useRenderCancel.ts`

**Estimated scope:** Medium

## Task 3: Add project-scoped render persistence and queue semantics

**Description:** Make render rows, queue state, artifacts, events, and project dirty-state updates match the render spec before deeper pipeline work.

**Acceptance criteria:**

- [ ] Starting multiple renders for one project creates queued rows instead of rejecting the later requests.
- [ ] Queue order is deterministic and visible through history/progress state.
- [ ] Successful renders update the last successful render config hash and clear render gating for that config.
- [ ] Failed and cancelled renders create history rows without clearing unrendered-change gating.
- [ ] `render_history`, `render_artifacts`, and `render_events` remain consistent for queued, running, done, cancelled, and failed renders.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- test_render_history.py`
- [ ] `rtk pnpm -F @vc/server test -- test_render_progress.py`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 1, Task 2; backend-global project/config persistence if not already landed

**Files likely touched:**

- `apps/server/server/db/renders.py`
- `apps/server/server/db/migrations/*.sql`
- `apps/server/server/db/projects.py`
- `apps/server/server/db/project_configs.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/tests/test_render_history.py`
- `apps/server/tests/test_render_progress.py`

**Estimated scope:** Medium

### Checkpoint: API And Persistence

- [ ] Tasks 1-3 pass their focused tests.
- [ ] Public render API paths match `SPEC_RENDER.md`.
- [ ] Old conflicting frontend route callers are gone or reduced to harmless redirects.
- [ ] Queue/history/artifact/event rows can be inspected after queued, done, cancelled, and failed renders.

### Phase 2: Render Execution And Recovery

## Task 4: Implement the exact render stage pipeline

**Description:** Update `pipeline/render.py` and helpers so every render executes and reports the spec stage order, produces required MP4 outputs, supports cold cache, and handles empty visual configs.

**Acceptance criteria:**

- [ ] Stages execute in order: queued -> verify alignment cache -> pre-render cached clips -> build `subtitles.srt` -> compose filtergraph -> mux MP4 with `+faststart` -> append render history to `app.db`.
- [ ] `1080p` final emits 1920x1080 16:9 H.264 MP4 with `+faststart`.
- [ ] `720p` draft emits 1280x720 16:9 H.264 MP4 with `+faststart`.
- [ ] `9:16` output emits 1080x1920 vertical H.264 MP4 with `+faststart`.
- [ ] A new aligned project with no foreground, background, or PiP renders voice + subtitles + optional watermark over black fallback.
- [ ] Output filename always has `.mp4`, and output-file collisions are resolved without overwriting an existing successful render.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py`
- [ ] `rtk pnpm -F @vc/server test -- test_filtergraph.py`
- [ ] `rtk pnpm -F @vc/server test -- test_clip_cache.py`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 3

**Files likely touched:**

- `apps/server/server/pipeline/render.py`
- `apps/server/server/pipeline/filtergraph.py`
- `apps/server/server/pipeline/clip_render.py`
- `apps/server/server/pipeline/srt.py`
- `apps/server/tests/test_render_endpoint.py`
- `apps/server/tests/test_filtergraph.py`
- `apps/server/tests/test_clip_cache.py`

**Estimated scope:** Medium

## Task 5: Persist live progress, ffmpeg logs, and output probes

**Description:** Make progress/log delivery durable and accurate enough for live UI updates, refresh recovery, and output panel details.

**Acceptance criteria:**

- [ ] WebSocket progress emits at least one event per second while rendering.
- [ ] Each stage transition, progress update, warning, fatal ffmpeg error, and final state is persisted to `render_events`.
- [ ] ffmpeg log lines are stored as reopenable render artifacts or log records without unbounded memory growth.
- [ ] Output metadata is probed from disk: duration, resolution, video codec, CRF/preset when known, framerate, audio codec, audio bitrate, sample rate, actual size, streams, and faststart.
- [ ] Browser refresh or WebSocket reconnect resumes from persisted latest state.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- test_render_progress.py`
- [ ] `rtk pnpm -F @vc/server test -- test_render_history.py`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 4

**Files likely touched:**

- `apps/server/server/pipeline/render_progress.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/db/renders.py`
- `apps/server/server/routes/ws.py`
- `apps/server/tests/test_render_progress.py`
- `apps/server/tests/test_render_history.py`

**Estimated scope:** Medium

## Task 6: Complete cancellation and failure recovery

**Description:** Implement spec cancellation and edge-case recovery across queued jobs, active ffmpeg processes, partial outputs, DB failures, browser closure, and sidecar death.

**Acceptance criteria:**

- [ ] Cancelling a queued render removes it from the queue and records a `cancelled` history row.
- [ ] Cancelling an active render sends one cancel request, aborts the current stage, moves UI-observable state through cancelling/cancelled, and records the Cancel action in history.
- [ ] Active cancellation asks whether partial output should be removed; partial files are renamed or marked with `.partial` and excluded/cleaned according to the selected path.
- [ ] ffmpeg non-zero exit creates a `failed` row plus a failure event.
- [ ] Final render success followed by DB insert failure is reported as recoverable and leaves output/artifact state cleanly diagnosable.
- [ ] Missing output, output already exists, browser close during render, sidecar death during render, disk full, drive disconnect, large logs, and after-render action before done are covered by tests.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py`
- [ ] `rtk pnpm -F @vc/server test -- test_render_history.py`
- [ ] `rtk pnpm -F @vc/server test -- test_render_progress.py`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 5

**Files likely touched:**

- `apps/server/server/pipeline/render.py`
- `apps/server/server/db/renders.py`
- `apps/server/server/routes/render.py`
- `apps/server/server/routes/ws.py`
- `apps/server/tests/test_render_endpoint.py`
- `apps/server/tests/test_render_history.py`
- `apps/server/tests/test_render_progress.py`

**Estimated scope:** Medium

### Checkpoint: Execution

- [ ] Tasks 4-6 pass their focused tests.
- [ ] Draft/final/vertical outputs probe correctly with ffprobe.
- [ ] Queued, active, done, cancelled, failed, missing-output, and partial-output states are persisted.
- [ ] Refresh/reconnect and sidecar-restart recovery paths are covered.

### Phase 3: Render Routing, Gating, And UI

## Task 7: Replace Render routing and editor gating

**Description:** Move the web Render page to `/render/:projectId/:render_id`, update route guards, and enforce the render button gating rules from Editor and aligned-project handoff.

**Acceptance criteria:**

- [ ] `/render/:invalidProject/:render_id`, `/render/:projectId/:invalidRender`, and missing route segments redirect to Launcher.
- [ ] A new project can reach Render immediately after alignment succeeds, even with no foreground/background/PiP layers.
- [ ] An already-rendered project can reach/start Render only when current config hash differs from the last successful render hash.
- [ ] The Editor Render button reflects the hash-diff state and creates/navigates to a render ID using the spec API.
- [ ] Query-string render navigation is removed or redirects to the dynamic route without becoming the primary path.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- editor/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- render/page.test.tsx`
- [ ] `rtk pnpm -F @vc/server test -- test_project_load.py`
- [ ] `rtk pnpm -F @vc/web lint`

**Dependencies:** Task 2, Task 3

**Files likely touched:**

- `apps/web/app/render/page.tsx`
- `apps/web/app/render/[projectId]/[renderId]/page.tsx`
- `apps/web/app/render/page.test.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/components/editor/EditorBar.tsx`
- `apps/web/app/editor/page.test.tsx`

**Estimated scope:** Medium

## Task 8: Build the live Render progress page

**Description:** Make the Render page show the spec header, live progress card, stage list, stats, and ffmpeg log for the current project/render.

**Acceptance criteria:**

- [ ] Header renders eyebrow `Render`, title `<Project> - <Resolution> <preset> render`, `Back to editor`, and `Cancel render`.
- [ ] Progress card live-updates output filename, specs string, status tag, big progress bar, percent, encode speed, ETA, and frames written.
- [ ] Stage labels cycle through the exact documented stages with correct current/completed/error visual states.
- [ ] Render states render labels and visuals for idle/no active job, queued, verifying cache, pre-rendering clips, building subtitles, composing, muxing, logging history, done, cancelling, cancelled, failed, output missing, partial output excluded, ffmpeg warning, ffmpeg fatal error, and history empty.
- [ ] ffmpeg log view can show live logs and reopened persisted logs without locking the UI on large logs.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- render/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- RenderCard`
- [ ] `rtk pnpm -F @vc/web test -- LogCard`
- [ ] `rtk pnpm -F @vc/web lint`

**Dependencies:** Task 5, Task 7

**Files likely touched:**

- `apps/web/app/render/[projectId]/[renderId]/page.tsx`
- `apps/web/components/render/RenderHead.tsx`
- `apps/web/components/render/RenderCard.tsx`
- `apps/web/components/render/RenderStats.tsx`
- `apps/web/components/render/StagesList.tsx`
- `apps/web/components/render/LogCard.tsx`
- `apps/web/lib/render/useRenderJob.ts`
- `apps/web/lib/render/useFfmpegLog.ts`

**Estimated scope:** Medium

## Task 9: Complete history, output panel, and after-render actions

**Description:** Finish the right-side/current-project render surfaces: history rows, output specs, history deletion, playback, and capability-based Explorer reveal.

**Acceptance criteria:**

- [ ] Render history shows only the current project's rows.
- [ ] Each history row shows icon, filename, resolution or preset, duration, and status.
- [ ] History empty, output missing, partial output excluded, failed, warning, and fatal states are visible and test-covered.
- [ ] Output panel shows project name, resolution, framerate, video codec, CRF, preset, audio codec, bitrate, sample rate, and actual output size from disk.
- [ ] `Play locally` is always present and uses `GET /projects/:projectId/render/:renderId` only when output is playable.
- [ ] `Reveal in Explorer` renders only when backend capability data says host OS file-manager invocation is supported.
- [ ] Non-spec after-render actions, including the current upload shortcut, are removed from the Render page.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- render/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- HistoryPanel`
- [ ] `rtk pnpm -F @vc/web test -- OutputPanel`
- [ ] `rtk pnpm -F @vc/web test -- AfterRenderPanel`
- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py`

**Dependencies:** Task 2, Task 5, Task 8

**Files likely touched:**

- `apps/web/components/render/HistoryPanel.tsx`
- `apps/web/components/render/OutputPanel.tsx`
- `apps/web/components/render/AfterRenderPanel.tsx`
- `apps/web/components/render/RenderAside.tsx`
- `apps/web/lib/render/useRenderHistory.ts`
- `apps/web/lib/render/useSystemActions.ts`
- `apps/server/server/routes/render.py`
- `apps/server/tests/test_render_endpoint.py`

**Estimated scope:** Medium

## Task 10: Wire cancel UX end to end

**Description:** Connect frontend confirmation, single-request cancellation, partial-output choice, cancelling/cancelled states, and render-history recording to the backend cancellation semantics.

**Acceptance criteria:**

- [ ] `Cancel render` cancels queued and running renders from the Render page.
- [ ] Running renders ask for confirmation before removing partial output.
- [ ] The frontend sends exactly one cancel request per user confirmation.
- [ ] UI moves through cancelling and cancelled without requiring a refresh.
- [ ] Cancelled rows appear in current-project render history.
- [ ] Cancel-related component tests cover queued, active, rejected, partial, and completed-render cases.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- render/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- useRenderCancel`
- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py`
- [ ] `rtk pnpm -F @vc/server test -- test_render_history.py`

**Dependencies:** Task 6, Task 8, Task 9

**Files likely touched:**

- `apps/web/app/render/[projectId]/[renderId]/page.tsx`
- `apps/web/lib/render/useRenderCancel.ts`
- `apps/web/lib/render/normalize.ts`
- `apps/web/components/render/RenderHead.tsx`
- `apps/server/server/routes/render.py`
- `apps/server/server/pipeline/render.py`

**Estimated scope:** Medium

### Checkpoint: UI

- [ ] Tasks 7-10 pass focused frontend and backend tests.
- [ ] Render route, render gating, progress card, logs, output panel, history, actions, and cancel behavior all match `SPEC_RENDER.md`.
- [ ] No primary UI path uses the old query-string Render route or old plural render API.

### Phase 4: Quality Gates And Acceptance

## Task 11: Add backend render edge-case and performance coverage

**Description:** Add the missing backend regression suite for all render edge cases and performance targets listed in `SPEC_RENDER.md`.

**Acceptance criteria:**

- [ ] Tests cover cold cache, multiple queued renders, cancel queued, cancel active, ffmpeg non-zero, output exists, DB insert failure after final output, DB row with missing output, browser close, sidecar death, large logs, and after-render action before done.
- [ ] Tests cover render failure, ffmpeg error, disk full, drive disconnect, cleanable temp files, and successful render after failure.
- [ ] Performance tests or benchmark checks cover 720p draft <= 1.0x voice duration, 1080p final <= 2.5x, 9:16 <= 1.2x, and WS cadence >= 1 event/sec where suitable for local runs.
- [ ] Long-running or hardware-sensitive checks are clearly isolated behind explicit integration flags.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Tasks 4-6

**Files likely touched:**

- `apps/server/tests/test_render_endpoint.py`
- `apps/server/tests/test_render_history.py`
- `apps/server/tests/test_render_progress.py`
- `apps/server/tests/test_render_recovery.py`
- `apps/server/tests/test_render_performance.py`

**Estimated scope:** Medium

## Task 12: Add Render visual parity coverage

**Description:** Add visual parity tests for every Render screenshot and required Render state, using the shared visual harness when available.

**Acceptance criteria:**

- [ ] Every screenshot embedded in `SPEC_RENDER.md` has exactly one parity test.
- [ ] Dark and light variants are covered.
- [ ] Parity fixtures cover idle/no active job, queued, every active stage, done, cancelling, cancelled, failed, output missing, partial output excluded, ffmpeg warning, ffmpeg fatal error, history empty, and after-render actions.
- [ ] Visual tests verify that text does not overlap and fixed render controls do not shift across viewport sizes.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test:visual -- render`
- [ ] `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
- [ ] `rtk pnpm -F @vc/web lint`

**Dependencies:** Tasks 8-10; frontend-global visual harness if not already landed

**Files likely touched:**

- `apps/web/tests/visual/render.visual.spec.ts`
- `apps/web/tests/visual/visual-manifest.ts`
- `apps/web/tests/visual/visual-test-utils.ts`
- `apps/web/components/render/*.tsx`

**Estimated scope:** Medium

## Task 13: Add frame-level render correctness E2E

**Description:** Add the Playwright + ffmpeg/ffprobe render-correctness journey from `SPEC_RENDER.md` using the `test01` draft artifact when available.

**Acceptance criteria:**

- [ ] Test reuses the one-minute `test01` draft MP4 from Launcher happy path when present, otherwise renders it through `POST /projects/:projectId/render?preset=draft&resolution=1280x720`.
- [ ] ffprobe asserts duration matches voice within 0.1 s, resolution is 1280x720, audio stream exists, and MP4 has `+faststart`.
- [ ] Test parses `<project>/subtitles.srt` and checks every cue frame at `cue.start + 200 ms` by OCR/fuzzy text match with similarity >= 0.85.
- [ ] Foreground, PiP, and background-transition boundaries are checked with perceptual hashes at the specified offsets.
- [ ] PiP overlays are asserted inside configured `posX`/`posY` 3x3 cells, including `MC` no-edge-margin behavior.
- [ ] Configured watermark regions are detectable in every sampled frame.
- [ ] Screenshot artifacts are captured for every key frame sampled by subtitle, foreground, PiP, background, and watermark checks.
- [ ] Routing guards and render gating are covered in browser E2E.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test:e2e -- render-correctness`
- [ ] `rtk pnpm -F @vc/server test -- test_setup_test01_fixture.py`
- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py`

**Dependencies:** Tasks 4-10; Launcher/Setup `test01` fixture journey if not already landed

**Files likely touched:**

- `apps/web/tests/e2e/render-correctness.spec.ts`
- `apps/web/tests/e2e/e2e-utils.ts`
- `apps/server/tests/fixtures/smoke-project/README.md`
- `apps/server/tests/test_setup_test01_fixture.py`
- `apps/server/tests/test_render_endpoint.py`

**Estimated scope:** Medium

## Task 14: Run the Render acceptance gate

**Description:** Run the complete verification set and fix drift after all Render functional, edge-case, visual, and E2E work has landed.

**Acceptance criteria:**

- [ ] All functional acceptance criteria in `SPEC_RENDER.md` pass.
- [ ] All recoverability/error requirements are covered and pass.
- [ ] All visual parity requirements are covered and pass, or hardware/visual integration prerequisites are documented.
- [ ] Render correctness E2E is runnable and produces the required screenshot artifacts.
- [ ] Verification command set from `SPEC_RENDER.md` passes.

**Verification:**

- [ ] `rtk pnpm test`
- [ ] `rtk pnpm lint`
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/server test`

**Dependencies:** Tasks 1-13

**Files likely touched:**

- No new feature files expected; this is a fix-forward verification task.

**Estimated scope:** Small

### Checkpoint: Complete

- [ ] The Render page and backend behavior match `docs/designs/SPEC_RENDER.md`.
- [ ] Old conflicting render behavior is removed or overridden.
- [ ] Tests prove API surface, queue/cancel, ffmpeg output, route guards, render gating, history, actions, visual parity, and frame-level correctness.
- [ ] Ready for human review before implementation begins.

## Parallelization Opportunities

- Task 1 should land first. After that, Task 2 and Task 7 can be started together if the route contracts are stable.
- Task 3 and Task 4 are sequential because queue/history state must exist before full pipeline stage persistence.
- Task 8 can use mocked progress data while Tasks 4-6 are in progress, then integrate against real persisted events.
- Task 9 can run in parallel with Task 10 after backend cancel semantics are stable.
- Task 12 can start with mocked fixtures after the visual harness exists and the Render components expose all required states.
- Task 13 should wait until pipeline, route, gating, and UI navigation are stable.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Existing tests assert old `/renders` routes and query-string Render navigation. | High | Rewrite tests to the spec paths in Tasks 2 and 7; keep compatibility only as redirect/fallback. |
| Queue semantics conflict with the current active-render guard. | High | Introduce queued DB rows and a single scheduler boundary before changing ffmpeg stages. |
| `+faststart`, OCR, pHash, and performance checks can be environment-sensitive. | Medium | Keep deterministic unit tests for command construction and isolate hardware-heavy E2E behind explicit commands. |
| Partial-output behavior has multiple UI and filesystem interpretations. | Medium | Encode the SPEC_RENDER success criteria in tests: confirm active cancel, one request, `.partial` handling, cleanup/exclusion, and cancelled history. |
| File-manager reveal may not be supported in all web/runtime contexts. | Medium | Use backend capability detection and omit the button when unsupported. |
| Sidecar death can leave in-memory queue state stale. | High | Persist job state before execution and reconcile active non-terminal jobs on startup. |

## Coordination Notes

- Backend-global project/config persistence must be stable before Tasks 3 and 7 can fully enforce config-hash render gating.
- Launcher/Setup `test01` fixture work is useful for Task 13; if absent, Task 13 must create the draft artifact itself.
- Frontend-global visual harness and screenshot inventory must exist before Task 12 can be completed.
- Editor spec work may touch `EditorBar` and render-button behavior; coordinate Task 7 to avoid competing route semantics.

## Resolved Decisions

- SPEC_RENDER.md wins over current render code, old tests, and older docs when they conflict.
- The primary Render route is `/render/:projectId/:render_id`, not `/render?projectId=...&job=...`.
- The primary render history API is `/projects/:projectId/history`, not `/projects/:projectId/renders`.
- The primary cancel API is `DELETE /projects/:projectId/render/:renderId`, not `/projects/:projectId/renders/:renderId/cancel`.
- The Render page must not show non-spec after-render actions such as the current YouTube upload shortcut.
