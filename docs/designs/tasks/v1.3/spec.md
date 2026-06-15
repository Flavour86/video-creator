# Spec: v1.3 Prototype Update

## Source

- Change order: `docs/prototype/v1.3/records.md`
- Approved prototype: `docs/prototype/v1/app.html`
- Records item 1: add an icon button for fullscreening the video at the green-frame position in `docs/prototype/v1.3/image.png`.
- Canonical visual reference:
  - `visuals/editor-fullscreen-button-1920x1080.png`

## Objective

Ship the approved v1.3 editor preview control in the real app: add a fullscreen icon button beside the preview transport timecode so users can fullscreen the preview video surface without changing project data or render output.

## Assumptions

- "Video" means the editor preview video surface, not the whole application shell.
- The button belongs in the preview transport row, immediately before the timecode display, matching the approved prototype.
- Fullscreen is an ephemeral browser UI state. It is not saved to project config, browser recovery, operation log, or SQLite.
- If the browser Fullscreen API is unavailable or rejects the request, the editor remains usable and no project state changes.

## Project Structure

- Preview video and transport controls:
  - `apps/web/components/editor/PreviewSurface.tsx`
- Editor page composition:
  - `apps/web/app/editor/page.tsx`
- UI primitives and icons:
  - `apps/web/components/ui`
  - `lucide-react`
- Localized copy:
  - `apps/web/lib/i18n/messages/en.json`
  - `apps/web/lib/i18n/messages/zh.json`
- Tests and visual coverage:
  - `apps/web/components/editor/PreviewSurface.test.tsx`
  - `apps/web/app/editor/page.test.tsx`
  - `apps/web/tests/visual/`

## Change Item 1 - Preview Fullscreen Icon Button

### Interaction

- The editor preview transport row continues to show Previous, Play/Pause, Next, current time, and duration.
- A new icon-only fullscreen button appears to the left of the timecode display and to the right of the playback controls.
- Clicking the fullscreen button requests browser fullscreen for the preview video surface.
- If the preview surface is already fullscreen, clicking the button exits fullscreen.
- Keyboard users can tab to the button and activate it with Enter or Space through normal button semantics.
- The button has a localized accessible label and tooltip equivalent to "Fullscreen preview".

### Component states

- Default: the button is visible, 32px square, icon-only, and styled consistently with the existing transport icon buttons.
- Hover/focus: the button follows the existing `IconButton` hover and focus-visible treatment.
- Playing and paused: the button remains visible and does not alter playback state.
- 16:9 resolutions (`1080p`, `720p`): fullscreen targets the 16:9 preview frame/stage and preserves the current preview composition.
- 9:16 resolution: fullscreen targets the vertical preview frame/stage and preserves the `9 / 16` aspect behavior.
- Fullscreen unsupported or rejected: the button remains visible; no error UI is required, and no console error should be emitted by app code.

### Frontend behavior

- Add a ref for the preview fullscreen target in `PreviewSurface`.
- The fullscreen target should be the preview video surface/stage rather than the app shell, transcript pane, timeline, or inspector.
- Use the browser Fullscreen API:
  - call `requestFullscreen()` when `document.fullscreenElement` is not the preview target.
  - call `document.exitFullscreen()` when the document is already fullscreen.
- Guard the API calls so missing methods or rejected promises do not mutate editor state or break rendering.
- Use a lucide fullscreen/maximize-style icon through the existing icon-button primitive.
- Add localized transport copy for the fullscreen button in English and Chinese.
- Do not change `layers`, `media`, `subtitles`, `watermark`, resolution, playback clock, autosave status, dirty state, render cache status, or operation-log entries.

### Backend behavior

- None.
- No FastAPI route, SQLite migration, shared-schema field, project config payload, render pipeline behavior, clip cache key, or generated schema file changes are required.

### Acceptance criteria

- The editor preview transport row includes a fullscreen icon-only button immediately before the timecode display.
- The fullscreen button has an accessible localized name and tooltip.
- Clicking the button calls `requestFullscreen()` on the preview video surface when not fullscreen.
- Clicking the button while fullscreen calls `document.exitFullscreen()`.
- The button remains present and correctly placed for `1080p`, `720p`, and `9:16`.
- Playing/paused state, current time, selected resolution, layers, project config, autosave state, and operation log are unchanged by fullscreen toggling.
- Unsupported or rejected Fullscreen API calls do not produce user-visible failures or app console errors.
- Existing transport controls and timecode truncation behavior remain unchanged.

### Visual parity

- Canonical reference: `visuals/editor-fullscreen-button-1920x1080.png`
- Required parity: SSIM `>= 0.98`
- Scope: the editor preview transport row, fullscreen icon button placement, spacing, control size, timecode adjacency, and surrounding preview/timeline layout.
- Dynamic project names, transcript content, media thumbnails, waveform bars, timeline clip contents, exact time values, and preview frame imagery may differ from the reference.

## Open Questions

None.
