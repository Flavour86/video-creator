# task-03 browser note

- Browser: Playwright Chromium via `rtk pnpm -F @vc/web test:e2e -- editor-fullscreen`.
- Route: `/editor/p_v13_fullscreen`.
- Viewports captured: `1920x1080`, `1280x720`, `1080x1920`.
- Resolutions exercised in-browser: `1080p`, `720p`, `9:16`.
- Fullscreen API instrumentation recorded `requestFullscreen` and `exitFullscreen` against `data-testid="preview-stage"`.
- Console errors and failed `/api/server/` responses: none.
