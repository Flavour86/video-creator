# Implementation Plan: Editor Spec

## Overview

Implement `docs/designs/SPEC_EDITOR.md` as the Editor contract for Phase 1. The work turns the current editor skeleton into a transcript/subtitle-anchored editing surface with explicit save-to-SQLite behavior, browser-side recovery operations, real media assignment, editable layer/timeline/inspector controls, draft/final render integration, precise cache invalidation, and visual parity coverage for every Editor screenshot state.

## Planning Assumptions

- `docs/designs/SPEC_EDITOR.md` is the source of truth for this plan.
- `docs/designs/SPEC.md` remains the parent product map, especially for persistence, commands, and quality gates.
- Existing `apps/web/app/editor/page.tsx` and `apps/web/components/editor/*` should be extended where practical, but placeholder modal/control behavior can be replaced.
- Existing shared schema files are generated from `packages/shared-schemas/project.schema.json`; generated TS/Python outputs are regenerated, not hand-edited.
- `tasks/global-backend/*` and `tasks/global-frontend/*` stay untouched; this plan owns the root `tasks/plan.md` and `tasks/todo.md` requested for the Editor spec.
- Verification commands use the repo convention from `RTK.md`, for example `rtk pnpm -F @vc/web test`.
- Planning is read-only for implementation code. This artifact is the handoff contract for later `as-build` work.

## Current Codebase Notes

- `apps/web/app/editor/page.tsx` already loads project config/media/alignment, renders the three-pane editor, wires search, draft progress websocket handling, and calls `PUT /projects/:projectId/config`.
- Current editor autosave calls `saveNow()` after layer changes, which syncs SQLite; the spec requires browser recovery autosave only, with SQLite canonical after explicit `Save`, `Render Draft`, or `Render Final`.
- `apps/web/lib/editor-operation-log/operation-log.ts` already supports add/patch/delete/move/stretch/global/subtitle/watermark operations, undo, redo, replay, and localStorage keys, but most editor interactions do not append operations yet.
- `apps/web/components/editor/EditorModal.tsx`, `Inspector.tsx`, `Timeline.tsx`, and `LayersPopover.tsx` are functional shells with several placeholder controls and missing mutation paths.
- `apps/server/server/routes/projects.py` already exposes `GET/PUT /projects/:projectId/config`; `routes/render.py` exposes project render routes but accepts body preset rather than the full Editor API query contract and does not expose a resolution parameter.
- `packages/shared-schemas/project.schema.json` has editor layer definitions, but several SPEC_EDITOR values differ: PiP size bounds, subtitle style enums, media asset metadata, output resolution presets, and background playlist semantics need alignment.
- Render pipeline files already exist for clip cache, filtergraph, render progress, subtitles, and render history, but draft progress stages and 9:16 rendering are incomplete relative to SPEC_EDITOR.

## Architecture Decisions

- Keep SQLite `project_configs.config_json` canonical only after explicit sync actions: `Save`, `Render Draft`, and `Render Final`.
- Keep browser storage as the recovery source for dirty in-session editor work: incremental operation log, selected item/range, scroll position, and resolution preset.
- Model editor changes as operations first, then derive working config from canonical config plus operation replay. Do not persist whole config snapshots for undo/redo.
- Transcript merge/concatenate updates are persisted to `project_configs` on explicit save/sync; `<project>/subtitles.srt` is regenerated when `Render Draft` or `Render Final` is queued.
- Treat `packages/shared-schemas/project.schema.json` as the shared contract for frontend, backend, and fixtures before wiring new UI mutation paths.
- Keep render order and timeline visual order as explicit helper functions that are tested independently and consumed by Preview, Timeline, Layers Popover, cache, and filtergraph code.
- Implement media import only through explicit upload/import flows. Do not auto-discover arbitrary project-folder media as editor resources.
- Use existing Tailwind/design primitives and lucide icons. Do not copy prototype CSS.

## Dependency Graph

```text
shared project schema and generated types
  -> backend config/render/upload contract
  -> frontend editor state helpers and operation log typing
      -> toolbar save/render enablement
      -> transcript merge and anchor remap
      -> media/background/subtitles/watermark modals
      -> inspector and timeline mutations
          -> preview/layers/timeline visual fidelity
          -> precise cache invalidation and render queueing
              -> E2E recovery/cache/re-record tests
              -> visual parity and performance gates
```

## Task List

### Phase 1: Contracts And Persistence

## Task 1: Align shared Editor config schema with the spec

**Description:** Update the canonical project schema so media assets, layer items, subtitle settings, render presets/resolution, cache/orphan fields, and PiP placement match `SPEC_EDITOR.md`, then regenerate shared TypeScript and Python models.

**Acceptance criteria:**

- [ ] Media assets include `id`, `name`, `kind`, `path`, `thumb_path`, dimensions, video duration, file size, content hash, import mode, and created/imported timestamp.
- [ ] Visual items allow `mediaId` or playlist `mediaIds`, inclusive `sentences`, `start`, `end`, motion, transitions, cache status, and orphan metadata.
- [ ] PiP placement uses canonical `posX` and `posY` fields, plus size `15..60`, radius `0..32`, and opacity `10..100`.
- [ ] Subtitle settings cover background `none/pill/block/shadow`, position `bottom/bottom_low/top`, font, max chars `20..80`, size `28..72`, and burn-in.
- [ ] Output/resolution settings cover `1080p`, `720p`, and `9:16`.
- [ ] Generated TS/Python schema outputs are refreshed from the JSON schema.

**Verification:**

- [ ] `rtk pnpm gen:types`
- [ ] `rtk pnpm gen:py`
- [ ] `rtk pnpm -F @vc/server test -- tests/test_project_schema.py tests/test_shared_api_schemas.py`
- [ ] `rtk pnpm -F @vc/web test -- lib/preview/resolveDisplay.test.ts lib/layers.test.ts`

**Dependencies:** None

**Files likely touched:**

- `packages/shared-schemas/project.schema.json`
- `packages/shared-schemas/ts/index.ts`
- `packages/shared-schemas/py/schemas.py`
- `apps/server/tests/test_project_schema.py`
- `apps/web/lib/preview/resolveDisplay.test.ts`

**Estimated scope:** Medium

## Task 2: Make Editor config sync explicit and browser recovery incremental

**Description:** Split browser recovery autosave from SQLite save. Editor mutations append incremental operations and mark the project dirty; only explicit `Save`, `Render Draft`, and `Render Final` sync the current working config to `project_configs`.

**Acceptance criteria:**

- [ ] Browser autosave writes `vc.editor.operations.<projectId>` and recovery metadata without calling `PUT /projects/:projectId/config`.
- [ ] `Save` builds the current config from canonical config plus operations, validates it through the shared schema, syncs it to SQLite, clears committed operations, and reports pending/saving/saved/failed states.
- [ ] Undo and redo do not send a config save request and still mark the working project dirty.
- [ ] Reloading the same project replays the operation log and restores selection, selected range, scroll position, and resolution preset.
- [ ] Malformed recovery state is discarded without blocking canonical project load.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- lib/editor-operation-log app/editor/page.test.tsx`
- [ ] Manual check: make an edit, reload before Save, verify recovery; click Save, verify operation log is cleared.

**Dependencies:** Task 1

**Files likely touched:**

- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/web/lib/editor-operation-log/operation-log.test.ts`
- `apps/web/app/editor/page.tsx`
- `apps/web/app/editor/page.test.tsx`
- `apps/web/components/editor/types.ts`

**Estimated scope:** Medium

## Task 3: Wire toolbar save/render enablement and render queue contract

**Description:** Complete the toolbar slice from UI state through backend render API: save-before-render, render enable rules, draft strip stages, and final navigation to the Render page.

**Acceptance criteria:**

- [ ] New aligned projects can run Draft/Final render even with no foreground/background/PiP.
- [ ] Already-rendered or running projects enable render only when the working config hash differs from the latest successful rendered config hash.
- [ ] Clicking `Render Draft` explicitly saves/syncs the current config, shows the draft strip, disables the button while queued/running, and queues a draft render with the selected resolution.
- [ ] Clicking `Render Final` explicitly saves/syncs the current config, queues a final render with the selected resolution, and navigates to `/render/:projectId/:render_id`.
- [ ] Draft strip labels cover queued, verifying cache, pre-rendering clips, building `subtitles.srt`, ffmpeg compose, muxing audio, done, failed, and cancelled.
- [ ] Toolbar exposes save, cache, and render states with accessible labels.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/EditorBar.test.tsx components/editor/RenderStrip.test.tsx app/editor/page.test.tsx`
- [ ] `rtk pnpm -F @vc/server test -- tests/test_render_endpoint.py tests/test_render_progress.py tests/test_projects_route.py`

**Dependencies:** Tasks 1-2

**Files likely touched:**

- `apps/web/components/editor/EditorBar.tsx`
- `apps/web/components/editor/RenderStrip.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/server/server/routes/render.py`
- `apps/server/server/pipeline/render_progress.py`

**Estimated scope:** Medium

### Checkpoint: Contracts And Persistence

- [ ] Tasks 1-3 pass.
- [ ] Editor no longer syncs SQLite through passive autosave.
- [ ] Render actions always queue from the latest explicitly saved working config.
- [ ] Shared schema and generated models are in sync.

### Phase 2: Transcript And Media Creation

## Task 4: Complete transcript selection, search, context menu, and merge behavior

**Description:** Finish the transcript pane as the subtitle-anchored editing surface: SRT/alignment-derived rows, current sentence sync, multi-select, search navigation, context menu actions, and merge with dependent clip-anchor remapping.

**Acceptance criteria:**

- [ ] Rows render sentence index, start/end timecode, text, selected/current/search/orphan/low-confidence states, and a no-results search state.
- [ ] Click selects and seeks; Shift-click selects a contiguous range; playhead changes highlight the current sentence.
- [ ] `Cmd/Ctrl+F` focuses transcript search; Enter/Down advances; Shift+Enter reverses; Escape clears search.
- [ ] Right-click opens the context menu at pointer position with Assign, Merge `<N>` sentences, and Play from here.
- [ ] Merge updates the subtitle/sentence model, remaps dependent clip anchors, marks orphaned anchors red where needed, and appends one operation-log entry.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/TranscriptPane.test.tsx app/editor/page.test.tsx`
- [ ] `rtk pnpm -F @vc/server test -- tests/test_alignment_subtitles.py tests/test_srt.py`

**Dependencies:** Tasks 1-2

**Files likely touched:**

- `apps/web/components/editor/TranscriptPane.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/server/server/pipeline/srt.py`
- `apps/web/components/editor/TranscriptPane.test.tsx`

**Estimated scope:** Medium

## Task 5: Implement explicit media import and asset metadata for Editor

**Description:** Replace placeholder media handling with an explicit upload/import path used by Assign and Background modals, returning full asset metadata and upload progress without auto-picking files from project folders.

**Acceptance criteria:**

- [ ] Global `POST /uploads` is the canonical media import route, invoked only after user action, and returns schema-valid media assets.
- [ ] Supported badges cover image/video types including `IMG`, `MP4`, `MOV`, `RMVB`, and `FLV` when backend decoder support exists.
- [ ] Duplicate files, same filename with different content, unsupported type, corrupt media, missing referenced file, huge video chunking, too-small image, and thumbnail failure are handled with recoverable states.
- [ ] Asset grid cards show thumbnail, name, kind badge, metadata, selected state, and per-card import progress.
- [ ] Imported assets are available to Assign/Edit and Background modals without reloading the page.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- tests/test_media_upload.py`
- [ ] `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx app/editor/page.test.tsx`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/server/server/routes/media.py`
- `apps/server/tests/test_media_upload.py`
- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/components/editor/types.ts`

**Estimated scope:** Medium

## Task 6: Add/Edit foreground and PiP clips from sentence ranges

**Description:** Implement the Assign/Edit Media to Range modal so users can create or edit fullscreen foreground and PiP clips from transcript ranges, with layer packing and cache invalidation.

**Acceptance criteria:**

- [ ] Create mode opens from transcript context with `from=to=clicked sentence`; edit mode opens from foreground/PiP inspector asset card.
- [ ] Range inputs clamp or reject out-of-bounds/reversed/missing timestamp ranges consistently and show the resolved time span and included sentence preview.
- [ ] Fullscreen creates/updates foreground clips; PiP creates/updates PiP clips with 3x3 placement, size, radius, opacity, motion/easing, and transitions.
- [ ] New clips go into an existing non-overlapping layer or a new layer according to foreground/PiP overlap rules.
- [ ] Submit stores clip parameters in working config, invalidates only the affected clip cache, selects the created/edited item, closes the modal, and appends one operation.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/editor/Inspector.test.tsx app/editor/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- lib/layers.test.ts lib/editor-operation-log`

**Dependencies:** Tasks 2, 4, 5

**Files likely touched:**

- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/layers.ts`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/web/components/editor/Inspector.tsx`

**Estimated scope:** Medium

## Task 7: Implement Background modal and background playlist behavior

**Description:** Add the Background modal and background inspector behavior for image/video playlists, crossfade, motion, easing, and removal while preserving the black fallback rules.

**Acceptance criteria:**

- [ ] Right rail global config shows `Add Background` when absent and `Change Background` when present.
- [ ] Background modal supports create/edit mode, multi-select, import, selected count, image-only/video-only kind lock, will-replace state, and invalid crossfade state.
- [ ] Image playlists distribute evenly across full voice duration; video playlists play in selected order, show black fallback when short, and trim when long.
- [ ] Existing background updates media, motion, easing, and crossfade without changing unrelated layers.
- [ ] Remove background deletes only the background layer/item, keeps other layers, marks the project dirty, and appends one operation.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/bg-modal/BgModal.test.tsx components/editor/Inspector.test.tsx app/editor/page.test.tsx`
- [ ] `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_clip_cache.py`

**Dependencies:** Tasks 2, 5

**Files likely touched:**

- `apps/web/components/bg-modal/BgModal.tsx`
- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/components/editor/Inspector.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/layers.ts`

**Estimated scope:** Medium

## Task 8: Implement subtitles and watermark global config controls

**Description:** Complete right-rail global video config for subtitles and watermark, including modal apply/cancel semantics and live preview parity with the Preview Surface.

**Acceptance criteria:**

- [ ] Right rail exposes Watermark, Subtitles, and Add/Change Background controls before contextual inspector sections.
- [ ] Subtitles modal supports background style, position, font, max chars, size, burn-in, and live preview using the current preview resolution/aspect.
- [ ] `Apply` updates all subtitle defaults, appends one operation, and closes; `Cancel` closes without mutation.
- [ ] Watermark config supports off/on, asset selection, placement, scale, opacity, preview display, operation log persistence, and removal.
- [ ] Preview and render pipeline consume the same subtitles/watermark config fields.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/watermark-panel/WatermarkPanel.test.tsx app/editor/page.test.tsx`
- [ ] `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_srt.py`

**Dependencies:** Tasks 1-2, 5

**Files likely touched:**

- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/components/editor/Inspector.tsx`
- `apps/web/components/watermark-panel/WatermarkPanel.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/server/server/pipeline/filtergraph.py`

**Estimated scope:** Medium

### Checkpoint: Transcript And Media Creation

- [ ] Tasks 4-8 pass.
- [ ] User can import media, assign foreground/PiP clips, configure background, subtitles, and watermark without losing browser recovery state.
- [ ] All creation/edit flows append incremental operations instead of full config snapshots.

### Phase 3: Editor Surfaces

## Task 9: Make the Inspector fully editable for background, foreground, and PiP

**Description:** Convert inspector controls from display-only/uncontrolled fields into mutation paths for selected background, foreground, and PiP items, plus delete behavior and dirty/cache state updates.

**Acceptance criteria:**

- [ ] Editor entry always selects background by default when available; otherwise the first non-subtitle visual item is selected or the Add Background control is shown.
- [ ] Background inspector edits asset playlist, crossfade `0..2`, motion, easing, and Remove background.
- [ ] Foreground inspector edits asset, sentence range/time span, motion, easing, transition in/out, and Delete item.
- [ ] PiP inspector edits asset, 3x3 placement with edge margins, size, radius, opacity, sentence range/time span, motion, easing, transition in/out, and Delete PiP item.
- [ ] Every edit marks the project dirty, writes browser recovery state, appends exactly one operation, and invalidates only affected cache entries.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/Inspector.test.tsx app/editor/page.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- lib/editor-operation-log lib/layers`

**Dependencies:** Tasks 6-8

**Files likely touched:**

- `apps/web/components/editor/Inspector.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/layers.ts`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/web/components/editor/Inspector.test.tsx`

**Estimated scope:** Medium

## Task 10: Implement timeline packing, drag/stretch/delete, and keyboard deletion

**Description:** Complete timeline editing for all visible timed clip kinds with fixed layout, full-width waveform, overlap-aware row packing, drag/stretch constraints, and transcript synchronization.

**Acceptance criteria:**

- [ ] Timeline header shows `30 fps`, clip count, and cache count; waveform spans the full voice duration and full timeline width.
- [ ] Track visual order is bottom-to-top background, foreground, PiP, subtitles and matches render stacking.
- [ ] Foreground/PiP overlapping clips occupy separate visual rows; non-overlapping clips can share a row; empty foreground/PiP layers are removed.
- [ ] Left grip resizes start, right grip resizes end, and body drag moves both endpoints for background, foreground, PiP, and subtitle clips with `start >= 0`, `end <= duration`, and minimum `0.5s`.
- [ ] Drag/stretch recalculates covered sentence range and syncs current time/selection with the transcript pane.
- [ ] Clip `x`, Backspace, and Delete remove selected non-background items; background cannot be deleted via timeline.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/Timeline.test.tsx app/editor/page.test.tsx`
- [ ] Manual check: drag/resize 100 clips stays visually stable and does not resize the preview/inspector.

**Dependencies:** Tasks 4, 6, 9

**Files likely touched:**

- `apps/web/components/editor/Timeline.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/layers.ts`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/web/components/editor/Timeline.test.tsx`

**Estimated scope:** Medium

## Task 11: Complete Layers Popover and preview resolution controls

**Description:** Finish layer management around the Preview Surface: render-order rows, first-item selection, removable layers, outside-click close, accurate count, and persisted preview resolution.

**Acceptance criteria:**

- [ ] `Layers - N` count reflects active visual layers/items according to the spec.
- [ ] Popover header reads `Layer order - top renders on top`; rows appear in render order with kind dot, layer name, item count, and trash where removable.
- [ ] Clicking a row selects the first item in the layer and closes the popover.
- [ ] Background trash removes background while keeping all other layers; subtitle layer is non-removable while alignment/subtitles exist.
- [ ] Outside click and Escape close the popover.
- [ ] Resolution segmented control updates preview aspect, persists to browser recovery state, and participates in render requests.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/LayersPopover.test.tsx components/editor/PreviewControls.test.tsx app/editor/page.test.tsx`

**Dependencies:** Tasks 2, 6-10

**Files likely touched:**

- `apps/web/components/editor/LayersPopover.tsx`
- `apps/web/components/editor/PreviewControls.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/web/components/editor/LayersPopover.test.tsx`

**Estimated scope:** Medium

## Task 12: Make Preview Surface reflect live render order and visual states

**Description:** Bring Preview Surface into parity with render order and documented states, including black fallback, background, foreground, PiP, subtitles, watermark, transport, Space shortcut, and 9:16 framing. Using `canvas-design` skill

**Acceptance criteria:**

- [ ] Preview renders black fallback, background, active fullscreen foreground, active PiP overlays, subtitles, and watermark in the documented order.
- [ ] Fullscreen foreground hides background while active; PiP always renders above foreground.
- [ ] Subtitle visibility/style and watermark off/on states match current config.
- [ ] Transport controls support Previous, Play/Pause, Next, live timecode, and Space play/pause outside typing targets.
- [ ] `1080p`, `720p`, and `9:16` produce correct aspect/framing without overlap or clipped controls.
- [ ] Preview states cover no background, background only, no foreground, foreground active, no PiP, one/more PiP, subtitles off/on, watermark off/on, playing, and paused.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/editor/PreviewSurface.test.tsx lib/preview/resolveDisplay.test.ts app/editor/page.test.tsx`
- [ ] Browser check: open Editor at desktop and mobile widths and verify non-overlapping preview controls.

**Dependencies:** Tasks 8-11

**Files likely touched:**

- `apps/web/components/editor/PreviewSurface.tsx`
- `apps/web/lib/preview/resolveDisplay.ts`
- `apps/web/app/editor/page.tsx`
- `apps/web/components/editor/PreviewSurface.test.tsx`
- `apps/web/styles/globals.css`

**Estimated scope:** Medium

### Checkpoint: Editor Surfaces

- [ ] Tasks 9-12 pass.
- [ ] Inspector, timeline, layers popover, and preview all mutate and display the same working config.
- [ ] Render stacking and visual timeline order are covered by unit/component tests.

### Phase 4: Render, Cache, And Recovery Guarantees

## Task 13: Implement precise clip-cache invalidation for Editor edits

**Description:** Make cache state reflect per-clip invalidation and reuse for foreground, background, and PiP edits based on media content hash, duration, motion, transitions, resolution, fps, crossfade, and PiP parameters.

**Acceptance criteria:**

- [ ] Each foreground, background, and PiP clip produces one cached output in `<project>/.vc/clips/`.
- [ ] Cache key includes media content hash, duration, motion, transitions, resolution, fps, crossfade where applicable, and PiP placement where applicable.
- [ ] Editing one clip invalidates only that clip; unaffected clips are reused by mtime/content hash.
- [ ] Editor cache label reports warm/cold/partial/invalid with cached and total counts from config-derived data.
- [ ] Cache invalidation state is visible in toolbar and affected clip state.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- tests/test_clip_cache.py tests/test_render_endpoint.py`
- [ ] `rtk pnpm -F @vc/web test -- components/editor/EditorBar.test.tsx app/editor/page.test.tsx`

**Dependencies:** Tasks 3, 6-10

**Files likely touched:**

- `apps/server/server/pipeline/cache.py`
- `apps/server/server/pipeline/clip_render.py`
- `apps/server/server/routes/projects.py`
- `apps/web/app/editor/page.tsx`
- `apps/web/components/editor/EditorBar.tsx`

**Estimated scope:** Medium

## Task 14: Complete filtergraph, subtitles, output paths, and render progress stages

**Description:** Align backend rendering with Editor output requirements: draft/final/vertical resolutions, user-visible subtitles, draft output path, stage progress, and final filter order.

**Acceptance criteria:**

- [ ] Drafts write to `<project>/.vc/drafts/<timestamp-or-render-id>.mp4`; finals write to the render output path expected by Render page.
- [ ] Render supports `1080p` `1920x1080`, `720p` `1280x720`, and `9:16` `1080x1920`.
- [ ] Generated filter chain order is black fallback -> background -> foreground -> PiP -> subtitles -> watermark.
- [ ] Subtitle style controls are honored when burn-in is enabled and user-visible `<project>/subtitles.srt` remains canonical.
- [ ] Progress events expose queued, verifying cache, pre-rendering clips, building `subtitles.srt`, ffmpeg compose, muxing audio, done, error, and cancelled.
- [ ] Render history records config hash, artifacts, events, and marks the latest successful config as rendered.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_render_endpoint.py tests/test_render_progress.py tests/test_render_history.py tests/test_srt.py`

**Dependencies:** Tasks 1, 3, 8, 13

**Files likely touched:**

- `apps/server/server/pipeline/filtergraph.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/pipeline/srt.py`
- `apps/server/server/pipeline/render_progress.py`
- `apps/server/tests/test_filtergraph.py`

**Estimated scope:** Medium

## Task 15: Cover reopen, crash recovery, re-record voice, and invalid route behavior

**Description:** Add the integration/E2E recovery behaviors that prove Editor state survives app relaunch/crash, voice re-records, and invalid editor route navigation.

**Acceptance criteria:**

- [ ] Re-open flow restores selection, layer assignments, scroll position, undo stack, and selected resolution from SQLite plus browser storage.
- [ ] Crash recovery replays committed operation-log entries to the same working state without prompting.
- [ ] Re-recording voice and rerunning alignment preserves sentence-to-clip assignments where anchors still map, shifts timestamps, and marks missing anchors orphan/red without deleting clips.
- [ ] `/editor/:invalid` redirects to Launcher or displays the approved Launcher recovery flow consistently.
- [ ] Undo/redo after delete/move/stretch remains byte-identical after replay.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- app/editor/page.test.tsx lib/editor-operation-log`
- [ ] `rtk pnpm -F @vc/server test -- tests/test_alignment_integration.py tests/test_setup_test01_fixture.py`
- [ ] `rtk pnpm test`

**Dependencies:** Tasks 2, 4, 10, 14

**Files likely touched:**

- `apps/web/app/editor/page.tsx`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/server/server/routes/alignment.py`
- `apps/server/server/pipeline/srt.py`
- `apps/server/tests/test_alignment_integration.py`

**Estimated scope:** Medium

### Checkpoint: Render, Cache, And Recovery

- [ ] Tasks 13-15 pass.
- [ ] Cache invalidation is precise.
- [ ] Render outputs and progress stages match the spec.
- [ ] Recovery and re-record edge cases are covered.

### Phase 5: Visual Parity And Acceptance

## Task 16: Add Editor visual parity coverage for every referenced screenshot

**Description:** Add one parity owner/test for every Editor screenshot embedded in `SPEC_EDITOR.md`, covering dark/light themes and interaction/modal states.

**Acceptance criteria:**

- [ ] The parity manifest includes every Editor screenshot reference exactly once.
- [ ] Covered states include default editor, draft render strip, transcript selection/context/merge, preview/layers popover, timeline, inspector states, Assign/Edit modal, Background modal, Subtitles modal, and dark/light variants.
- [ ] Tests set stable fixture data, viewport, theme, language, and browser storage before capture.
- [ ] Failure output includes reference path, actual path, diff/SSIM score, and state name.
- [ ] Visual tests do not rely on prototype CSS.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test:visual -- editor`
- [ ] `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`

**Dependencies:** Tasks 3-12

**Files likely touched:**

- `apps/web/tests/visual/editor.visual.spec.ts`
- `apps/web/tests/visual/visual-manifest.ts`
- `apps/web/tests/visual/visual-test-utils.ts`
- `apps/web/app/editor/page.tsx`
- `docs/designs/SPEC_EDITOR.md`

**Estimated scope:** Medium

## Task 17: Run the Editor acceptance and performance gate

**Description:** Run the full Editor verification set after implementation, fix only issues needed to satisfy the spec, and document residual risk before handoff.

**Acceptance criteria:**

- [ ] All functional acceptance criteria in `SPEC_EDITOR.md` pass.
- [ ] Operation-log replay reaches the same end state as the live session for the same operation sequence.
- [ ] Content hash changes if and only if a persisted property changes; no-op edits preserve the hash.
- [ ] Cached-clip re-render after one property edit is within the target; filter-chain build for 50 layers is within target.
- [ ] Undo/redo replay across a 1000-op log, 500 sentence chips, and timeline drag at 100 clips meet the documented performance targets.
- [ ] User-triggered Editor failures surface non-blocking, recoverable errors with a clear next action.
- [ ] Full verification commands pass or any failure is documented with root cause and owner.

**Verification:**

- [ ] `rtk pnpm test`
- [ ] `rtk pnpm lint`
- [ ] `rtk pnpm build`
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/web test:visual -- editor`

**Dependencies:** Tasks 1-16

**Files likely touched:**

- No planned feature files; this is a fix-forward verification task.

**Estimated scope:** Small

### Checkpoint: Complete

- [ ] All Editor tasks pass.
- [ ] `tasks/todo.md` task statuses are updated by the build session.
- [ ] Editor is ready for review against `docs/designs/SPEC_EDITOR.md`.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Current passive autosave syncs SQLite and conflicts with the explicit-save contract | High | Fix persistence split before adding more mutation paths. |
| Schema drift between frontend, backend, and fixtures causes invalid saved configs | High | Start with shared schema and generated model updates, then build UI/API slices against those types. |
| Assign/Background/Inspector all mutate layers and may duplicate logic | Medium | Centralize layer packing, range resolution, cache invalidation, and item patch helpers in `apps/web/lib/layers.ts`. |
| Render API shape may conflict with existing Render page routes | Medium | Define the project-id/render-id route contract in Task 3 and keep Render page compatibility tests in the verification set. |
| Visual parity work can become unstable without deterministic fixtures | Medium | Use `projects/test01` and controlled browser storage/theme/viewport in all visual tests. |
| Re-record voice anchor behavior is underspecified at code level | Medium | Treat stable sentence indexes/ranges as the initial anchor strategy and mark unmappable anchors orphaned instead of deleting. |

## Resolved Decisions

- Final navigation route is exact: `/render/:projectId/:render_id`.
- Media upload surface is global `POST /uploads`.
- Transcript merge/concatenate persists to `project_configs` on save/sync; `<project>/subtitles.srt` is rewritten when user taps `Render Draft` or `Render Final`.
