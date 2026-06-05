# task-02 — server render manual background schedule semantics — evidence

- scheduled-background-16x9.png — Frame extracted from a 1920x1080 server render at `t=2s`; the explicit positive schedule row (`1s..5s`) renders the green background.
- zero-duration-manual-row-16x9.png — Frame extracted from a 1920x1080 server render at `t=2s`; the explicit `0s..0s` manual schedule row renders black/no background instead of playlist fallback.
- manual-schedule-gap-16x9.png — Frame extracted from a 1920x1080 server render at `t=3s`; the gap between manual schedule rows (`0s..2s` and `5s..7s`) renders black/no background instead of playlist fallback.

Verify: `rtk pnpm -F @vc/server test -- tests/test_filtergraph.py tests/test_clip_cache.py tests/test_render_endpoint.py` — passed (`274 passed, 9 skipped`).
