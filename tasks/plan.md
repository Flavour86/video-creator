# Implementation Plan: Refactor App To Match SPEC And Prototype

## Overview

Refactor the existing Next.js web app and FastAPI sidecar so `docs/designs/SPEC.md` and the prototype at `http://127.0.0.1:4173/app.html` become the UI/UX and behavior contract. The work keeps Phase 1 local-first: Launcher, Setup subflow, Editor, Render, project config persistence, app SQLite metadata, render artifacts, and browser-local working recovery. The prototype is the visual reference for screen composition and control placement; `docs/designs/SPEC.md` is the single authoritative source for behavior, data and presentation — where the prototype is derived from `SPEC.md`, if they are conflict, stop and ask user. Do not copy prototype CSS; rebuild visuals with Tailwind and the existing design tokens/shared primitives. And the `tasks/todo.md` is the task list overview. Everytime, once you finish the task, you tick it in the task list below and `tasks/todo.md`!

## Current Gaps

- App shell still exposes route navigation, theme/language controls in the persistent top bar, a phase suffix, center runtime status, and project metadata in the bottom bar.
- Launcher still has `Open folder`, runtime card, tips card, empty create card, and raw path-oriented behavior instead of the prototype-only recent-project list plus `New project`.
- Setup already has inspection/alignment concepts but uses route-level setup and path query semantics instead of a Launcher-owned folder-selection subflow with project identity.
- Editor persists layers directly to `project.json`, autosaves too aggressively, shows open-folder/change-background/subtitles controls in old locations, lacks full global config persistence, and does not yet model incremental browser undo/redo operations.
- Timeline/editor interactions are partly implemented but need prototype parity for context menus, layer popover rules, clip movement/stretching, synchronized sentence ranges, and inspector controls.
- SQLite currently has `recent_projects`, `app_settings`, and simple `render_history`; it lacks `schema_migrations`, `projects`, `project_configs`, `render_artifacts`, and `render_events`. Per `SPEC.md`, do **not** add a `runtime_checks` table (runtime status comes from live health endpoints), and `app_settings` must be reduced to the single allowed key `default_output_preset`.
- API names are path-centric and do not match the spec's project-id based surface.
- Render page has a working base but must be tightened to the prototype/spec states, artifact model, history rules, and play/reveal behavior.

## Architecture Decisions

- Use `project_id` as the stable public identifier in web routes and APIs. Keep absolute paths server-side in SQLite only.
- Treat `project_configs.config_json` as the **only** canonical project config store. Per `SPEC.md`, `project.json` is not written into the project folder; the project folder holds user-visible files (`voice.wav`, `transcript.txt`, `subtitles.srt`, `media/`, `renders/`) plus the `.vc/` cache.
- Browser storage owns UI preferences and incremental editor operation recovery. SQLite owns saved configs, project metadata, render history, and generated render artifacts.
- Add a migration runner before expanding `app.db`; do not keep growing the inline `SCHEMA` string.
- Keep render artifacts separate from source media. Source media stays in project `media/`; generated files such as final/draft MP4, partial files, logs, filtergraphs, subtitles, thumbnails, and reusable companion files go through `render_artifacts`.
- Implement visual changes through existing component boundaries where possible, using the prototype as the layout reference Do not copy prototype CSS — rebuild with Tailwind tokens and shared primitives.

## Dependency Graph

1. Schema and generated types.
2. SQLite migrations and DB accessors.
3. Project-id API surface and compatibility adapters.
4. Launcher and Setup data flow.
5. Editor saved config, browser working state, and operation log.
6. Editor visual/interactions parity.
7. Render job/artifact/history model.
8. End-to-end tests and visual checks.

## Phase 1: Contracts And Persistence Foundation

### Task 1: Extend Shared Schema For Spec Data Model

**Description:** Update `packages/shared-schemas/project.schema.json` and generated TS/Python types so the saved project config supports media metadata, watermark media, subtitles settings, background playlists, visual item cache/orphan state, render/project summaries, and config hashes required by the spec.

**Acceptance criteria:**
- [x] Project config validates `media` assets with id, name, kind, path, thumb path, dimensions, duration, size, hash, import mode, and timestamp.
- [x] Layers validate `sub`, `pip`, `fg`, and `bg`, including `mediaId` or playlist `mediaIds`, sentence ranges, start/end seconds, motion, transitions, PiP placement, cache status, and orphan status.
- [x] Shared response models cover recent project cards, setup draft, alignment state, render history rows, render artifacts, and project config save/load responses.

**Verification:**
- [x] `rtk pnpm -F @vc/shared-schemas gen:ts`
- [x] `rtk pnpm -F @vc/shared-schemas gen:py`
- [x] `rtk pnpm -F @vc/server test -- test_project_schema.py test_shared_api_schemas.py`
- [x] `rtk pnpm -F @vc/web test -- lib`

**Dependencies:** None

**Files likely touched:**
- `packages/shared-schemas/project.schema.json`
- `packages/shared-schemas/ts/index.ts`
- `packages/shared-schemas/py/schemas.py`
- `apps/server/tests/test_project_schema.py`
- `apps/server/tests/test_shared_api_schemas.py`

**Estimated scope:** M

### Task 2: Add SQLite Migration Runner

**Description:** Replace inline-only schema initialization with an idempotent migration runner that creates `schema_migrations` and runs ordered SQL/Python migrations inside transactions.

**Acceptance criteria:**
- [x] DB initialization applies migrations exactly once and records version/checksum.
- [x] Tests can run migrations against temp SQLite files.
- [x] Existing app DBs with current tables are upgraded without data loss.

**Verification:**
- [x] `rtk pnpm -F @vc/server test -- test_app_db.py`
- [x] Manual temp DB migration from old `recent_projects`/`render_history` schema.

**Dependencies:** Task 1

**Files likely touched:**
- `apps/server/server/db/app_db.py`
- `apps/server/server/db/migrations.py`
- `apps/server/server/db/migrations/*.sql`
- `apps/server/tests/test_app_db.py`

**Estimated scope:** M

### Task 3: Implement `projects` Table And Project Identity

**Description:** Add `projects` table with stable `project_id`, path, name, status fields, thumbnails, config hashes, and render enablement metadata. Migrate existing `recent_projects` rows into this model.

**Acceptance criteria:**
- [x] `projects` stores `project_id`, normalized path, name, timestamps, alignment state, thumbnail path, current/latest rendered config hashes, and unrendered-change flag.
- [x] Recent project list is returned by `project_id` and never exposes raw path in primary UI data.
- [x] Missing/corrupt projects can be represented as states instead of crashing list rendering.

**Verification:**
- [x] `rtk pnpm -F @vc/server test -- test_app_db.py test_projects_route.py`
- [x] Manual DB query confirms migrated rows.

**Dependencies:** Task 2

**Files likely touched:**
- `apps/server/server/db/projects.py`
- `apps/server/server/routes/projects.py`
- `apps/server/tests/test_app_db.py`
- `apps/server/tests/test_projects_route.py`

**Estimated scope:** M

### Task 4: Implement `project_configs` Canonical Saves

**Description:** Add config snapshot storage in SQLite and route project save/load through `project_configs`. Do not write a `project.json` into the project folder; the project folder only holds user-visible files plus `.vc/`.

**Acceptance criteria:**
- [x] Saving validates config JSON against shared schema before writing.
- [x] Saving inserts a new `project_configs` row with `config_hash` and updates `projects.current_config_hash`.
- [x] Successful render can update `projects.last_rendered_config_hash` and clear `has_unrendered_changes`.

**Verification:**
- [x] `rtk pnpm -F @vc/server test -- test_project_load.py test_layers_endpoint.py`
- [x] Add tests for invalid config rejection and hash updates.

**Dependencies:** Tasks 1, 3

**Files likely touched:**
- `apps/server/server/db/project_configs.py`
- `apps/server/server/routes/projects.py`
- `apps/server/server/domain/project.py`
- `apps/server/tests/test_project_load.py`
- `apps/server/tests/test_layers_endpoint.py`

**Estimated scope:** M

### Task 5: Implement Render Artifacts And Events Tables

**Description:** Add `render_artifacts` and `render_events` tables and accessor functions for final/draft MP4s, partials, logs, filtergraphs, subtitles, thumbnails, and event timeline.

**Acceptance criteria:**
- [x] Every render can store typed artifacts with path, size, hash, created timestamp, and reuse eligibility.
- [x] Render events persist stage/log/status data needed by Render page and history.
- [x] Deleting/pruning a render removes DB rows and handles generated files safely.

**Verification:**
- [x] `rtk pnpm -F @vc/server test -- test_render_history.py test_render_endpoint.py`
- [x] Add tests for partial outputs excluded from play actions.

**Dependencies:** Task 2

**Files likely touched:**
- `apps/server/server/db/renders.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/routes/render.py`
- `apps/server/tests/test_render_history.py`
- `apps/server/tests/test_render_endpoint.py`

**Estimated scope:** M

### Checkpoint: Persistence Foundation

- [ ] `rtk pnpm -F @vc/shared-schemas gen:ts`
- [ ] `rtk pnpm -F @vc/shared-schemas gen:py`
- [ ] `rtk pnpm -F @vc/server test`
- [ ] Existing fixture project still opens and renders.
- [ ] Human review of DB schema before UI refactor proceeds.

## Phase 2: API Surface And Project Flow

### Task 6: Add Project-Id API Routes Required By Prototype

**Description:** Implement the spec API surface while keeping legacy routes as temporary adapters where needed.

**Acceptance criteria:**
- [x] Launcher APIs: `GET /projects`, `POST /projects/new-folder`, `DELETE /projects/:projectId`.
- [x] Setup APIs: `POST /projects/:projectId/inspect`, `POST /projects/:projectId/alignment`, `GET /projects/:projectId/alignment`.
- [x] Editor APIs: `GET/PUT /projects/:projectId/config`, `POST /projects/:projectId/media`, `GET /projects/:projectId/media`, `POST /projects/:projectId/render`.
- [x] Render APIs: `GET /projects/:projectId/renders`, `GET /projects/:projectId/renders/:renderId`, cancel, reveal, play, and delete.

**Verification:**
- [x] `rtk pnpm -F @vc/server test -- test_projects_route.py test_setup_route.py test_alignment_integration.py test_media_upload.py test_render_endpoint.py`
- [x] API error responses include stable codes and details.

**Dependencies:** Tasks 3, 4, 5

**Files likely touched:**
- `apps/server/server/routes/projects.py`
- `apps/server/server/routes/setup.py`
- `apps/server/server/routes/alignment.py`
- `apps/server/server/routes/media.py`
- `apps/server/server/routes/render.py`
- `apps/web/lib/api/server.ts`

**Estimated scope:** M

### Task 7: Native Folder Picker Boundary

**Description:** Define and implement the local folder picker boundary for `New project`. If browser-only cannot open a native picker, use a backend/system adapter or a controlled fallback that still begins the Setup subflow only after a chosen folder exists.

**Acceptance criteria:**
- [x] `New project` does not route directly to Setup without a selected folder.
- [x] Folder picker cancelled, permission denied, invalid path, and non-empty folder states are represented.
- [x] No arbitrary root media is imported during folder selection.

**Verification:**
- [x] `rtk pnpm -F @vc/server test -- test_setup_route.py`
- [x] `rtk pnpm -F @vc/web test -- app/page.test.tsx lib/setup/useSetupDraft.test.ts`
- [x] Manual check Launcher -> New project -> cancelled and success paths.

**Dependencies:** Task 6

**Files likely touched:**
- `apps/server/server/routes/projects.py`
- `apps/server/server/routes/setup.py`
- `apps/web/app/page.tsx`
- `apps/web/lib/setup/useSetupDraft.ts`
- `apps/web/lib/i18n/messages/*.json`

**Estimated scope:** M

### Task 8: Setup Inspect And Alignment Flow

**Description:** Make Setup match prototype behavior: selected folder, detected voice/transcript, optional watermark, explicit `Run alignment API`, status card, cache state, and `Continue to editor` enabled only after alignment succeeds.

**Acceptance criteria:**
- [x] Setup shows `Detect inputs and align`, project name, output preset, detected voice/transcript, optional watermark chooser, and alignment card as in prototype.
- [x] `Run alignment API` calls backend alignment route and transitions pending/running/succeeded/failed.
- [x] `Continue to editor` is disabled until alignment succeeds.
- [x] Alignment artifacts are cached and cache hit is shown on repeat runs.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- app/setup components/setup lib/setup`
- [x] `rtk pnpm -F @vc/server test -- test_setup_route.py test_alignment_integration.py`
- [x] Browser check against prototype Setup page.

**Dependencies:** Tasks 6, 7

**Files likely touched:**
- `apps/web/app/setup/page.tsx`
- `apps/web/components/setup/AlignmentCard.tsx`
- `apps/web/components/setup/StatusTile.tsx`
- `apps/web/lib/setup/useSetupDraft.ts`
- `apps/server/server/routes/alignment.py`
- `apps/server/server/routes/setup.py`

**Estimated scope:** M

### Task 9: Recent Projects Launcher Parity

**Description:** Refactor Launcher to the prototype layout and states: header, `New project`, recent cards only, optional play render action for rendered projects, no runtime/tips/open-folder/create-another UI.

**Acceptance criteria:**
- [x] Top-level Launcher shows product header, `LOCAL WORKSPACE`, `Recent projects`, and a single `New project` button.
- [x] Project cards show thumbnail, name, voice duration, sentence count, media count, last opened, alignment/render status, and optional current render status.
- [x] Raw folder paths are not shown in primary project cards.
- [x] Rendered project cards expose `Play render` and call backend play/open for latest successful render.
- [x] Empty, missing folder, corrupt config, alignment pending/failed, running render, picker cancelled, and permission denied states render cleanly.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- app/page.test.tsx components/launcher`
- [x] Browser check Launcher page against prototype.

**Dependencies:** Tasks 3, 6, 7

**Files likely touched:**
- `apps/web/app/page.tsx`
- `apps/web/components/launcher/ProjectCard.tsx`
- `apps/web/components/launcher/ProjectThumb.tsx`
- `apps/web/components/launcher/*.test.tsx`
- `apps/web/lib/i18n/messages/*.json`

**Estimated scope:** M

### Checkpoint: Launcher And Setup Flow

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/web test -- app/page app/setup components/launcher components/setup`
- [ ] Manual flow: Launcher -> New project -> Setup -> Run alignment -> Editor.
- [ ] Manual flow: rendered project -> Play render.

## Phase 3: App Shell And Routing Parity

### Task 10: Remove Product-Visible Global Navigation

**Description:** Update the shell to match Phase 1: no visible route nav, no persistent theme/language controls, no phase suffix, and no center live status segment.

**Acceptance criteria:**
- [x] Top shell shows only `VC` and `Video Creator`; no `phase 1 / local`.
- [x] No visible Launcher/Setup/Editor/Render/Tokens navigation.
- [x] Theme/language controls are moved to dev/settings surfaces or hidden in normal builds.
- [x] Bottom shell keeps only left command pill and right version badge.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- components/app-shell`
- [x] Browser check shell on Launcher, Setup, Editor, and Render.

**Dependencies:** None

**Files likely touched:**
- `apps/web/components/app-shell/AppShell.tsx`
- `apps/web/components/app-shell/AppShell.test.tsx`
- `apps/web/styles/globals.css`

**Estimated scope:** S

### Task 11: Route Guard By Project Id

**Description:** Enforce route rules: Launcher always reachable; Setup is subflow-only; Editor/Render require valid `project_id` and redirect to Launcher otherwise.

**Acceptance criteria:**
- [x] Editor route uses `/editor/:projectId` or equivalent project-id query consistently.
- [x] Render route uses `/render/:projectId` or equivalent project-id query consistently.
- [x] Invalid/missing ids redirect or show Launcher recovery, not path-based blank states.
- [x] Tokens page is hidden from product navigation and can remain dev-only.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- app/editor app/render app/page-chrome`
- [x] Manual deep-link checks.

**Dependencies:** Task 6

**Files likely touched:**
- `apps/web/app/editor/page.tsx`
- `apps/web/app/render/page.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/components/app-shell/AppShell.tsx`

**Estimated scope:** S

### Checkpoint: Shell And Routing

- [ ] Prototype shell comparison passes on all top-level screens.
- [ ] Route deep links behave as specified.
- [ ] No route nav or Tokens page appears in product UI.

## Phase 4: Editor State, Save, And Recovery

### Task 12: Project Config Load/Save Through SQLite

**Description:** Change Editor from direct `project.json` layer updates to full config load/save through `project_configs` and config hashes.

**Acceptance criteria:**
- [x] Editor loads project title, audio, transcript/alignment, media, layers, subtitles, watermark, output, and render metadata from `GET /projects/:projectId/config`.
- [x] `Save` sends the full current working config to `PUT /projects/:projectId/config`.
- [x] Save states show pending/saving/saved/failed.
- [x] Already-rendered project render buttons enable only when config hash differs from latest successful render hash.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- app/editor lib/hooks/useProject.test.ts`
- [x] `rtk pnpm -F @vc/server test -- test_project_load.py test_layers_endpoint.py`
- [x] Manual Save and reload preserves all global config and layers.

**Dependencies:** Tasks 4, 6, 11

**Files likely touched:**
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/hooks/useProject.ts`
- `apps/web/components/editor/types.ts`
- `apps/server/server/routes/projects.py`

**Estimated scope:** M

### Task 13: Browser Working State And Incremental Operation Log

**Description:** Implement browser-local recovery and undo/redo as incremental operations, not full config snapshots on every operation.

**Acceptance criteria:**
- [x] Browser storage records edit operations such as add, patch, delete, move, stretch, reorder, global config update, subtitle settings update, and watermark update.
- [x] Reload can recover unsaved working state for the active project.
- [x] `Ctrl/Cmd+Z` undo and `Ctrl/Cmd+Shift+Z` redo apply inverse operations.
- [x] Shortcuts do not fire while typing in input, textarea, select, or contenteditable.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- lib/editor-operation-log components/editor`
- [x] Manual add/move/stretch/undo/redo/reload recovery.

**Dependencies:** Task 12

**Files likely touched:**
- `apps/web/lib/editor/operation-log.ts`
- `apps/web/lib/editor/useEditorHistory.ts`
- `apps/web/app/editor/page.tsx`
- `apps/web/components/editor/*.test.tsx`

**Estimated scope:** M

### Task 14: Editor Toolbar Parity

**Description:** Match prototype toolbar: home icon, project title, `projectId`, cache tag, `Save`, `Render Draft`, and `Render Final`; remove path crumb, open folder, change background, and subtitles toolbar actions.

**Acceptance criteria:**
- [x] Left toolbar has back/home icon, project title, and project id metadata only.
- [x] Right toolbar has cache status, `Save`, `Render Draft`, `Render Final`.
- [x] Render buttons follow spec enablement for new aligned projects and already-rendered projects.
- [x] Active render buttons attach to or disable against active jobs.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- components/editor/EditorBar.test.tsx app/editor/page.test.tsx`
- [x] Browser check Editor toolbar against prototype.

**Dependencies:** Tasks 12, 13

**Files likely touched:**
- `apps/web/components/editor/EditorBar.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/i18n/messages/*.json`

**Estimated scope:** S

### Task 15: Draft Render Strip

**Description:** Implement the draft render strip below the toolbar with queued/running/ready/failed/cancelled states and cancellation behavior.

**Acceptance criteria:**
- [x] Strip appears when draft render is active, queued, failed, cancelled, or recently completed.
- [x] Shows progressbar, fill, label, stage, percentage, and `Cancel` while cancellable.
- [x] Draft outputs write to `.vc/drafts`, and cancelled partial drafts are excluded from playback.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- components/editor/RenderStrip.test.tsx`
- [x] `rtk pnpm -F @vc/server test -- test_render_endpoint.py test_render_progress.py`
- [x] Manual draft render and cancel.

**Dependencies:** Tasks 5, 12, 14

**Files likely touched:**
- `apps/web/components/editor/RenderStrip.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/routes/render.py`

**Estimated scope:** M

### Checkpoint: Editor Save Foundation

- [ ] Config save/load uses SQLite snapshots.
- [ ] Browser operation log recovers unsaved edits.
- [ ] Toolbar and draft strip match prototype.
- [ ] Render enablement rules are manually verified.

## Phase 5: Editor Transcript, Preview, Timeline, And Layers

### Task 16: Transcript Pane Interactions

**Description:** Complete transcript pane behavior from spec and prototype.

**Acceptance criteria:**
- [x] Search input, keyboard hint, `Transcript - N aligned`, selection chip, sentence rows, and add handles match prototype.
- [x] Click sentence selects and seeks; shift-click selects contiguous range; right-click and `+` open context menu.
- [x] Search filters or highlights matches, Enter/Down advances, Escape clears.
- [x] Current sentence follows playhead, and orphan/low-confidence/search states are visually distinct.
- [x] Sentence merge/concatenate belongs in Transcript pane and updates dependent clip anchors.

**Verification:**
- [x] `rtk pnpm -F @vc/web test -- components/editor/TranscriptPane.test.tsx`
- [x] Manual transcript selection/search/context-menu checks.

**Dependencies:** Tasks 12, 13

**Files likely touched:**
- `apps/web/components/editor/TranscriptPane.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/editor/sentences.ts`

**Estimated scope:** M

### Task 17: Transcript Context Menu Parity

**Description:** Make sentence context menu match prototype and spec, with no Cancel row.

**Acceptance criteria:**
- [ ] Menu opens from right-click or sentence `+`.
- [ ] Contains `Assign media to range...` and `Play from here`.
- [ ] No disabled `Cancel` item appears.
- [ ] Menu closes on selection, outside click, or component-native dismissal without adding global Escape behavior.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/editor/TranscriptPane.test.tsx`
- [ ] Browser check context menu.

**Dependencies:** Task 16

**Files likely touched:**
- `apps/web/components/editor/TranscriptPane.tsx`
- `apps/web/components/editor/EditorModal.tsx`

**Estimated scope:** S

### Task 18: Preview Surface Parity

**Description:** Align preview with prototype: direct canvas fit, background/foreground/PiP/subtitles/watermark states, playback controls, resolution buttons, and no `Fit/Actual` control.

**Acceptance criteria:**
- [ ] Preview supports no background, background only, foreground over background, no foreground, no PiP, multiple PiP, subtitles off/on, watermark off/on, playing, and paused.
- [ ] Resolution buttons are `1080p`, `720p`, and `9:16`.
- [ ] Watermark uses selected image/video asset from global video config.
- [ ] Text and overlays do not overlap incoherently at desktop and mobile-ish widths.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/editor/PreviewSurface.test.tsx lib/preview`
- [ ] Browser visual check against prototype.

**Dependencies:** Tasks 12, 14

**Files likely touched:**
- `apps/web/components/editor/PreviewSurface.tsx`
- `apps/web/components/editor/PreviewControls.tsx`
- `apps/web/lib/preview/resolveDisplay.ts`

**Estimated scope:** M

### Task 19: Timeline Clip Interactions

**Description:** Implement timeline behavior for seek, select, move, resize, delete, waveform, and sentence synchronization.

**Acceptance criteria:**
- [ ] Ruler/waveform click seeks.
- [ ] Clip click selects and populates Inspector.
- [ ] Drag left/right grips resizes start/end seconds and automatically updates sentence range.
- [ ] Drag body moves start/end together and synchronizes transcript current/selection state during drag.
- [ ] Background, foreground, PiP, and subtitle clips support timing interactions where applicable.
- [ ] Delete selected non-background clip through clip `x`, Delete, or Backspace.
- [ ] Deleting the last item in a foreground/PiP layer removes that layer.
- [ ] Resize/move clamps: start `>= 0`, end `<=` voice duration, minimum clip duration `0.5s`; the covered sentence range is recomputed from the updated time span.
- [ ] Timeline keeps a fixed height; when layers overflow, the track area scrolls without resizing the preview or pushing the Inspector off screen.
- [ ] Overlapping foreground/PiP clips are auto-placed on different layers (or surface a validation state); non-overlapping clips may share a layer.
- [ ] Waveform spans the full voice duration and full timeline width.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/timeline components/editor/Timeline.test.tsx`
- [ ] Manual drag/stretch/delete checks.

**Dependencies:** Tasks 12, 13, 16

**Files likely touched:**
- `apps/web/components/editor/Timeline.tsx`
- `apps/web/components/timeline/*.tsx`
- `apps/web/lib/layers.ts`
- `apps/web/lib/editor/time-range.ts`

**Estimated scope:** M

### Task 20: Layers Popover Parity

**Description:** Match prototype/spec layers popover: layer rows/counts, active layer selection, clip labels, delete behavior, and no footer add button.

**Acceptance criteria:**
- [ ] Popover opens from `Layers - N`.
- [ ] Shows Subtitle, PiP, Foreground, and Background rows with counts and clip labels.
- [ ] Selecting a clip updates Inspector and timeline selection.
- [ ] Delete appears for eligible non-background clips.
- [ ] No `Add layer item` footer exists.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/editor/LayersPopover.test.tsx components/layers-popover`
- [ ] Browser check against prototype.

**Dependencies:** Tasks 18, 19

**Files likely touched:**
- `apps/web/components/editor/LayersPopover.tsx`
- `apps/web/components/layers-popover/LayersPopover.tsx`

**Estimated scope:** S

### Checkpoint: Editor Core Interactions

- [ ] Transcript, context menu, preview, timeline, and layers popover match prototype.
- [ ] All editor component tests pass.
- [ ] Manual editor interaction matrix passes for select, seek, add, move, stretch, delete, undo, redo.

## Phase 6: Editor Modals And Inspector

### Task 21: Assign Media Modal

**Description:** Implement assign media flow for range/context/asset card sources with import/upload, image/video badges, overlap rules, replacement, and validation.

**Acceptance criteria:**
- [ ] Modal opens from context menu, sentence `+`, and Inspector asset card.
- [ ] Supports media upload/import; no arbitrary files are auto-picked from selected project folder.
- [ ] Shows supported image/video badges including common decoder-supported formats.
- [ ] Assigning media creates/replaces foreground or PiP layer items according to overlap rules.
- [ ] Rejects unsupported media, empty selection, invalid range, missing/corrupt thumb, and overly large media with clear states.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/assign-modal components/editor/EditorModal.test.tsx`
- [ ] `rtk pnpm -F @vc/server test -- test_media_upload.py test_layers_endpoint.py`
- [ ] Manual upload/assign/change flow.

**Dependencies:** Tasks 12, 16, 19

**Files likely touched:**
- `apps/web/components/assign-modal/AssignModal.tsx`
- `apps/web/components/editor/EditorModal.tsx`
- `apps/server/server/routes/media.py`
- `apps/server/server/routes/projects.py`

**Estimated scope:** M

### Task 22: Background Modal Playlist Semantics

**Description:** Make Background modal support multiple assets explicitly as in prototype, with image and video playlist semantics.

**Acceptance criteria:**
- [ ] Modal opens from Background layer/Inspector, not toolbar `Change BG`.
- [ ] User can upload/import and select/reorder multiple background assets.
- [ ] Image playlist splits total duration evenly with crossfade.
- [ ] Video playlist plays sequentially; if videos end early, black fallback or cut behavior follows spec.
- [ ] UI clearly shows current background assets on page and in inspector.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/bg-modal`
- [ ] Manual background multiple-assets flow.

**Dependencies:** Tasks 12, 19, 21

**Files likely touched:**
- `apps/web/components/bg-modal/BgModal.tsx`
- `apps/web/components/editor/Inspector.tsx`
- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/lib/layers.ts`

**Estimated scope:** M

### Task 23: Global Video Config Panel

**Description:** Add/finish the top Inspector rail global config section for Watermark and Subtitles backed by SQLite config.

**Acceptance criteria:**
- [ ] Global config panel appears above selected item inspector and shows `GLOBAL VIDEO CONFIG` plus SQLite tag.
- [ ] Watermark row opens Watermark asset modal and shows selected asset or off state.
- [ ] Subtitles row opens Subtitles modal and shows burn-in/sidecar state.
- [ ] Old `Change BG` global button is removed.
- [ ] Changes update browser working state and save to `project_configs` only on Save.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/editor/Inspector.test.tsx components/watermark-panel components/subtitle-toggle`
- [ ] Browser check Editor right rail.

**Dependencies:** Tasks 12, 13

**Files likely touched:**
- `apps/web/components/editor/Inspector.tsx`
- `apps/web/components/watermark-panel/WatermarkPanel.tsx`
- `apps/web/components/subtitle-toggle/SubtitleToggle.tsx`
- `apps/web/app/editor/page.tsx`

**Estimated scope:** M

### Task 24: Watermark Asset Modal

**Description:** Implement the prototype watermark modal with enable switch, upload image/video watermark row, asset grid, selected state, and video loop semantics.

**Acceptance criteria:**
- [ ] Modal title/copy match prototype intent: image or video watermark, video loops over render.
- [ ] Upload accepts image/video watermark files and adds them to project media.
- [ ] Asset grid includes image/video badges and selected state.
- [ ] Current watermark text reflects image overlay or video loop.
- [ ] Watermark off state persists in working config and saved config.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/watermark-panel components/editor`
- [ ] `rtk pnpm -F @vc/server test -- test_media_upload.py test_filtergraph.py`
- [ ] Manual upload/select/off flow.

**Dependencies:** Tasks 21, 23

**Files likely touched:**
- `apps/web/components/watermark-panel/WatermarkPanel.tsx`
- `apps/web/components/editor/EditorModal.tsx`
- `apps/server/server/pipeline/filtergraph.py`

**Estimated scope:** M

### Task 25: Subtitles Modal

**Description:** Implement Subtitles modal per spec: burn-in on/off, top/bottom, style, max chars, save/cancel, no cue list or per-cue merge.

**Acceptance criteria:**
- [ ] Modal controls cover burn-in, background style none/pill/block/shadow, top/bottom, font/size/max chars as applicable.
- [ ] Long cue overflow and no alignment cues states render safely.
- [ ] Save updates working config; Cancel closes without saving.
- [ ] Cue merge is not present in this modal.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/editor/EditorModal components/subtitle-toggle`
- [ ] Manual subtitle settings flow.

**Dependencies:** Tasks 16, 23

**Files likely touched:**
- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/components/subtitle-toggle/SubtitleToggle.tsx`
- `apps/server/server/pipeline/srt.py`

**Estimated scope:** S

### Task 26: Inspector Per-Clip Controls

**Description:** Complete Inspector controls for subtitle, background, foreground, and PiP selected items.

**Acceptance criteria:**
- [ ] Subtitle inspector supports burn-in display and relevant subtitle settings states.
- [ ] Background inspector shows multiple assets, cycle/crossfade, motion, and remove background.
- [ ] Foreground inspector shows asset card, sentence range, resolved time range, motion, transitions, and delete.
- [ ] PiP inspector shows asset card, 3x3 placement grid, edge margins, size/radius/opacity, range, motion, transitions, and delete.
- [ ] Invalid ranges, orphaned media, missing thumbnails, cache states, and locked background deletion are handled.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- components/inspector components/editor/Inspector.test.tsx`
- [ ] Manual select each clip type and edit controls.

**Dependencies:** Tasks 19, 22, 23, 25

**Files likely touched:**
- `apps/web/components/editor/Inspector.tsx`
- `apps/web/components/inspector/InspectorPanel.tsx`
- `apps/web/lib/layers.ts`

**Estimated scope:** M

### Checkpoint: Editor Modals And Inspector

- [ ] Assign Media, Background, Watermark, and Subtitles modals match prototype/spec.
- [ ] Inspector handles all layer kinds and boundary states.
- [ ] Project config save/reload preserves all global and clip settings.

## Phase 7: Render Page And Pipeline Parity

### Task 27: Render Page Header And Layout

**Description:** Match Render page prototype: current-project only, header, render progress card, ffmpeg log, output panel, current project render history, and after-render actions.

**Acceptance criteria:**
- [ ] Title is project title plus resolution, e.g. `Tokyo Essay - 1080p`, without `MP4`.
- [ ] Header has `Back to editor` and `Cancel render`.
- [ ] Layout visually matches prototype and does not show global queue across projects.
- [ ] Render page redirects/recovers if project id is invalid.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- app/render components/render`
- [ ] Browser check Render page against prototype.

**Dependencies:** Tasks 5, 6, 11

**Files likely touched:**
- `apps/web/app/render/page.tsx`
- `apps/web/components/render/*.tsx`
- `apps/web/lib/render/*.ts`

**Estimated scope:** M

### Task 28: Render Progress And Event Streaming

**Description:** Drive Render page from persisted/in-memory render events with the exact stages and live ffmpeg log behavior from the spec.

**Acceptance criteria:**
- [ ] Stages are queued, verify alignment cache, pre-render cached clips, build subtitles, compose filtergraph, mux MP4 with `+faststart`, append history.
- [ ] Progress card shows output filename, specs, status tag, big progress bar, percent, encode speed, ETA, and frames.
- [ ] Log card shows `ffmpeg log`, `tail - live`, timestamped lines, and info/ok/warning/error/fatal tones.
- [ ] Refreshing Render page recovers current state from DB/events.
- [ ] Multiple concurrent render requests are queued by the backend in submission order and surfaced live in the current project's UI.

**Verification:**
- [ ] `rtk pnpm -F @vc/server test -- test_render_progress.py test_render_endpoint.py`
- [ ] `rtk pnpm -F @vc/web test -- lib/render components/render`
- [ ] Manual active render page refresh.

**Dependencies:** Tasks 5, 27

**Files likely touched:**
- `apps/server/server/pipeline/render_progress.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/routes/ws.py`
- `apps/web/lib/render/useRenderJob.ts`
- `apps/web/components/render/RenderCard.tsx`
- `apps/web/components/render/LogCard.tsx`

**Estimated scope:** M

### Task 29: Render Output Panel And History Rows

**Description:** Populate output metadata and render history rows per spec, backed by `render_history` and `render_artifacts`.

**Acceptance criteria:**
- [ ] Output panel shows file, resolution, framerate, video codec/CRF/preset, audio codec/bitrate/sample rate, color/pixel format, and actual file size when present.
- [ ] History rows show icon, filename, resolution/preset, duration, file size, status, reveal folder for successful outputs, and trash for cancelled/partial/error where applicable.
- [ ] History empty, output missing, warning, fatal error, cancelled, partial, and done states are represented.

**Verification:**
- [ ] `rtk pnpm -F @vc/server test -- test_render_history.py`
- [ ] `rtk pnpm -F @vc/web test -- components/render-history components/render`
- [ ] Manual history with done/cancelled/error entries.

**Dependencies:** Tasks 5, 27, 28

**Files likely touched:**
- `apps/web/components/render/OutputPanel.tsx`
- `apps/web/components/render/HistoryPanel.tsx`
- `apps/web/components/render-history/RenderHistory.tsx`
- `apps/server/server/routes/render.py`

**Estimated scope:** M

### Task 30: Render Cancel And Partial Handling

**Description:** Implement active render cancellation exactly as specified, including confirmation and partial-file semantics.

**Acceptance criteria:**
- [ ] Active cancel asks for confirmation if a partial file may remain.
- [ ] One cancel request is sent; repeated clicks do not send duplicates.
- [ ] Job moves to cancelling/cancelled.
- [ ] Partial file receives `.partial`, history row marks partial/cancelled, and partial outputs cannot be played.

**Verification:**
- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py test_render_progress.py`
- [ ] `rtk pnpm -F @vc/web test -- lib/render/useRenderCancel.test.ts components/render`
- [ ] Manual cancel mid-render.

**Dependencies:** Tasks 28, 29

**Files likely touched:**
- `apps/server/server/pipeline/render.py`
- `apps/server/server/routes/render.py`
- `apps/web/lib/render/useRenderCancel.ts`
- `apps/web/app/render/page.tsx`

**Estimated scope:** M

### Task 31: After Render Play And Reveal Actions

**Description:** Ensure successful outputs can be played locally and revealed only when backend host OS operations are available.

**Acceptance criteria:**
- [ ] `Play locally` is enabled only for successful existing outputs and calls backend open/play.
- [ ] `Reveal in Explorer` appears/enables only if backend reveal is supported and path is allowed.
- [ ] Launcher `Play render` uses latest successful render artifact.
- [ ] Missing output shows output-missing state rather than trying to play.

**Verification:**
- [ ] `rtk pnpm -F @vc/server test -- test_render_endpoint.py`
- [ ] `rtk pnpm -F @vc/web test -- components/render app/page`
- [ ] Manual play/reveal from Launcher and Render.

**Dependencies:** Tasks 9, 29

**Files likely touched:**
- `apps/server/server/routes/render.py`
- `apps/web/lib/render/useSystemActions.ts`
- `apps/web/components/render/AfterRenderPanel.tsx`
- `apps/web/components/launcher/ProjectCard.tsx`

**Estimated scope:** S

### Checkpoint: Render Flow

- [ ] Draft and final render flows work from Editor through Render.
- [ ] Render history persists and reloads.
- [ ] Cancelled/partial outputs are excluded from play.
- [ ] Launcher can play latest successful rendered project.

## Phase 8: Rendering Semantics And Cache Correctness

### Task 32: Filtergraph Support For Spec Layer Model

**Description:** Ensure backend rendering composes subtitles, PiP, foreground, background playlists, watermark image/video, transitions, and motion according to the saved config.

**Acceptance criteria:**
- [ ] Render order is subtitles above PiP above foreground above background above black fallback.
- [ ] Background image playlist and video playlist behavior matches spec.
- [ ] PiP placement margins, size, radius, opacity, and z-order are respected.
- [ ] Watermark image overlays and video watermarks loop over render.
- [ ] Unsupported decoder types fail with clear errors before render starts.

**Verification:**
- [ ] `rtk pnpm -F @vc/server test -- test_filtergraph.py test_clip_cache.py`
- [ ] Manual smoke render with bg playlist, fg, PiP, subtitles, watermark.

**Dependencies:** Tasks 22, 24, 26, 28

**Files likely touched:**
- `apps/server/server/pipeline/filtergraph.py`
- `apps/server/server/pipeline/clip_render.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/tests/test_filtergraph.py`

**Estimated scope:** M

### Task 33: Alignment And Render Artifact Cache Reuse

**Description:** Make alignment and render/generated artifacts cacheable and invalidated by content/config hashes.

**Acceptance criteria:**
- [ ] Alignment cache uses audio/transcript hash and regenerates `subtitles.srt` when valid.
- [ ] Clip/pre-render cache uses media/config-relevant hashes.
- [ ] Render artifacts can be reused only when project id, config hash, preset, and source hashes match.
- [ ] Cache warm/partial/cold/invalid labels are available to Editor and Render UI.

**Verification:**
- [ ] `rtk pnpm -F @vc/server test -- test_alignment_subtitles.py test_clip_cache.py test_render_endpoint.py`
- [ ] Manual repeat render shows warm cache.

**Dependencies:** Tasks 4, 5, 32

**Files likely touched:**
- `apps/server/server/pipeline/cache.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/db/renders.py`
- `apps/web/lib/hooks/useProject.ts`

**Estimated scope:** M

### Task 34: Thumbnail Generation For Launcher

**Description:** Generate and store deterministic placeholder thumbnails and latest-render thumbnails.

**Acceptance criteria:**
- [ ] New project without render receives deterministic three-color placeholder thumbnail.
- [ ] Latest successful render can provide first-frame thumbnail.
- [ ] Project card prefers latest render thumbnail; otherwise placeholder.
- [ ] Missing thumbnail regenerates or falls back cleanly.

**Verification:**
- [ ] `rtk pnpm -F @vc/server test -- test_projects_route.py test_render_history.py`
- [ ] `rtk pnpm -F @vc/web test -- components/launcher/ProjectThumb.test.tsx`
- [ ] Manual Launcher thumbnail check.

**Dependencies:** Tasks 3, 5, 9

**Files likely touched:**
- `apps/server/server/db/projects.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/routes/projects.py`
- `apps/web/components/launcher/ProjectThumb.tsx`

**Estimated scope:** S

### Checkpoint: Rendering Semantics

- [ ] Smoke project renders with all layer kinds.
- [ ] Cache labels and repeated render behavior are correct.
- [ ] Launcher thumbnails match spec fallback rules.

## Phase 9: Edge Cases, Accessibility, And Tests

### Task 35: Edge Case State Matrix

**Description:** Add targeted handling and tests for the spec edge cases across Launcher, Setup, Editor, and Render.

**Acceptance criteria:**
- [ ] Covers no recent projects, missing folder, corrupt config, alignment missing/pending/failed, folder picker cancelled, permission denied, no media, no background, no foreground, no PiP, long subtitle, missing output, partial output, ffmpeg warning/fatal, and history empty.
- [ ] Each state has visible UI copy/actions and no uncaught runtime error.
- [ ] API errors map to stable UI states.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/server test`
- [ ] Manual walkthrough for high-risk states.

**Dependencies:** Tasks 9, 17, 18, 19, 27, 30

**Files likely touched:**
- `apps/web/app/*.test.tsx`
- `apps/web/components/**/*.test.tsx`
- `apps/server/tests/*.py`

**Estimated scope:** M

### Task 36: Keyboard Shortcut Coverage

**Description:** Implement and test Phase 1 keyboard shortcuts with correct focus boundaries.

**Acceptance criteria:**
- [ ] `Cmd/Ctrl+F` focuses transcript search.
- [ ] Space toggles preview playback outside form controls.
- [ ] Arrow keys move sentence/seek as specified.
- [ ] Delete/Backspace deletes selected non-background item.
- [ ] `Cmd/Ctrl+Z` undo and `Cmd/Ctrl+Shift+Z` redo work from incremental operation log.
- [ ] Shortcuts do not fire in input, textarea, select, or contenteditable unless explicitly for that control.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test -- lib/hooks components/editor`
- [ ] Manual keyboard pass in Editor.

**Dependencies:** Tasks 13, 16, 19

**Files likely touched:**
- `apps/web/lib/hooks/useEditorHotkeys.ts`
- `apps/web/app/editor/page.tsx`
- `apps/web/components/editor/*.test.tsx`

**Estimated scope:** S

### Task 37: Accessibility And Responsive Visual Audit

**Description:** Verify the prototype-matched UI remains accessible and responsive.

**Acceptance criteria:**
- [ ] Buttons, switches, menus, dialogs, progress bars, and timeline controls have usable labels/roles.
- [ ] Dialog focus and dismissal are component-native and predictable.
- [ ] Text fits within buttons/cards/rails at desktop and narrow widths.
- [ ] No nested-card visual antipatterns are introduced beyond repeated item cards and modals.

**Verification:**
- [ ] `rtk pnpm -F @vc/web test`
- [ ] Browser snapshots for Launcher, Setup, Editor, Watermark modal, Background modal, Render at desktop and narrow viewport.
- [ ] Chrome DevTools(claude in chrome) accessibility/Lighthouse snapshot where practical.

**Dependencies:** Tasks 9, 10, 18, 21, 22, 24, 27

**Files likely touched:**
- `apps/web/styles/globals.css`
- `apps/web/components/**/*.tsx`
- `apps/web/**/*.test.tsx`

**Estimated scope:** M

### Task 38: End-To-End Fixture Flow

**Description:** Add a repeatable fixture-driven flow that exercises the main product path.

**Acceptance criteria:**
- [ ] Fixture creates/opens a project, inspects inputs, runs/caches alignment, enters Editor, uploads media, assigns a clip, saves config, starts render, observes history, and plays latest render when available.
- [ ] Flow can run in CI without GPU by mocking alignment/render heavy operations.
- [ ] Real local smoke flow is documented for manual GPU/ffmpeg verification.

**Verification:**
- [ ] `rtk pnpm test`
- [ ] `rtk pnpm build`
- [ ] Manual smoke: `rtk pnpm dev`, browser walkthrough.

**Dependencies:** All prior implementation tasks

**Files likely touched:**
- `apps/server/tests/fixtures/*`
- `apps/server/tests/test_setup_test01_fixture.py`
- `apps/web/app/*.test.tsx`
- `docs/designs/SPEC.md` only if test procedure documentation needs a small note

**Estimated scope:** M

### Task 39: Spec Reconciliation Cleanup

**Description:** Close the remaining gaps between earlier (already-landed) tasks and `docs/designs/SPEC.md` that were not covered by their original acceptance criteria.

**Acceptance criteria:**
- [ ] No `project.json` is written into the project folder anywhere in the pipeline or routes; canonical config is SQLite `project_configs` only.
- [ ] No `runtime_checks` table exists; runtime status is served from live health endpoints.
- [ ] `app_settings` retains only `default_output_preset`; a migration removes `theme`, `language`, `show_statusbar`, `last_project_path`, and `render_history_filter` if present.
- [ ] `projects` table includes `palette_seed` (and the other spec columns: `voice_duration_s`, `sentence_count`, `media_count`, `thumbnail_path`, `project_mtime`, `exists_on_disk`, `current_config_hash`, `last_rendered_config_hash`, `has_unrendered_changes`, `last_error`).
- [ ] Editor API exposes `GET /projects/:projectId/render-cache`; system actions expose `POST /system/reveal` and `POST /system/open`.
- [ ] Alignment writes `<project>/subtitles.srt` at the project root (never under `.vc/`), with cues adjusted to the transcript content; the transcript pane sentence list is derived from that file.
- [ ] Tweaks panel is dev-only and hidden in normal builds (same as Tokens/theme/language).

**Verification:**
- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk grep -rn "project.json" apps/server apps/web` shows only export/compat code paths, not canonical-store writes.

**Dependencies:** Tasks 2, 3, 4, 6, 8, 10

**Files likely touched:**
- `apps/server/server/db/migrations/*.sql`
- `apps/server/server/db/projects.py`
- `apps/server/server/db/app_db.py`
- `apps/server/server/routes/projects.py`
- `apps/server/server/routes/render.py`
- `apps/web/components/tweaks-panel/*`

**Estimated scope:** S

### Final Checkpoint: Ready For Review

- [ ] `rtk pnpm lint`
- [ ] `rtk pnpm test`
- [ ] `rtk pnpm build`
- [ ] Browser visual comparison with prototype for Launcher, Setup, Editor, Assign Media, Background, Watermark, Subtitles, Render.
- [ ] Database migration review complete.
- [ ] No product-visible Tokens nav or dev-only controls.
- [ ] No raw project paths in primary Launcher/Editor UI.
- [ ] Human review approves parity before implementation is considered complete.

## Parallelization Opportunities

- Tasks 1-5 should be mostly sequential because they establish contracts and DB schema.
- After Task 6, Launcher/Setup UI tasks can proceed in parallel with App Shell cleanup.
- Editor modal tasks can be split after Task 12 and Task 13 are stable, but they must share the same config/update API.
- Render UI tasks can run in parallel with Editor visual tasks after render DB artifacts are available.
- Edge case and accessibility test tasks should run after each phase, with a final comprehensive pass at the end.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Path-based existing code conflicts with `project_id` model | High | Add compatibility adapters, migrate APIs in layers, and keep tests for both during transition. |
| SQLite migration breaks existing app DB | High | Add migration runner tests with old schema fixtures before changing production initialization. |
| Full Editor refactor grows too large | High | Keep state/save foundation separate from visual/interactions/modal tasks. |
| Browser operation log and SQLite save semantics conflict | Medium | Define working config as browser-local until explicit Save; tests verify no full config is written on every undo/redo. |
| Render artifacts table duplicates source media responsibilities | Medium | Enforce generated-artifact-only rules in schema/accessor tests. |
| Prototype visual parity regresses accessibility | Medium | Pair browser visual checks with component role/label tests. |
| Native folder picker unavailable in browser-only mode | Medium | Implement a backend/system adapter or explicit fallback, and keep Setup subflow gated on selected folder. |

## Open Questions

- The spec says `New project` opens a native folder picker. The current web stack may need a backend/system picker adapter; if that is not acceptable, the fallback UX must be approved before implementation.
- The route shape can be `/editor/:projectId` or project-id query during migration. The final product should settle on one route style before implementation begins.
- `Reveal in Explorer` is supported by the backend today with workspace path restrictions. Confirm whether this button should remain visible only after capability detection or simply disabled when unsupported.
