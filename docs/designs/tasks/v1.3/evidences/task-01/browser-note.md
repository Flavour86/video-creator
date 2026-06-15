# Task 01 Browser Note

- Browser: Chromium via Playwright against `http://127.0.0.1:3313`.
- Route: `/editor/p_task01`.
- Screenshots captured: `preview-1080p-transport.png`, `preview-9x16-transport.png`.
- Fullscreen API instrumentation recorded these calls:
  1. `requestFullscreen` target `data-testid="preview-stage"`.
  2. `exitFullscreen` while `document.fullscreenElement` was `data-testid="preview-stage"`.
  3. Rejected `requestFullscreen` target `data-testid="preview-stage"`; handled without console or page errors.
- Console errors: none.
- Page errors: none.
