# Plan: v1.1 Prototype Update

## Status

- Gate 1 prototype: approved.
- Gate 2 spec: approved.
- Current phase: Phase 3 plan, stopping at Gate 3.
- Source spec: `docs/designs/tasks/v1.1/spec.md`.
- Canonical visual references: `docs/designs/tasks/v1.1/visuals/`.

Gate 2 approval resolves the spec open questions with the recommended choices:

- `BackgroundItem.schedule[]` is the v1.1 contract for mixed image/video background timing.
- `max_chars_per_line` stays as a hidden legacy/default subtitle field during v1.1.
- Subtitle `bg_radius` is persisted and previewed; render may use the nearest libass-supported block style.

## Dependency Graph

1. Schema and generated contracts must land first because the frontend, operation log, server persistence, and render code all consume generated `Project` types.
2. Server render changes can follow the schema once the generated Python model exposes subtitle style fields and background schedule segments.
3. Frontend global save/autosave behavior should be verified before feature UIs depend on it for persistence.
4. Subtitles, watermark, and transcript editing are independent UI slices after autosave is stable.
5. Mixed background scheduling is the largest slice and should be split into contract/helpers, modal editing, inspector/timeline display, preview resolution, and server render expansion.
6. Visual parity and end-to-end evidence come last after all feature surfaces exist.

## Implementation Scope

### Shared Contract

Update `packages/shared-schemas/project.schema.json` and generated artifacts:

- `SubtitleStyle.color`
- `SubtitleStyle.bg_color`
- `SubtitleStyle.bg_opacity`
- `SubtitleStyle.bg_radius`
- `BackgroundScheduleSegment`
- `BackgroundItem.schedule?: BackgroundScheduleSegment[]`

Generated artifacts:

- `packages/shared-schemas/ts/index.ts`
- `packages/shared-schemas/py/schemas.py`

Compatibility rules:

- Existing subtitle configs without new style fields must normalize to v1.1 defaults.
- Existing background items without `schedule` must continue using current fallback expansion.
- `mediaIds` remains the ordered background asset list.

### Frontend Surfaces

Primary files:

- `apps/web/components/editor/EditorModal.tsx`
- `apps/web/components/bg-modal/BgModal.tsx`
- `apps/web/components/inspector/InspectorPanel.tsx`
- `apps/web/components/timeline/TimelineTrack.tsx`
- `apps/web/components/editor/PreviewSurface.tsx`
- `apps/web/lib/preview/resolveDisplay.ts`
- `apps/web/lib/hooks/useProject.ts`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/web/app/editor/page.tsx`

Expected UI behavior:

- Editor header has no manual Save button and shows only empty, `Saving`, or `Saved`.
- Subtitle modal exposes text color and background rectangle controls with correct disabled states.
- Watermark control exposes position, opacity, and size controls and updates preview.
- Transcript row editing uses a textarea covering the full text element with fixed row height.
- Background modal accepts mixed image/video assets, lets image ranges be edited as time strings, supports row drag reorder, and keeps left/right order synchronized.
- Inspector and timeline display scheduled background ranges.
- Preview chooses active background media by explicit schedule.

### Backend And Render

Primary files:

- `apps/server/server/pipeline/filtergraph.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/pipeline/srt.py`
- `apps/server/tests/test_filtergraph.py`
- `apps/server/tests/test_project_schema.py`
- `apps/web/tests/e2e/render-correctness.spec.ts`

Expected backend behavior:

- Project config persistence validates and stores new subtitle/background fields.
- Subtitle force style uses configured text color and supported background fill values.
- SRT/render generation prefers edited transcript sentence text.
- Background render expansion uses explicit schedule segments when present.
- Scheduled images loop for `end - start`; scheduled videos clamp to their ranges and native duration.
- Cache invalidation changes when schedule, order, motion, easing, crossfade, or duration changes.

## Task Groups

Phase 1 establishes schema and persistence contracts.

Phase 2 covers backend render semantics that depend on the contract.

Phase 3 covers editor persistence and independent UI slices.

Phase 4 covers mixed background scheduling across UI, preview, timeline, inspector, and render.

Phase 5 captures visual parity and integration evidence.

The executable checklist is in `docs/designs/tasks/v1.1/todo.md`. Each task has a stable id, acceptance criteria, verification commands, and browser evidence requirements.

## Gate 3 Review Checklist

Before approving Gate 3, verify that:

- Task ids are stable and not overly broad.
- Schema/backend tasks precede dependent frontend tasks.
- Each user-visible change has browser evidence named in `todo.md`.
- Render-impacting changes include 16:9 and 9:16 evidence where relevant.
- Verification commands use repo conventions with `rtk pnpm ...`.
