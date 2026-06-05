# task-06 - server subtitle max-character wrapping evidence
- subtitle-max20-render-16x9.png - real 1280x720 render frame with saved `subtitles.style.max_chars_per_line = 20`; generated SRT wraps `Capitalism begins here.` as `Capitalism begins` / `here.` and the burned frame matches that wrapping.
- subtitle-max20-render-9x16.png - real 1080x1920 render frame from the same saved max-20 subtitle setting; portrait output honors the saved SRT wrapping plus the existing physical-width safeguard.
Verify: `rtk pnpm -F @vc/server test -- tests/test_render_endpoint.py tests/test_srt.py` passed: 284 passed, 9 skipped.
Verify: `rtk pnpm -F @vc/web test:e2e -- render-correctness` failed outside task-06: the new `renders max-20 subtitle wrapping in 16:9 and 9:16 outputs` test passed, but `render-correctness-v1-1-integrated-editor-flow.spec.ts` failed expecting background schedule rows `2-6` and `6-12` while the app saved `4-8` and `8-12`.
