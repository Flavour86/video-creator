# Todo: v1.2 Prototype Update

## Phase 1: Manual Background Semantics

- [x] Task 1 (task-01): Implement frontend manual background schedule resolution
  - Acceptance: Frontend preview treats any present schedule as manual mode; positive-duration rows display in range; zero-duration rows and gaps display no background; legacy items with no schedule keep existing playlist fallback.
  - Verify: `rtk pnpm -F @vc/web test -- lib/preview/resolveDisplay.test.ts components/editor/PreviewSurface.test.tsx`
  - Evidence: editor preview screenshots for a positive scheduled range, a zero-duration selected row, a gap between ranges, and a legacy no-schedule fallback state.

- [x] Task 2 (task-02): Implement server render manual background schedule semantics
  - Acceptance: Server render expands only positive-duration explicit schedule rows; zero-duration rows and gaps render no background; legacy backgrounds with no explicit schedule keep current fallback rendering; cache keys change when manual schedules change.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_clip_cache.py tests/test_render_endpoint.py`
  - Evidence: render correctness evidence for scheduled background, zero-duration manual row, and manual schedule gap in 16:9 output.

- [x] Checkpoint: Manual background semantics complete
  - Acceptance: Preview and server render agree on explicit manual schedules, zero-duration rows, gaps, and legacy fallback behavior.

## Phase 2: Background Modal And Persistence

- [x] Task 3 (task-03): Implement manual background modal editing
  - Acceptance: `BgModal` removes `Auto fill`; first-time selected assets show `00:00-00:00`; selecting, deselecting, reordering, and editing one row never redistributes or mutates unaffected rows; new video rows start at zero and derive locked End from native duration when Start is edited.
  - Verify: `rtk pnpm -F @vc/web test -- components/bg-modal/BgModal.test.tsx`
  - Evidence: background modal screenshots for no Auto fill, first asset at `00:00-00:00`, preserved existing row after adding another asset, reordered rows with unchanged ranges, and edited video Start with derived locked End.

- [x] Task 4 (task-04): Persist and reload manual background schedules in the editor
  - Acceptance: Saving writes selected media IDs plus explicit schedule rows, including zero-duration rows; reopening restores row order and values; undo/redo and autosave still work; editor preview does not auto-fill zero rows or schedule gaps after reload.
  - Verify: `rtk pnpm -F @vc/web test -- app/editor/page.test.tsx components/bg-modal/BgModal.test.tsx lib/preview/resolveDisplay.test.ts`
  - Evidence: browser screenshots for saved modal state, reopened modal state, editor preview at scheduled range, editor preview at gap, and autosave status after background change.

- [x] Checkpoint: Manual background UI complete
  - Acceptance: Manual background schedules can be edited, persisted, reopened, previewed, and undone without automatic coverage generation.

## Phase 3: Subtitles And Transport Display

- [x] Task 5 (task-05): Expose subtitle max characters per line in the editor modal
  - Acceptance: The Subtitles modal shows `Max characters per line`; loads the current value; clamps invalid values to `20..80`; updates modal preview live; Apply persists and updates editor preview; Cancel discards the draft.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/editor/PreviewSurface.test.tsx app/editor/page.test.tsx`
  - Evidence: subtitle modal screenshots at 16:9 and 9:16 showing the field at value `20`, live wrapped preview, applied editor preview, and canceled draft restored.

- [x] Task 10 (task-10): Fix subtitle max-character manual entry and balanced preview wrapping
  - Acceptance: `Max characters per line` supports direct keyboard entry such as `65` without clamping intermediate digits; out-of-range values still normalize to `20..80` on commit; the max `70` modal preview renders the sample subtitle as two balanced lines, not three visual lines.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/editor/PreviewSurface.test.tsx app/editor/page.test.tsx`, `rtk pnpm -F @vc/web test:e2e -- render-correctness-v1-2`
  - Evidence: subtitle modal and preview screenshots at 1920x1080, 1280x720, and 1080x1920 showing typed value `70` and the two-line preview.

- [x] Task 6 (task-06): Prove server subtitle wrapping honors saved max characters
  - Acceptance: Server render uses saved `subtitles.style.max_chars_per_line`; values normalize to `20..80`; rendered subtitles wrap consistently with the editor preview.
  - Verify: `rtk pnpm -F @vc/server test -- tests/test_render_endpoint.py tests/test_srt.py`, `rtk pnpm -F @vc/web test:e2e -- render-correctness`
  - Evidence: render correctness evidence for subtitle wrapping at max characters `20` in 16:9 and 9:16 output.

- [x] Task 7 (task-07): Format preview transport timecodes without milliseconds
  - Acceptance: Preview transport current and total labels show `MM:SS` under one hour and `HH:MM:SS` at one hour or more; fractional seconds truncate; no transport label contains milliseconds; non-transport time fields are unchanged.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/PreviewSurface.test.tsx`
  - Evidence: editor preview transport screenshots showing `00:12 / 00:30`, a seeked non-zero time without milliseconds, and an over-one-hour fixture retaining hours.

- [x] Checkpoint: Subtitle and transport display complete
  - Acceptance: Subtitle wrapping configuration and transport timecode display match the approved v1.2 prototype and persist through the existing editor flow.

## Phase 4: Visual Parity And Integration

- [x] Task 8 (task-08): Add v1.2 visual parity and screenshot inventory coverage
  - Acceptance: Visual test cases and screenshot inventory include all four v1.2 canonical references; comparisons target SSIM `>= 0.98`; dynamic data tolerances or masks are documented for thumbnails, names, subtitle text, and live time values.
  - Verify: `rtk pnpm -F @vc/web test:visual -- editor`, `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
  - Evidence: visual test evidence for background manual coverage, subtitle max characters at 16:9 and 9:16, and whole-second editor time display.

- [x] Task 9 (task-09): Run integrated v1.2 editor flow regression
  - Acceptance: One real browser flow can create a manual background schedule with a zero row and a gap, set subtitle max characters to `20`, observe whole-second transport timecodes, autosave, reload, and render without losing config; no unexpected console errors occur.
  - Verify: `rtk pnpm test`, `rtk pnpm lint`, `rtk pnpm build`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/web test:e2e -- render-correctness`
  - Evidence: end-to-end browser screenshots at 1920x1080, 1280x720, and 1080x1920 for the final editor state, background modal, subtitle modal, preview transport, and render output.

- [x] Checkpoint: Phase 4 readiness
  - Acceptance: All v1.2 implementation tasks are scoped, ordered, verifiable, and ready for Phase 4 execution by task id.
