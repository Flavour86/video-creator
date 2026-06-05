# task-06 - server subtitle max-character wrapping evidence
- subtitle-max20-render-16x9.png - real 1280x720 render frame with saved `subtitles.style.max_chars_per_line = 20`; generated SRT wraps `Capitalism begins here.` as `Capitalism begins` / `here.` and the burned frame matches that wrapping.
- subtitle-max20-render-9x16.png - real 1080x1920 render frame from the same saved max-20 subtitle setting; portrait output honors the saved SRT wrapping plus the existing physical-width safeguard.
Verify: `rtk pnpm -F @vc/server test -- tests/test_render_endpoint.py tests/test_srt.py` passed: 284 passed, 9 skipped.
Verify: `rtk pnpm -F @vc/web test:e2e -- render-correctness` passed: 4 passed, 3 skipped. The v1.1 integrated flow expectation was updated to preserve unaffected manual background ranges under the approved v1.2 semantics.
