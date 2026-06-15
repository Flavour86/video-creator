# Test Plan - v1.3

Preconditions (global): run the web app and open a project that renders the editor preview surface with transcript timing, at `/editor/:projectId`. The project must have an aligned transcript, audio, at least one visible preview layer, and the English UI locale.

Resolutions: every item is run at `1920x1080`, `1280x720`, and `1080x1920`.

## Item 1 - Preview Fullscreen Icon Button

Preconditions: open the editor route for the test project. Confirm the preview transport row is visible below the preview stage.

Steps:
1. Observe the preview transport row without interacting with playback.
   Expected: Previous, Play/Pause, Next, a fullscreen icon-only button, and the timecode display are visible. The fullscreen button is immediately before the timecode display.
2. Inspect the fullscreen button accessibility metadata.
   Expected: the button has accessible name `Fullscreen preview` and a matching tooltip/title.
3. Click the fullscreen button while the editor is not fullscreen.
   Expected: browser fullscreen is requested on the preview stage/video surface, not the app shell, transcript pane, timeline, or inspector.
4. Click the fullscreen button again while the preview stage is fullscreen.
   Expected: browser fullscreen exits cleanly.
5. Switch the editor resolution controls through `1080p`, `720p`, and `9:16`.
   Expected: the fullscreen button remains visible, 32px square, immediately before the timecode display, and the preview frame preserves the selected aspect.
6. Toggle play/pause before and after fullscreen.
   Expected: fullscreen does not change playback state, current time, selected resolution, layers, autosave state, operation log, or project config.

Evidence: `docs/designs/bugs/v1.3/evidence/editor-fullscreen-button-<resolution>.png`

Visual parity: compare the fullscreen/timecode transport segment against `docs/designs/tasks/v1.3/visuals/editor-fullscreen-button-1920x1080.png` at SSIM `>= 0.98`. Dynamic project names, transcript content, media thumbnails, waveform bars, timeline clip contents, exact time values, and preview frame imagery may differ; button placement, 32px size, spacing, and timecode adjacency must match.

Pass criteria:
- [ ] The fullscreen button appears immediately before the timecode display at all three sweep resolutions.
- [ ] The button is icon-only, 32px square, keyboard-focusable, and named `Fullscreen preview`.
- [ ] Enter fullscreen targets the preview stage/video surface.
- [ ] Exit fullscreen uses `document.exitFullscreen()` without app errors.
- [ ] `1080p`, `720p`, and `9:16` all keep the control visible and correctly placed.
- [ ] Fullscreen toggling does not mutate editor project data, render output, autosave state, operation log, playback state, or whole-second timecode behavior.
- [ ] No unexpected console errors or failed app API responses occur during the flow.
