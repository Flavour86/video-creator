# Todo: v1.3 Prototype Update

## Phase 1: Preview Fullscreen Control

- [x] Task 1 (task-01): Implement preview fullscreen control
  - Acceptance: The editor preview transport row includes an accessible localized icon-only fullscreen button immediately before the timecode display; clicking it requests fullscreen on the preview stage when not fullscreen and exits fullscreen when fullscreen; rejected or missing Fullscreen API calls do not break rendering or mutate editor state; existing transport controls and whole-second timecode behavior remain unchanged.
  - Verify: `rtk pnpm -F @vc/web test -- components/editor/PreviewSurface.test.tsx app/editor/page.test.tsx`
  - Evidence: editor preview screenshots for the default 1080p transport row with the fullscreen button, the 9:16 preview transport row with the button still placed before timecode, and a browser note proving fullscreen enter/exit calls target the preview stage.

- [x] Checkpoint: Fullscreen control behavior complete
  - Acceptance: The preview fullscreen button is implemented, accessible, localized, and covered without changing project persistence or render output.

## Phase 2: Visual Parity And Inventory

- [x] Task 2 (task-02): Add v1.3 visual parity and screenshot inventory coverage
  - Acceptance: Visual tests include `docs/designs/tasks/v1.3/visuals/editor-fullscreen-button-1920x1080.png` under editor ownership; exactly one visual parity case maps to the reference; the case compares the fullscreen button placement and transport row at SSIM `>= 0.98`; dynamic data tolerances are documented.
  - Verify: `rtk pnpm -F @vc/web test:visual -- editor`, `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
  - Evidence: visual parity actual/diff artifacts for `editor-fullscreen-button-1920x1080.png` plus a screenshot inventory test result showing the v1.3 reference is implemented and uniquely mapped.

- [x] Checkpoint: v1.3 visual coverage complete
  - Acceptance: The approved v1.3 reference is represented in visual parity tests and screenshot ownership inventory.

## Phase 3: Integrated Browser Flow

- [x] Task 3 (task-03): Add integrated browser fullscreen flow
  - Acceptance: A real browser flow opens the editor, verifies the fullscreen button is visible and accessible, proves enter and exit fullscreen calls use the preview stage, exercises `1080p`, `720p`, and `9:16`, and reports no unexpected console errors.
  - Verify: `rtk pnpm -F @vc/web test:e2e -- editor-fullscreen`
  - Evidence: browser screenshots at `1920x1080`, `1280x720`, and `1080x1920` showing the fullscreen button in the assembled editor, plus an evidence note recording the preview-stage enter/exit fullscreen assertions.

- [x] Checkpoint: Phase 4 readiness
  - Acceptance: All v1.3 implementation tasks are scoped, ordered, verifiable, and ready for Phase 4 execution by task id.
