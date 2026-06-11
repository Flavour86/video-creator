# Task 10 Evidence - Subtitle Manual Entry And Preview Balance

Generated on 2026-06-11.

## What This Proves

- `Max characters per line` accepts direct keyboard entry through `65` and `70`.
- The modal preview at `70` renders the sample subtitle as two balanced rows:
  - `This subtitle preview follows your style and stays inside the`
  - `safe zone.`
- The integrated v1.2 browser flow still saves `20`, reloads the project, and renders successfully after the manual-entry checks.

## Commands

- `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/editor/PreviewSurface.test.tsx app/editor/page.test.tsx`
- `rtk pnpm -F @vc/web test:e2e -- render-correctness-v1-2`

## Browser Evidence

- `1920x1080-subtitle-modal-manual-70.png`
- `1920x1080-subtitle-preview-manual-70.png`
- `1280x720-subtitle-modal-manual-70.png`
- `1280x720-subtitle-preview-manual-70.png`
- `1080x1920-subtitle-modal-manual-70.png`
- `1080x1920-subtitle-preview-manual-70.png`

The 1280x720 viewport cannot fit both the top input row and the preview cue in one modal screenshot, so it includes paired modal and preview captures from the same verified browser flow.
