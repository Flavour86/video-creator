# Plan: v1.3 Prototype Update

## Status

- Gate 1 prototype: approved.
- Gate 2 spec: approved.
- Current phase: Phase 3 plan, stopping at Gate 3.
- Source spec: `docs/designs/tasks/v1.3/spec.md`.
- Canonical visual references: `docs/designs/tasks/v1.3/visuals/`.

## Dependency Graph

1. No shared schema, server, SQLite, or render-pipeline change is needed.
2. `PreviewSurface` owns the preview stage, canvas, transport buttons, and timecode display, so fullscreen behavior belongs there.
3. Localized transport copy must be added with the UI change so the icon-only button has an accessible name.
4. Component tests must prove fullscreen enter/exit, unsupported API handling, existing transport behavior, and no editor-state mutation.
5. Visual parity and screenshot inventory come after the button exists, because they depend on the final control placement.
6. An integrated browser flow comes last to prove the button works in the assembled editor at desktop and portrait resolutions.

## Implementation Scope

### Preview Fullscreen Control

Primary files:

- `apps/web/components/editor/PreviewSurface.tsx`
- `apps/web/components/editor/PreviewSurface.test.tsx`
- `apps/web/lib/i18n/messages/en.json`
- `apps/web/lib/i18n/messages/zh.json`

Expected behavior:

- Add a 32px icon-only fullscreen button in the preview transport row.
- Place the button immediately before the timecode display.
- Request fullscreen on the preview stage, not the full editor shell.
- Exit fullscreen when the document is already fullscreen.
- Keep playback, current time, selected resolution, layers, project config, save state, and operation log unchanged.
- Ignore missing or rejected Fullscreen API calls without user-visible failure.

### Visual Parity And Inventory

Primary files:

- `apps/web/tests/visual/editor-visual-cases.ts`
- `apps/web/tests/visual/editor.visual.spec.ts`
- `apps/web/tests/visual/screenshot-inventory.test.ts`
- `apps/web/tests/visual/visual-manifest.ts`

Expected behavior:

- Add a v1.3 visual case for `docs/designs/tasks/v1.3/visuals/editor-fullscreen-button-1920x1080.png`.
- Compare at SSIM `>= 0.98`.
- Document dynamic data tolerance for transcript text, media thumbnails, waveform bars, timeline clips, names, and live time values.
- Declare the v1.3 reference under editor ownership and map it to exactly one visual parity case.

### Integrated Browser Flow

Primary files:

- `apps/web/tests/e2e/editor-fullscreen.spec.ts` or an equivalent focused e2e spec.

Expected behavior:

- Open the editor in a real browser.
- Confirm the fullscreen button is visible and accessible.
- Mock or observe the Fullscreen API to prove enter and exit are called on the preview stage.
- Exercise `1080p`, `720p`, and `9:16`.
- Capture evidence at `1920x1080`, `1280x720`, and `1080x1920`.
- Verify there are no unexpected console errors.

## Task Groups

Phase 1 implements the user-facing fullscreen control and unit coverage.

Phase 2 adds v1.3 visual parity and screenshot inventory coverage.

Phase 3 adds the integrated real-browser fullscreen flow.

The executable checklist is in `docs/designs/tasks/v1.3/todo.md`. Each task has a stable id, acceptance criteria, verification commands, and browser evidence requirements.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Fullscreen targets the wrong element and hides useful framing. | Medium | Use a dedicated preview-stage ref and assert the target in tests. |
| Rejected Fullscreen API promises create noisy console errors. | Medium | Catch and ignore request/exit rejections in app code, then cover the rejection path. |
| Icon-only control is inaccessible. | High | Use `IconButton` with localized `label` and title. |
| Visual parity overcompares dynamic media and transcript content. | Medium | Mask or document dynamic regions, while keeping the transport row and button placement compared at `>= 0.98`. |
| Browser e2e fullscreen is flaky in headless mode. | Medium | Mock `requestFullscreen` and `exitFullscreen` in the integrated flow while still capturing the actual assembled UI. |

## Gate 3 Review Checklist

Before approving Gate 3, verify that:

- Task IDs are stable and ordered by dependency.
- No backend, schema, SQLite, or render-output work is planned.
- Every task has a concrete browser evidence requirement.
- Verification commands use the repo's `rtk pnpm ...` convention.
- The visual task targets the v1.3 canonical reference under `docs/designs/tasks/v1.3/visuals/`.
