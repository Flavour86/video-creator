# Editor Todo

## Phase 1: Contracts And Persistence

- [x] Task 1: Align shared Editor config schema with the spec
  - Acceptance: media assets, visual items, PiP bounds, subtitle settings, and render resolution fields match `SPEC_EDITOR.md`; generated TS/Python outputs are refreshed.
  - Verify: `rtk pnpm gen:types`, `rtk pnpm gen:py`, `rtk pnpm -F @vc/server test -- tests/test_project_schema.py tests/test_shared_api_schemas.py`, `rtk pnpm -F @vc/web test -- lib/preview/resolveDisplay.test.ts lib/layers.test.ts`
- [ ] Task 2: Make Editor config sync explicit and browser recovery incremental
  - Acceptance: passive autosave writes browser operation/recovery state only; explicit Save syncs SQLite and clears committed operations; undo/redo do not save full configs.
  - Verify: `rtk pnpm -F @vc/web test -- lib/editor-operation-log app/editor/page.test.tsx`
- [ ] Task 3: Wire toolbar save/render enablement and render queue contract
  - Acceptance: render enable rules hold; Draft/Final save before queueing; draft strip stages and final navigation match spec.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/EditorBar.test.tsx components/editor/RenderStrip.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/server test -- tests/test_render_endpoint.py tests/test_render_progress.py tests/test_projects_route.py`
- [ ] Checkpoint: Contracts And Persistence
  - Acceptance: shared schema is generated, SQLite sync is explicit, and render queues use the latest saved working config.

## Phase 2: Transcript And Media Creation

- [ ] Task 4: Complete transcript selection, search, context menu, and merge behavior
  - Acceptance: rows, search, multi-select, context menu, play-from-here, merge, anchor remap, orphan state, and operation logging work.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/TranscriptPane.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/server test -- tests/test_alignment_subtitles.py tests/test_srt.py`
- [ ] Task 5: Implement explicit media import and asset metadata for Editor
  - Acceptance: imports happen only by user action; full media metadata, progress, duplicates, unsupported/corrupt/huge/missing cases, and thumbnails are handled.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_media_upload.py`, `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx app/editor/page.test.tsx`
- [ ] Task 6: Add/Edit foreground and PiP clips from sentence ranges
  - Acceptance: Assign/Edit modal creates and updates FG/PiP clips, validates ranges, packs layers, invalidates affected cache, selects item, and logs one operation.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/editor/Inspector.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/web test -- lib/layers.test.ts lib/editor-operation-log`
- [ ] Task 7: Implement Background modal and background playlist behavior
  - Acceptance: Add/Change Background supports image/video playlist rules, crossfade/motion/easing, video fallback/trimming, edit mode, and removal.
  - Verify: `rtk pnpm -F @vc/web test -- components/bg-modal/BgModal.test.tsx components/editor/Inspector.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_clip_cache.py`
- [ ] Task 8: Implement subtitles and watermark global config controls
  - Acceptance: right rail exposes Watermark/Subtitles/Background controls; subtitles modal and watermark config mutate working config through operations and affect preview/render.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/watermark-panel/WatermarkPanel.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_srt.py`
- [ ] Checkpoint: Transcript And Media Creation
  - Acceptance: media import, FG/PiP assignment, background, subtitles, and watermark are usable with browser recovery intact.

## Phase 3: Editor Surfaces

- [ ] Task 9: Make the Inspector fully editable for background, foreground, and PiP
  - Acceptance: all documented inspector fields update config, mark dirty, append one operation, and invalidate affected cache.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/Inspector.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/web test -- lib/editor-operation-log lib/layers`
- [ ] Task 10: Implement timeline packing, drag/stretch/delete, and keyboard deletion
  - Acceptance: fixed-height timeline, full-width waveform, layer packing/order, drag/stretch constraints, transcript sync, and non-background deletion work.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/Timeline.test.tsx app/editor/page.test.tsx`
- [ ] Task 11: Complete Layers Popover and preview resolution controls
  - Acceptance: rows render in order, row click selects first item, removable trash works, outside/Escape close works, and resolution persists and drives render requests.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/LayersPopover.test.tsx components/editor/PreviewControls.test.tsx app/editor/page.test.tsx`
- [ ] Task 12: Make Preview Surface reflect live render order and visual states
  - Acceptance: black fallback, background, foreground, PiP, subtitles, watermark, transport, Space shortcut, and 9:16 framing match the spec.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/PreviewSurface.test.tsx lib/preview/resolveDisplay.test.ts app/editor/page.test.tsx`
- [ ] Checkpoint: Editor Surfaces
  - Acceptance: inspector, timeline, layers popover, and preview all read/write the same working config.

## Phase 4: Render, Cache, And Recovery Guarantees

- [ ] Task 13: Implement precise clip-cache invalidation for Editor edits
  - Acceptance: each visual clip gets one cache output; cache keys include relevant media/edit parameters; one-clip edits rebuild only affected cache.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_clip_cache.py tests/test_render_endpoint.py`, `rtk pnpm -F @vc/web test -- components/editor/EditorBar.test.tsx app/editor/page.test.tsx`
- [ ] Task 14: Complete filtergraph, subtitles, output paths, and render progress stages
  - Acceptance: draft/final/9:16 outputs, filter order, subtitle style, draft path, progress stages, history, artifacts, and rendered-hash updates match the spec.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_render_endpoint.py tests/test_render_progress.py tests/test_render_history.py tests/test_srt.py`
- [ ] Task 15: Cover reopen, crash recovery, re-record voice, and invalid route behavior
  - Acceptance: reopen/crash recovery restore state; voice re-record preserves or orphans anchors; invalid editor route recovers; undo/redo replay is byte-identical.
  - Verify: `rtk pnpm -F @vc/web test -- app/editor/page.test.tsx lib/editor-operation-log`, `rtk pnpm -F @vc/server test -- tests/test_alignment_integration.py tests/test_setup_test01_fixture.py`, `rtk pnpm test`
- [ ] Checkpoint: Render, Cache, And Recovery
  - Acceptance: cache invalidation, render outputs/stages, recovery, and re-record edge cases are covered.

## Phase 5: Visual Parity And Acceptance

- [ ] Task 16: Add Editor visual parity coverage for every referenced screenshot
  - Acceptance: every `SPEC_EDITOR.md` screenshot has exactly one parity owner/test across dark/light and modal/interaction states.
  - Verify: `rtk pnpm -F @vc/web test:visual -- editor`, `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
- [ ] Task 17: Run the Editor acceptance and performance gate
  - Acceptance: functional acceptance, hash rules, operation replay, cache precision, performance targets, recoverable errors, and full verification gates pass.
  - Verify: `rtk pnpm test`, `rtk pnpm lint`, `rtk pnpm build`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/web test:visual -- editor`
- [ ] Checkpoint: Complete
  - Acceptance: all Editor tasks pass and the implementation is ready for review against `docs/designs/SPEC_EDITOR.md`.

## Open Decisions

- [x] Final navigation is exact: `/render/:projectId/:render_id`.
- [x] Media upload route is global: `POST /uploads`.
- [x] Transcript merge persists to `project_configs` on save/sync; `<project>/subtitles.srt` is written when user taps `Render Draft` or `Render Final`.
