# Todo: v1.1 Prototype Update

## Phase 1: Shared Contracts

- [x] Task 1 (task-01): Extend project schema and generated types
  - Acceptance: `SubtitleStyle` has text color, background color, background opacity, and background radius fields with defaults; `BackgroundItem` accepts optional ordered `schedule[]`; existing configs without these fields still validate after normalization.
  - Verify: `rtk pnpm gen:types`, `rtk pnpm gen:py`, `rtk pnpm check:generated-schemas`, `rtk pnpm -F @vc/server test -- tests/test_project_schema.py tests/test_shared_api_schemas.py`, `rtk pnpm -F @vc/web test -- lib/hooks/useProject.test.ts`
  - Evidence: schema diff plus browser-loaded editor with an existing project config that still opens after normalization.

- [x] Checkpoint: Shared contract complete
  - Acceptance: Generated TS/Python schema outputs are current, and both web/server test suites can import the new fields without type/runtime errors.

## Phase 2: Backend Render Semantics

- [x] Task 2 (task-02): Render subtitle style color and background fields
  - Acceptance: Render force style derives subtitle text color from `style.color`, uses configured background color/opacity where ASS supports it, preserves hidden `max_chars_per_line`, and safely falls back for unsupported rounded radius.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_srt.py`, `rtk pnpm -F @vc/web test:e2e -- render-correctness`
  - Evidence: render correctness evidence for subtitle text color and background modes in 16:9 and 9:16 previews.

- [x] Task 3 (task-03): Render edited transcript sentence text
  - Acceptance: `Project.transcript.sentences[].text` is preferred for SRT/subtitle generation while preserving aligned start/end times; missing override payloads keep current behavior.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_alignment_subtitles.py tests/test_srt.py`, `rtk pnpm -F @vc/web test -- lib/editor-operation-log/operation-log.test.ts`
  - Evidence: browser evidence showing edited transcript text in the transcript row and preview subtitle, plus generated subtitle/render test evidence.

- [x] Checkpoint: Backend subtitle and transcript behavior complete
  - Acceptance: Subtitle render styling and edited transcript text are represented in config, SRT, and render paths without breaking older configs.

## Phase 3: Editor Persistence And Independent UI

- [x] Task 4 (task-04): Implement autosave-only editor header
  - Acceptance: The editor header has no manual Save button; status shows only empty, `Saving`, or `Saved`; config mutations queue non-overlapping autosaves and keep recovery state on failure.
  - Verify: `rtk pnpm -F @vc/web test -- app/editor/page.test.tsx components/editor/EditorBar.test.tsx lib/editor-operation-log/operation-log.test.ts`
  - Evidence: editor header screenshots for empty, `Saving`, and `Saved`; no Save button visible.

- [x] Task 5 (task-05): Implement subtitle modal color and background controls
  - Acceptance: Modal removes visible `Max chars / line`, shows `Color`, `Background color`, `Opacity`, and `Radius`; disabled states match `None`, `Drop shadow only`, `Pill background`, and `Block background`; preview updates live; Apply persists settings.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx app/editor/page.test.tsx lib/hooks/useProject.test.ts`
  - Evidence: `subtitles-modal-color-bg-1920x1080`, `subtitles-modal-color-bg-1080x1920`, and `subtitles-modal-none-disabled-1920x1080` browser screenshots matching references.

- [x] Task 6 (task-06): Implement watermark position, opacity, and size controls
  - Acceptance: Watermark UI exposes position X/Y, opacity, and size/scale; preview updates immediately; applying writes `Project.watermark`; clearing or missing media does not crash preview/render.
  - Verify: `rtk pnpm -F @vc/web test -- components/watermark-panel/WatermarkPanel.test.tsx components/editor/PreviewSurface.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py`
  - Evidence: watermark modal/control screenshots for default, adjusted position/opacity/size, preview placement, and cleared watermark state.

- [x] Task 7 (task-07): Implement transcript row textarea editing with fixed height
  - Acceptance: Every sentence row has a right edit icon; edit mode uses a textarea that covers the full normal sentence text element; regular and editing row heights match at desktop and portrait widths; confirm/cancel/empty draft behavior works; commit schedules autosave.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/TranscriptPane.test.tsx app/editor/page.test.tsx lib/editor-operation-log/operation-log.test.ts`
  - Evidence: `transcript-edit-height-parity-1920x1080` and `transcript-edit-height-parity-1080x1920` screenshots, plus DOM measurement evidence that textarea and text rects match.

- [x] Checkpoint: Independent editor UI complete
  - Acceptance: Autosave, subtitles, watermark, and transcript editing work independently and persist through the existing project config flow.

## Phase 4: Mixed Background Scheduling

- [x] Task 8 (task-08): Add frontend schedule helpers and preview resolution
  - Acceptance: Frontend state can normalize `mediaIds + schedule`, parse/format `mm:ss`, `hh:mm:ss`, and seconds inputs, resolve active background media by schedule, and preserve fallback behavior for unscheduled backgrounds.
  - Verify: `rtk pnpm -F @vc/web test -- lib/preview/resolveDisplay.test.ts components/editor/PreviewSurface.test.tsx lib/hooks/useProject.test.ts`
  - Evidence: preview screenshots at multiple playhead times proving scheduled background media switches according to explicit ranges.

- [ ] Task 9 (task-09): Implement mixed background coverage modal
  - Acceptance: `BgModal` allows mixed image/video selection, shows ordered schedule rows, locks video durations, lets image rows edit `Start`, `End`, and `Hold` as time strings, removes separate timeline strip/status banner, supports drag reorder, synchronizes left asset order with coverage row order, truncates long names, and never overflows row inputs at five or more assets.
  - Verify: `rtk pnpm -F @vc/web test -- components/bg-modal/BgModal.test.tsx app/editor/page.test.tsx`
  - Evidence: `background-coverage-modal-clear-1920x1080` and `background-coverage-modal-clear-1080x1920`; crowded six-asset state; `01:10` time edit; drag-reordered state; long-name truncation state.

- [ ] Task 10 (task-10): Show scheduled background ranges in inspector and timeline
  - Acceptance: Inspector shows ordered scheduled assets with native video duration and explicit image ranges; timeline remains one background lane with a timed-ranges label; preview/timeline selection remains stable after reordering.
  - Verify: `rtk pnpm -F @vc/web test -- components/inspector/InspectorPanel.test.tsx components/timeline/TimelineTrack.test.tsx app/editor/page.test.tsx`
  - Evidence: `background-coverage-editor-1920x1080` and `background-coverage-editor-1080x1920` screenshots showing inspector schedule rows and one background timeline item.

- [ ] Task 11 (task-11): Expand scheduled backgrounds in server render
  - Acceptance: `filtergraph.py` expands scheduled image and video segments from `BackgroundItem.schedule`; images loop for their range; videos clamp to schedule/native duration; unscheduled backgrounds keep current fallback; cache invalidates when schedule/order/motion/easing/crossfade changes.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_clip_cache.py tests/test_project_schema.py`, `rtk pnpm -F @vc/web test:e2e -- render-correctness`
  - Evidence: render correctness evidence for image-to-video and video-to-image background boundaries in 16:9 and 9:16 output.

- [ ] Checkpoint: Mixed background schedule complete
  - Acceptance: Mixed image/video backgrounds can be edited, previewed, inspected, persisted, and rendered from one ordered scheduled background item.

## Phase 5: Visual Parity And Integration

- [ ] Task 12 (task-12): Add v1.1 visual parity and screenshot inventory coverage
  - Acceptance: Visual test manifest and screenshot inventory include all v1.1 canonical references; changed surfaces compare against `docs/designs/tasks/v1.1/visuals/`; dynamic content tolerances are documented.
  - Verify: `rtk pnpm -F @vc/web test:visual -- editor`, `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
  - Evidence: visual test evidence for subtitles modal, watermark controls, transcript editing, and background coverage at desktop and portrait sizes.

- [ ] Task 13 (task-13): Run integrated editor flow regression
  - Acceptance: One real browser flow can edit subtitles, watermark, transcript text, and mixed background schedule, then autosave and render without losing config; no console errors beyond expected dev warnings.
  - Verify: `rtk pnpm test`, `rtk pnpm lint`, `rtk pnpm build`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/web test:e2e -- render-correctness`
  - Evidence: end-to-end browser screenshots for final editor state, inspector, timeline, preview, and render output.

- [ ] Checkpoint: Phase 4 readiness
  - Acceptance: All v1.1 implementation tasks are scoped, ordered, verifiable, and ready for Phase 4 execution by task id.
