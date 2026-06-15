# task-01 - Implement preview fullscreen control - evidence

- preview-1080p-transport.png - Shows the default 1080p editor preview transport with the fullscreen icon button immediately before the timecode display.
- preview-9x16-transport.png - Shows the 9:16 editor preview transport with the fullscreen icon button still immediately before the timecode display.
- browser-note.md - Records the Playwright browser check proving request/exit/rejected fullscreen calls target `data-testid="preview-stage"` with no console or page errors.
Verify: `rtk pnpm -F @vc/web test -- components/editor/PreviewSurface.test.tsx app/editor/page.test.tsx` passed; `rtk pnpm -F @vc/web build` passed; Playwright Chromium browser check passed.
