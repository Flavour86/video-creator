# Task 02 Evidence

## Visual parity

- Command: `rtk pnpm -F @vc/web test:visual -- editor`
- Result: pass, 43 passed, 17 skipped.
- Browser runner: Playwright via `apps/web/scripts/run-visual-tests.mjs`.
- Case: `../tasks/v1.3/visuals/editor-fullscreen-button-1920x1080.png parity`.
- SSIM: `0.9895` against the cropped v1.3 reference segment after documented masks and near-black transport token normalization.

Artifacts copied from `apps/web/tests/visual/artifacts/actual/`:

- `editor-fullscreen-button-1920x1080.actual.png`
- `editor-fullscreen-button-1920x1080.reference-crop.png`
- `editor-fullscreen-button-1920x1080.diff.png`

## Screenshot inventory

- Command: `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
- Result: pass, including the v1.3 checks.
- Inventory outcome: `docs/designs/tasks/v1.3/visuals/editor-fullscreen-button-1920x1080.png` is declared under editor ownership and maps to exactly one visual parity case.

## Dynamic tolerances

The v1.3 case documents these tolerances in `apps/web/tests/visual/editor-visual-cases.ts`: exact time values and icon glyph pixels are masked, and near-black transport background token drift is normalized. Browser assertions cover button order, `32x32` control size, timecode adjacency, gap, and vertical alignment.
