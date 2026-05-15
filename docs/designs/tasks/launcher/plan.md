# Implementation Plan: Launcher And Setup Spec

## Overview

Implement `docs/designs/tasks/launcher/SPEC_LAUNCHER.md` as the Phase 1 Launcher and four-step Setup flow. The work replaces the older folder-first setup path with Launcher -> Setup -> subtitle generation -> subtitle alignment -> final project creation -> Editor, while preserving existing local-first persistence, generated shared schemas, Tailwind token usage, and FastAPI/SQLite boundaries.

## Planning Assumptions

- `docs/designs/tasks/launcher/SPEC_LAUNCHER.md` is the source of truth for this plan, with `docs/designs/SPEC.md` providing global storage, route, and style constraints.
- Existing implementation should be extended where it fits: `apps/web/app/page.tsx`, `apps/web/app/setup/page.tsx`, launcher/setup components, `useSetupDraft`, `apps/server/server/routes/projects.py`, `setup.py`, `alignment.py`, and project DB helpers already cover part of the surface.
- Existing behavior that conflicts with the Launcher spec should be replaced: the Launcher folder-selection boundary, `/projects/new-folder` first step, and the current 3-step Setup model are not the target workflow.
- Root `tasks/plan.md` and `tasks/todo.md` were deleted in the current worktree; this plan recreates them for Launcher/Setup work.
- Backend-global project/config persistence tasks and frontend-global visual harness tasks may be implemented independently. Launcher/Setup tasks name those dependencies explicitly.
- Generated shared schema outputs are regenerated from `packages/shared-schemas/project.schema.json`; do not hand-edit generated TS/Python files.
- Frontend implementation must use Tailwind classes, existing design tokens, i18n dictionaries, and shared primitives. Do not copy prototype CSS.
- Development work should use the repo verification convention from `RTK.md`, for example `rtk pnpm -F @vc/web test`.

## Current Codebase Notes

- `/` currently fetches `GET /projects`, renders recents with `ProjectCard`, and routes `New project` through a folder-selection form before `/setup?projectId=...&path=...`.
- `/setup` currently inspects an existing project/path and models folder, inputs, and alignment as three steps. The spec requires four steps: Project Name, Voice, Subtitle, Alignment.
- Shared schemas currently expose `draft` and `final` output presets only. The Launcher spec needs `720p Draft`, `1080p Final`, and `1080p vertical 9:16`.
- Shared schemas currently use backend render statuses such as `done` and `error`. The Launcher card needs user-facing tags `unrendered`, `queued`, `rendering`, `rendered`, `failed`, and `cancelled`.
- Backend routes already include `/projects`, `/projects/{project_id}`, `/projects/{project_id}/alignment`, `/projects/align`, `/setup/inspect`, and render playback helpers. Required `/subtitle` and `/subtitle/alignment` endpoints do not exist yet.
- Thumbnail storage exists as `projects.thumbnail_path`, and render history exists, but the first-frame/latest-successful-render thumbnail rule and modal video flow are not complete.
- There is no committed Playwright/SSIM visual parity harness yet. The frontend-global plan owns the common harness; this plan owns Launcher/Setup parity cases once the harness exists.

## Architecture Decisions

- Treat Setup as a draft/session until final creation. `POST /subtitle` and `POST /subtitle/alignment` may return and accept a server-side `setup_id` so generated artifacts can exist without materializing the final project folder.
- Materialize the on-disk project layout only in final `POST /projects`, after all four Setup steps have succeeded.
- Keep Launcher card data in a generated shared response contract. The UI must not infer status or filesystem paths from raw DB rows.
- Use a dedicated user-facing Launcher render status tag instead of overloading backend render job status names.
- Store or cache fallback thumbnails during project creation. The same deterministic three-color placeholder should be reproducible from the project identity and persisted as a served thumbnail path.
- Serve video preview through an app/API URL for the modal. The Launcher play action should not only shell-open the file.

## Dependency Graph

```text
Shared schema and generated models
  -> backend setup draft/session contracts
  -> subtitle generation endpoint
  -> subtitle alignment endpoint
  -> final project creation and config persistence
  -> frontend setup state machine
  -> setup UI and route handoff

Project DB and render history
  -> launcher recents API
  -> thumbnail selection/cache
  -> video preview endpoint
  -> launcher project cards and modal

Frontend-global visual harness
  -> launcher visual parity cases
  -> setup visual parity cases
  -> operational Playwright flows (Flow 1-6)
```

## Task List

### Phase 1: Contracts And Setup Foundation

## Task 1: Lock the Launcher and Setup shared contracts

**Description:** Update the shared schema source so Launcher recents, Setup draft/session state, output presets, subtitle generation status, alignment status, and user-facing render status tags are represented by generated TS and Python types.

**Acceptance criteria:**

- [X] Generated types include the three Setup output presets: `720p Draft`, `1080p Final`, and `1080p vertical 9:16`, represented by stable machine values.
- [X] Generated types include Launcher card fields for thumbnail URL/path, voice duration, sentence count, media count, optional last rendering time, optional render status tag, and pagination metadata.
- [X] Generated types include Setup subtitle generation result state with cue count, total duration, cache state, and recoverable error message.
- [X] Existing backend/frontend imports compile against regenerated TS/Python outputs without hand-editing generated files.

**Verification:**

- [X] `rtk pnpm gen:types`
- [X] `rtk pnpm gen:py`
- [X] `rtk pnpm -F @vc/web test`
- [X] `rtk pnpm -F @vc/server test`

**Dependencies:** None

**Files likely touched:**

- `packages/shared-schemas/project.schema.json`
- `packages/shared-schemas/ts/index.ts`
- `packages/shared-schemas/py/schemas.py`
- `apps/server/server/domain/project.py`
- `apps/web/lib/i18n/messages/en.json`

**Estimated scope:** Medium

## Task 2: Add the backend Setup draft boundary

**Description:** Introduce the server-side draft/session boundary needed by `POST /subtitle`, `POST /subtitle/alignment`, and final `POST /projects` so voice, transcript, watermark, and generated subtitles can be staged without creating the final project folder.

**Acceptance criteria:**

- [X] Setup draft state can track project name, output preset, voice file, generated `subtitles.srt`, transcript file, optional watermark, and alignment result.
- [X] Draft artifacts live in an internal setup/cache location, not under `{root}/projects/<project>`.
- [X] Cancelled or abandoned drafts can be cleaned up without deleting user-selected source files.
- [X] Final project directories are not created by voice selection, subtitle generation, or alignment.

**Verification:**

- [X] `rtk pnpm -F @vc/server test -- test_setup_route.py`
- [X] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/server/server/routes/setup.py`
- `apps/server/server/routes/projects.py`
- `apps/server/server/db/projects.py`
- `apps/server/tests/test_setup_route.py`
- `apps/server/tests/test_projects_route.py`

**Estimated scope:** Medium

### Checkpoint: Contracts

- [X] Shared schema generation passes.
- [X] Backend tests prove Setup draft artifacts do not materialize a final project.
- [X] Existing app routes still compile against the generated contracts.

### Phase 2: Launcher Recents And Preview

## Task 3: Make Launcher recents spec-compliant end to end

**Description:** Implement the Launcher home behavior from backend recents through the web UI: `GET /projects`, `DELETE /projects/:projectId`, empty state, project-card fields, status tags, sorting, and pagination.

**Acceptance criteria:**

- [X] `GET /projects` supports page size and page index and returns deterministic pagination metadata.
- [X] Recents sort by latest render time descending, with a stable fallback for projects that have never rendered.
- [X] Missing or corrupt project config rows are deleted or excluded according to the spec and covered by tests.
- [X] Launcher renders `Local workspace`, `Recent projects`, `New project`, recents grid/list, and bottom pagination.
- [X] Project cards show thumbnail, project name, voice duration, sentence count, media count, optional last rendering time, and optional status tag.
- [X] The primary Launcher UI never renders a raw folder path.
- [X] Clicking a project card opens `/editor/:projectId` for valid projects.
- [X] Clicking `New project` enters Setup directly.

**Verification:**

- [X] `rtk pnpm -F @vc/server test -- test_projects_route.py`
- [X] `rtk pnpm -F @vc/web test -- page.test.tsx`
- [X] `rtk pnpm -F @vc/web lint`

**Dependencies:** Task 1; backend-global project-index work if not already landed

**Files likely touched:**

- `apps/server/server/routes/projects.py`
- `apps/server/server/db/projects.py`
- `apps/web/app/page.tsx`
- `apps/web/components/launcher/ProjectCard.tsx`
- `apps/web/app/page.test.tsx`

**Estimated scope:** Medium

## Task 4: Implement Launcher thumbnails and video preview modal

**Description:** Complete the thumbnail and playback rules: latest successful render first frame when available, deterministic three-color fallback otherwise, and in-app modal playback from the thumbnail play icon.

**Acceptance criteria:**

- [X] New projects get a deterministic three-color fallback thumbnail stored or cached under the project/internal thumbnail location.
- [X] Projects with a latest successful rendered video prefer a first-frame thumbnail from that render.
- [X] The thumbnail play icon is shown only when a playable latest successful render exists.
- [X] Clicking the thumbnail play icon opens an in-app modal that plays the rendered video.
- [X] The modal has dark and light visual states matching `../../visuals/Launcher-play-dark.png` and `../../visuals/Launcher-play-light.png`.

**Verification:**

- [X] `rtk pnpm -F @vc/server test -- test_projects_route.py`
- [X] `rtk pnpm -F @vc/web test -- page.test.tsx`
- [X] `rtk pnpm -F @vc/web test -- ProjectCard`

**Dependencies:** Task 3; render artifact persistence from backend-global/render work

**Files likely touched:**

- `apps/server/server/routes/projects.py`
- `apps/server/server/routes/render.py`
- `apps/server/server/db/renders.py`
- `apps/web/components/launcher/ProjectThumb.tsx`
- `apps/web/components/launcher/ProjectCard.tsx`

**Estimated scope:** Medium

### Checkpoint: Launcher

- [X] Launcher works with empty, populated, missing/corrupt, and paginated recents.
- [X] Project cards meet the field and path-hiding requirements.
- [X] Thumbnail preview modal works for a project with a successful render.

### Phase 3: Four-Step Setup Flow

## Task 5: Build the four-step Setup state machine and layout

**Description:** Replace the current path/folder/input/alignment setup model with the spec's four checks: Project Name, Voice, Subtitle, and Alignment, using the visual layout from the Setup screenshots.

**Acceptance criteria:**

- [X] Setup header shows `New project`, `SetUp`, and `Cancel`.
- [X] Left stepper/checklist contains `Project Name`, `Voice`, `Subtitle`, and `Alignment`.
- [X] Project Name is checked only when a non-empty name is present.
- [X] Output preset is a segmented control with `720p (Draft)`, `1080p (Final)`, and `1080p / vertical (9:16)`.
- [ ] Voice card opens the file picker, accepts `.mp3`, `.wav`, and `.m4a`, rejects unsupported files with a non-blocking error, and shows a green border after valid selection.
- [ ] Transcript and optional watermark use the same picker pattern in the Subtitle Alignment section.
- [X] `Create project` remains disabled until all four checks pass.
- [X] `Cancel` returns to Launcher without persisting partial Setup state.

**Verification:**

- [X] `rtk pnpm -F @vc/web test -- setup/page.test.tsx`
- [X] `rtk pnpm -F @vc/web test -- useSetupDraft.test.ts`
- [X] `rtk pnpm -F @vc/web lint`

**Dependencies:** Task 1, Task 2

**Files likely touched:**

- `apps/web/app/setup/page.tsx`
- `apps/web/lib/setup/useSetupDraft.ts`
- `apps/web/components/setup/Stepper.tsx`
- `apps/web/components/setup/StatusTile.tsx`
- `apps/web/lib/i18n/messages/en.json`

**Estimated scope:** Medium

## Task 6: Implement Subtitle Generate vertical slice

**Description:** Wire the Voice step to backend subtitle generation so `POST /subtitle` creates `subtitles.srt` from the selected voice, reports status, and checks the Subtitle step only on success.

**Acceptance criteria:**

- [X] `POST /subtitle` accepts `.mp3`, `.wav`, and `.m4a` voice input and rejects unsupported codecs with a clear recoverable error.
- [X] Subtitle generation status cycles through `ready -> running -> succeeded` or `failed`.
- [X] On success, the response includes cue count and total subtitle duration.
- [X] Cue durations sum to voice duration within +/-200 ms in backend tests.
- [X] Re-running with unchanged voice hash is a cache hit and does not reload the model.
- [X] Setup enables `Generate subtitle` only after Project Name and Voice are checked.
- [X] Setup marks Subtitle checked only after generation succeeds and displays cue count and duration in the right panel.

**Verification:**

- [X] `rtk pnpm -F @vc/server test -- test_transcribe.py`
- [X] `rtk pnpm -F @vc/server test -- test_setup_route.py`
- [X] `rtk pnpm -F @vc/web test -- setup/page.test.tsx`
- [X] `rtk pnpm -F @vc/web test -- useSetupDraft.test.ts`

**Dependencies:** Task 2, Task 5

**Files likely touched:**

- `apps/server/server/routes/setup.py`
- `apps/server/server/pipeline/transcribe.py`
- `apps/server/server/pipeline/srt.py`
- `apps/web/lib/setup/useSetupDraft.ts`
- `apps/web/app/setup/page.tsx`

**Estimated scope:** Medium

## Task 7: Implement Subtitle Alignment vertical slice

**Description:** Wire transcript-driven alignment so `POST /subtitle/alignment` adjusts generated subtitles using the selected transcript, reports corrections, and checks Alignment only on success.

**Acceptance criteria:**

- [ ] `POST /subtitle/alignment` is enabled only after Project Name, Voice, and Subtitle are checked.
- [ ] Alignment uses the selected transcript plus generated `subtitles.srt`, not an old project-folder transcript assumption.
- [ ] Status cycles through `ready -> running -> succeeded` or `failed`.
- [ ] On success, the response reports the number of cue-level corrections applied to `subtitles.srt`.
- [ ] Changing voice or transcript hash invalidates cached alignment and re-runs alignment.
- [ ] WhisperX missing, CUDA unavailable, CUDA OOM, long silence, and mismatched text surface recoverable errors or CPU fallback where possible.
- [ ] Setup marks Alignment checked only after alignment succeeds.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- test_alignment_subtitles.py`
- [ ] `rtk pnpm -F @vc/server test -- test_alignment_integration.py`
- [ ] `rtk pnpm -F @vc/web test -- setup/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- AlignmentCard`

**Dependencies:** Task 6

**Files likely touched:**

- `apps/server/server/routes/alignment.py`
- `apps/server/server/routes/setup.py`
- `apps/server/server/pipeline/srt.py`
- `apps/web/components/setup/AlignmentCard.tsx`
- `apps/web/lib/setup/useSetupDraft.ts`

**Estimated scope:** Medium

## Task 8: Create the final project and hand off to Editor

**Description:** Complete final project creation from a successful Setup draft, materializing the on-disk project layout, SQLite config, thumbnail, optional watermark, and Editor route handoff only when all four Setup steps are checked.

**Acceptance criteria:**

- [ ] `POST /projects` creates a project only from a completed Setup draft/session.
- [ ] The final project layout includes `voice.wav`, `transcript.txt`, `subtitles.srt`, `media/`, `renders/`, and `.vc/` artifacts required by the global spec.
- [ ] The selected output preset persists into the project config.
- [ ] Optional watermark persists when selected and is absent when not selected.
- [ ] Fallback thumbnail generation runs if no successful render thumbnail exists.
- [ ] Setup `Create project` calls the final API and navigates to `/editor/:projectId` on success.
- [ ] Failed creation does not leave a partial canonical project entry.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- test_projects_route.py`
- [ ] `rtk pnpm -F @vc/server test -- test_project_schema.py`
- [ ] `rtk pnpm -F @vc/web test -- setup/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- useSetupDraft.test.ts`

**Dependencies:** Task 7; backend-global project/config persistence work if not already landed

**Files likely touched:**

- `apps/server/server/routes/projects.py`
- `apps/server/server/db/project_configs.py`
- `apps/server/server/domain/project.py`
- `apps/web/lib/setup/useSetupDraft.ts`
- `apps/web/app/setup/page.tsx`

**Estimated scope:** Medium

### Checkpoint: Setup

- [ ] A user can complete all four Setup checks from Launcher and land in Editor.
- [ ] No final project files or DB rows are created before `Create project`.
- [ ] Subtitle generation and alignment failures are recoverable from the Setup screen.

### Phase 4: Hardening, Visuals, And Acceptance

## Task 9: Cover Launcher and Setup edge cases

**Description:** Add focused frontend and backend tests for the boundary conditions called out by the spec so error states stay recoverable and explicit.

**Acceptance criteria:**

- [ ] Setup covers project name missing/provided, voice missing/selected/invalid, transcript missing/empty/invalid, watermark absent/selected, Subtitle Generate ready/running/succeeded/failed, and Alignment ready/running/succeeded/failed.
- [ ] Backend covers voice missing, transcript missing, unsupported voice codec, empty transcript, long paragraph transcript, segmentation mismatch, WhisperX missing, CUDA unavailable, CUDA OOM, long silence/mismatched-text alignment failure, and user edits voice/transcript after assigning clips.
- [ ] Launcher covers no recent projects, missing/corrupt project config cleanup, pagination changes, and every status tag state.
- [ ] User-triggered failures show non-blocking messages with a clear next action.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm lint`

**Dependencies:** Tasks 3-8

**Files likely touched:**

- `apps/web/app/page.test.tsx`
- `apps/web/app/setup/page.test.tsx`
- `apps/web/lib/setup/useSetupDraft.test.ts`
- `apps/server/tests/test_setup_route.py`
- `apps/server/tests/test_projects_route.py`

**Estimated scope:** Medium

## Task 10: Add Launcher and Setup visual parity coverage

**Description:** Add visual parity cases for every Launcher and Setup screenshot embedded in the spec, using the frontend-global visual harness once it exists.

**Acceptance criteria:**

- [ ] Exactly one parity test covers `../../visuals/Launcher-dark.png`.
- [ ] Exactly one parity test covers `../../visuals/Launcher-light.png`.
- [ ] Exactly one parity test covers `../../visuals/Launcher-play-dark.png`.
- [ ] Exactly one parity test covers `../../visuals/Launcher-play-light.png`.
- [ ] Exactly one parity test covers `../../visuals/Setup-dark.png`.
- [ ] Exactly one parity test covers `../../visuals/Setup-light.png`.
- [ ] Setup parity covers selected, running, failed, and succeeded states for subtitle generation and alignment screenshots.![img](../../visuals/Setup-dark-alignment-running.png)
- [ ] Launcher/Setup parity results meet the shared SSIM threshold.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test:visual -- launcher`
- [ ] `rtk pnpm -F @vc/web test:visual -- setup`
- [ ] `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`

**Dependencies:** Tasks 3-8; frontend-global visual harness and screenshot inventory

**Files likely touched:**

- `apps/web/tests/visual/launcher.visual.spec.ts`
- `apps/web/tests/visual/setup.visual.spec.ts`
- `apps/web/tests/visual/visual-manifest.ts`
- `apps/web/tests/visual/visual-test-utils.ts`

**Estimated scope:** Medium

## Task 11: Add operational Launcher and Setup E2E browser flows

**Description:** Implement the spec-defined Playwright operational flows as end-to-end browser tests. Each flow is a complete user journey with deterministic API mocks and `test01` fixture files where file selection is required.

**Acceptance criteria:**

- [ ] Flow 1 covers Launcher empty state -> `New project` -> Setup entry -> `Cancel` -> back to Launcher, and asserts no `POST /projects`.
- [ ] Flow 2 covers populated Launcher behavior: recents order by `last_rendered`, card field visibility, pagination switch, thumbnail play modal open/close, and project-card navigation to `/editor/:projectId`.
- [ ] Flow 3 covers full Setup happy path: step gating, valid voice selection, subtitle generation success, alignment success, and `Create project` navigation to `/editor/:projectId`.
- [ ] Flow 4 covers Setup failure/recovery: unsupported voice validation, subtitle failure then retry success, alignment failure then retry success, all without reload.
- [ ] Flow 5 covers dependency reset behavior: changing voice resets Subtitle+Alignment; changing transcript resets Alignment only; reruns re-enable `Create project`.
- [ ] Flow 6 covers dark/light actionability smoke and writes Launcher+Setup checkpoint screenshots for parity baselines.
- [ ] Flow implementations follow the spec format: one Playwright `test()` per flow with precondition -> actions -> assertions.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test:e2e -- tests/e2e/launcher-setup-flows.spec.ts`
- [ ] `rtk pnpm -F @vc/web test:e2e -- --grep \"Flow 1|Flow 2|Flow 3|Flow 4|Flow 5|Flow 6\"`
- [ ] `rtk pnpm -F @vc/web test -- setup/page.test.tsx`

**Dependencies:** Tasks 3-8; Task 10 for shared screenshot/parity harness wiring

**Files likely touched:**

- `apps/web/tests/e2e/launcher-setup-flows.spec.ts`
- `apps/web/tests/e2e/e2e-utils.ts`
- `apps/web/tests/e2e/fixtures/test01/*`

**Estimated scope:** Medium

## Task 12: Run the Launcher and Setup acceptance gate

**Description:** Run and fix drift from the complete Launcher/Setup verification set after functional, edge-case, visual, and E2E work has landed.

**Acceptance criteria:**

- [ ] Launcher opens as the home page and persists recents across restarts.
- [ ] Launcher card fields, thumbnail rules, status tags, pagination, empty state, deletion, and video modal meet the spec.
- [ ] Setup enforces all four checks and only creates the on-disk project at final `Create project`.
- [ ] Subtitle generation and subtitle alignment meet the specified behavior and recoverable error handling.
- [ ] Output preset and optional watermark persist into the final project config.
- [ ] Visual parity coverage exists for every Launcher and Setup screenshot.
- [ ] Operational E2E Flows 1-6 are documented and runnable.

**Verification:**

- [ ] `rtk pnpm test`
- [ ] `rtk pnpm lint`
- [ ] `rtk pnpm build`
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/web test:visual -- launcher setup`

**Dependencies:** Tasks 1-11

**Files likely touched:**

- No new feature files expected; this is a fix-forward verification task.

**Estimated scope:** Small

### Checkpoint: Complete

- [ ] All Launcher/Setup functional acceptance criteria pass.
- [ ] All Launcher/Setup quality gates have tests.
- [ ] Visual and E2E coverage are either passing or explicitly documented behind local integration flags.
- [ ] Ready for human review before implementation begins.

## Parallelization Opportunities

- Tasks 3 and 4 can run in parallel after Task 1 if the Launcher card contract is stable.
- Task 5 can run in parallel with backend Tasks 6 and 7 after Task 2 if the Setup draft contract is stable.
- Task 10 can start once the visual harness exists and mocked Launcher/Setup states can be rendered.
- Task 11 should start after Tasks 3-8 stabilize selectors, API contracts, and step-state transitions.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `/subtitle` requires transcription behavior that does not exist in the current `transcribe.py` wrapper | High | Introduce backend tests with mocked model behavior first, then add real integration coverage behind a local flag. |
| Browser-only file pickers do not expose absolute file paths | High | Keep file selection behind a mockable desktop/server boundary and avoid trusting arbitrary client paths. |
| Global backend persistence tasks are not landed before Launcher work begins | Medium | Execute the named global tasks first or keep Launcher persistence changes scoped to the same contracts. |
| Visual parity harness is not available | Medium | Land functional/component tests first; add parity cases once frontend-global Task 5 exists. |
| Browser E2E flow runs are flaky due to async status transitions and file chooser timing | Medium | Use deterministic API mocks, explicit status awaits, and stable `data-testid` selectors in all six flows. |
| Status enum mismatch between backend render jobs and Launcher tags causes UI drift | Medium | Use generated mapping tests for render job status -> Launcher status tag. |

## Resolved Decisions

- `New project` enters Setup directly; the old Launcher folder form is removed from the primary flow.
- Setup final creation is the only step that materializes the canonical project folder.
- Legacy routes may remain temporarily for compatibility tests, but the required public surface for this spec is `GET /projects`, `DELETE /projects/:projectId`, `POST /subtitle`, `POST /subtitle/alignment`, and `POST /projects`.
- Launcher/Setup visual parity belongs to this plan; the shared visual tooling belongs to the frontend-global plan.
