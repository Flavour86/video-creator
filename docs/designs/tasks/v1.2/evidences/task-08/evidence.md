# task-08 - v1.2 visual parity and screenshot inventory evidence

- background-manual-coverage-16x9.png - Captured by the editor visual parity run for `background-manual-coverage-16x9.png`; proves the v1.2 manual background modal reference is covered at SSIM >= 0.98.
- subtitles-max-characters-16x9.png - Captured by the editor visual parity run for `subtitles-max-characters-16x9.png`; proves the 16:9 subtitle max-character modal reference is covered at SSIM >= 0.98.
- subtitles-max-characters-9x16.png - Captured by the editor visual parity run for `subtitles-max-characters-9x16.png`; proves the 9:16 subtitle max-character modal reference is covered at SSIM >= 0.98.
- editor-time-display-16x9.png - Captured by the editor visual parity run for `editor-time-display-16x9.png`; proves the whole-second preview transport reference is covered at SSIM >= 0.98.

Verify: `rtk pnpm -F @vc/web test:visual -- editor` passed: 42 passed, 17 skipped.
Verify: `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts` passed: 76 files, 679 tests.

Dynamic handling is documented in the v1.2 visual case metadata: background thumbnails and asset names use deterministic fixtures, subtitle preview text/media areas are masked, live transport time is fixed before capture, and every v1.2 case enforces `V1_2_VISUAL_SSIM_THRESHOLD = 0.98`.
