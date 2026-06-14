# Plan: v1.2 Prototype Update

## Status

- Gate 1 prototype: approved.
- Gate 2 spec: approved.
- Current phase: Phase 3 plan, stopping at Gate 3.
- Source spec: `docs/designs/tasks/v1.2/spec.md`.
- Canonical visual references: `docs/designs/tasks/v1.2/visuals/`.

Gate 2 approval resolves the spec open questions with the recommended choices:

- Persist `00:00-00:00` background schedule rows as explicit manual intent.
- Treat any present background schedule as manual mode: zero rows and gaps render nothing and never trigger playlist fallback.
- New video rows start at `00:00-00:00`; editing Start derives the locked End from native duration.

## Dependency Graph

1. No shared schema change is needed; the existing project schema already permits zero-duration schedule rows and already carries `subtitles.style.max_chars_per_line`.
2. Background manual-mode semantics must land before modal persistence, because preview/render need to distinguish explicit manual scheduling from legacy fallback.
3. The background modal can then remove auto-fill behavior and persist stable draft rows without redistributing ranges.
4. Subtitle max-character UI is independent of background scheduling, but the editor and render paths must normalize to the same `20..80` range.
5. Whole-second transport timecodes are frontend-only and can be implemented independently.
6. Visual parity cases and integrated browser evidence come last after all changed surfaces exist.

## Implementation Scope

### Manual Background Scheduling

Primary files:

- `apps/web/lib/preview/resolveDisplay.ts`
- `apps/web/lib/preview/backgroundSchedule.ts`
- `apps/web/components/editor/PreviewSurface.tsx`
- `apps/web/components/bg-modal/BgModal.tsx`
- `apps/web/app/editor/page.tsx`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/pipeline/filtergraph.py`
- `apps/server/server/pipeline/clip_render.py`

Expected behavior:

- Explicit schedules are manual mode even when all rows are zero-duration.
- Positive-duration rows display/render inside their ranges.
- Zero-duration rows and schedule gaps display/render no background.
- Legacy projects with no explicit schedule keep existing playlist fallback behavior.
- The modal has no `Auto fill` control and never redistributes existing ranges.
- New asset rows start as `00:00-00:00` and persist through save/reopen.

### Subtitle Maximum Characters

Primary files:

- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/components/editor/PreviewSurface.tsx`
- `apps/server/server/pipeline/render.py`

Expected behavior:

- The Subtitles modal exposes `Max characters per line`.
- The modal, editor preview, and server render all honor the saved `max_chars_per_line`.
- Normalization uses the schema range `20..80` everywhere.

### Preview Transport Timecodes

Primary file:

- `apps/web/components/editor/PreviewSurface.tsx`

Expected behavior:

- Preview transport current/total labels show whole seconds only.
- Fractional seconds are truncated, not rounded.
- Other timecode displays are unchanged.

## Task Groups

Phase 1 establishes background manual-mode semantics in preview and render.

Phase 2 applies those semantics to the background modal and editor persistence flow.

Phase 3 implements the independent subtitle and transport display changes.

Phase 4 adds v1.2 visual parity coverage and integrated browser evidence.

The executable checklist is in `docs/designs/tasks/v1.2/todo.md`. Each task has a stable id, acceptance criteria, verification commands, and browser evidence requirements.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Zero-duration rows are normalized away before preview/render can detect manual mode. | High | Preserve the raw signal that a schedule was present and add tests for zero-only schedules and gaps. |
| Background save path accidentally calls legacy auto-fill helpers. | High | Update modal and page tests to assert exact row values before and after unrelated selection, reorder, save, and reload. |
| Legacy projects without schedules lose fallback backgrounds. | Medium | Keep explicit tests for missing schedule versus empty/zero explicit schedule. |
| Subtitle preview and render use different max-character clamps. | Medium | Align frontend normalization to `20..80` and add web/server tests using the same saved value. |
| Visual parity fails on dynamic thumbnails or text. | Medium | Use deterministic fixtures or masks for dynamic content; compare style/layout against v1.2 references. |

## Gate 3 Review Checklist

Before approving Gate 3, verify that:

- Task IDs are stable and not overly broad.
- Background manual-mode semantics precede modal and persistence work.
- Each user-visible change has browser evidence named in `todo.md`.
- Render-impacting changes include render or preview evidence at the relevant aspect ratios.
- Verification commands use the repo's `rtk pnpm ...` convention.
