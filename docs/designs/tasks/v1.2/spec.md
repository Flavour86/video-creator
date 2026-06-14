# Spec: v1.2 Prototype Update

## Source

- Change order: `docs/prototype/v1.2/records.md`
- Approved prototype: `docs/prototype/v1/index.html`
- Canonical visual references:
  - `visuals/background-manual-coverage-16x9.png`
  - `visuals/subtitles-max-characters-16x9.png`
  - `visuals/subtitles-max-characters-9x16.png`
  - `visuals/editor-time-display-16x9.png`

## Objective

Ship the approved v1.2 prototype behavior in the real editor:

1. Replace automatic background coverage with explicit, persistent per-asset ranges.
2. Expose the existing subtitle maximum-characters setting and apply it consistently.
3. Display preview transport timecodes at whole-second precision.

## Assumptions

- Background assets remain selected independently from whether they currently cover a positive-duration range.
- A newly selected background asset starts at `00:00-00:00`.
- A `00:00-00:00` row is intentionally unscheduled and must not trigger automatic playlist fallback.
- Existing valid background ranges, row IDs, and row order survive modal reopen and unrelated edits.
- Subtitle maximum characters remains constrained by the existing shared schema to `20..80`, with `42` as the existing default.
- Whole-second timecodes truncate fractional seconds: `03:11.256` displays as `03:11`.
- The preview transport is the only time display changed by this iteration.

## Project Structure

- Background modal behavior:
  - `apps/web/components/bg-modal/BgModal.tsx`
  - `apps/web/lib/preview/backgroundSchedule.ts`
  - `apps/web/app/editor/page.tsx`
- Subtitle settings and previews:
  - `apps/web/components/editor/EditorModal.tsx`
  - `apps/web/components/editor/PreviewSurface.tsx`
- Server rendering:
  - `apps/server/server/pipeline/render.py`
- Existing contracts:
  - `packages/shared-schemas/project.schema.json`
- Tests and visual cases:
  - `apps/web/components/bg-modal/BgModal.test.tsx`
  - `apps/web/app/editor/page.test.tsx`
  - `apps/web/components/editor/EditorModal.test.tsx`
  - `apps/web/components/editor/PreviewSurface.test.tsx`
  - `apps/web/tests/visual/`

## Change 1: Manual Background Coverage Scheduling

### Interaction

- Remove the `Auto fill` action from the Add/Change Background modal.
- Selecting an asset for the first time adds one row with `Start = 00:00` and `End = 00:00`.
- Selecting or deselecting another asset does not recalculate any existing row.
- Reordering rows changes only row order.
- Editing Start, End, or Hold changes only the edited row.
- Reopening the modal restores the previously saved values and order.
- Saving accepts selected assets that are still at `00:00-00:00`.

### Component States

- No assets selected: the modal retains its existing empty-selection state.
- Existing scheduled asset: the row shows its saved Start, End, and Hold values.
- Newly selected or unscheduled asset: the row shows `00:00-00:00`.
- Scheduled image: Start, End, and Hold remain editable; Extend remains available.
- Newly selected video: starts unscheduled at `00:00-00:00`; End and Hold remain locked to preserve the current video-duration invariant.
- Invalid or incomplete time input does not redistribute other rows or create an automatic range.

### Frontend Behavior

- Replace coverage-building logic with a stable draft schedule keyed by media ID.
- Preserve existing segment IDs and values when selecting, deselecting, reordering, and editing other rows.
- Do not call automatic coverage distribution on modal save.
- Persist zero-duration rows so the application can distinguish intentional manual scheduling from a legacy project with no explicit schedule.
- Treat the presence of a schedule as manual mode:
  - Positive-duration rows participate in preview resolution.
  - Zero-duration rows render nothing.
  - Manual mode never falls back to automatic cycling through selected media.
- Keep the existing operation-log, undo/redo, autosave, and background cache invalidation flows.

### Backend Behavior

- Continue saving canonical project config through `PUT /api/server/projects/{project_id}/config`.
- Persist selected media IDs and explicit schedule rows through the existing project config snapshot.
- Render only schedule rows where `end > start`.
- When an explicit schedule is present but contains no positive-duration row for the current time, render no background asset instead of automatically cycling selected media.
- Do not add a route, database migration, or shared-schema field.
- The existing schema already permits `start = 0` and `end = 0`; no generated TypeScript or Python schema update is required.

### Acceptance Criteria

- The modal contains no `Auto fill` control.
- Adding the first asset creates a visible `00:00-00:00` row.
- Adding, removing, or reordering an asset leaves every unaffected row value unchanged.
- Editing one row leaves every other row value unchanged.
- Saving and reopening restores selected assets, row order, row IDs, and entered values.
- A selected zero-duration asset does not appear in editor preview or server render.
- A gap between scheduled ranges remains a gap; the app does not fill it automatically.
- Undo/redo and autosave continue to work for saved background changes.
- Existing legacy projects without an explicit schedule retain their current compatibility behavior.

### Visual Parity

- Canonical reference: `visuals/background-manual-coverage-16x9.png`
- Required parity: SSIM `>= 0.98`
- Dynamic asset names and thumbnail content may differ; modal structure, control presence, spacing, and row state must match.

## Change 2: Subtitle Maximum Characters Control

### Interaction

- Show a numeric field labeled `Max characters per line` in the Subtitles modal beside the Size field.
- Initialize the field from `subtitles.style.max_chars_per_line`.
- Updating the field immediately updates the modal preview.
- Applying the modal updates the editor preview and persisted subtitle settings.
- Canceling the modal leaves the prior value unchanged.

### Component States

- Valid values are integers from `20` through `80`.
- The existing/default value is `42` when no usable value is present.
- Out-of-range values clamp to the nearest allowed value.
- Invalid or empty input retains the last valid value when committed.
- The control remains available in landscape and portrait preview modes.
- Existing subtitle visibility and background controls retain their current behavior.

### Frontend Behavior

- Bind the field to `subtitles.style.max_chars_per_line`.
- Use the same `20..80` normalization in the modal preview and editor preview.
- Remove the editor preview's inconsistent lower clamp of `12`.
- Wrap subtitle lines according to the configured character maximum while retaining existing physical-width safeguards.
- Continue using the existing `subtitle_settings_update` operation-log entry, undo/redo, and autosave behavior.

### Backend Behavior

- Continue persisting the existing `max_chars_per_line` field in canonical project config.
- Continue using the existing server-render subtitle wrapping behavior.
- Do not add a route, database migration, shared-schema field, or generated schema output.

### Acceptance Criteria

- The Subtitles modal displays `Max characters per line`.
- The field loads the project's current value.
- Entering `20` visibly wraps long preview text more aggressively than `42`.
- Apply persists the value and updates the editor preview.
- Cancel does not persist a draft change.
- Values below `20` normalize to `20`; values above `80` normalize to `80`.
- Editor preview and server render honor the same saved value.
- Subtitle settings remain undoable and survive project reload.

### Visual Parity

- Canonical references:
  - `visuals/subtitles-max-characters-16x9.png`
  - `visuals/subtitles-max-characters-9x16.png`
- Required parity: SSIM `>= 0.98`
- Dynamic subtitle text may differ; field placement, label, value, wrapping response, and modal layout must match.

## Change 3: Whole-Second Preview Transport Timecodes

### Interaction

- The preview transport's current-time and total-duration labels continue updating as playback changes.
- Both labels display whole seconds without milliseconds.

### Component States

- No duration or zero time: `00:00`
- Under one hour: `MM:SS`
- One hour or more: `HH:MM:SS`
- Playing, paused, and seeking use the same format.

### Frontend Behavior

- Format preview transport values without milliseconds.
- Truncate fractional seconds rather than rounding them.
- Preserve the existing omission of a leading zero-hour segment for durations under one hour.
- Do not change timeline rulers, transcript timestamps, background range fields, or other time displays.

### Backend Behavior

- None. This is a frontend presentation-only change.

### Acceptance Criteria

- `03:11.256` displays as `03:11`.
- `00:12.500 / 00:30.000` displays as `00:12 / 00:30`.
- No preview transport label contains a decimal point or millisecond digits.
- A duration over one hour retains the hour segment.
- Playback, seeking, and duration calculations are unchanged.

### Visual Parity

- Canonical reference: `visuals/editor-time-display-16x9.png`
- Required parity: SSIM `>= 0.98`
- Dynamic current-time values may differ; format, typography, placement, and surrounding transport layout must match.

## Testing Strategy

### Automated Behavior Tests

- Update `BgModal.test.tsx` to remove auto-fill expectations and prove:
  - new rows start at zero,
  - unaffected rows retain their values,
  - reorder preserves values and IDs,
  - save preserves zero-duration rows.
- Update `page.test.tsx` to prove canonical config persistence, reload behavior, operation-log behavior, and no automatic background fallback.
- Update `EditorModal.test.tsx` to prove the new subtitle control, normalization, Apply, and Cancel behavior.
- Update `PreviewSurface.test.tsx` to prove subtitle wrapping uses `20..80` and transport timecodes omit milliseconds.
- Add or update server render tests to prove zero-duration manual schedule rows do not trigger playlist fallback and saved subtitle wrapping is honored.

### Browser Verification

- Verify each change in a real browser at `1920x1080`, `1280x720`, and `1080x1920`.
- Capture evidence for each test-plan feature and resolution.
- Compare the four v1.2 canonical visual cases at SSIM `>= 0.98`.
- Confirm no unexpected browser console errors.

### Commands

```powershell
rtk pnpm -F @vc/web test -- components/bg-modal/BgModal.test.tsx app/editor/page.test.tsx
rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/editor/PreviewSurface.test.tsx
rtk pnpm -F @vc/server test -- tests/test_render_endpoint.py tests/test_render_performance.py
rtk pnpm -F @vc/web test:visual -- editor
rtk pnpm test
rtk pnpm lint
rtk pnpm build
```

Schema generation commands are not required because this specification does not change the shared schema.

## Boundaries

- Do not redesign the background modal beyond the approved removal and scheduling behavior.
- Do not add automatic overlap prevention, gap filling, or range redistribution.
- Do not change background crossfade behavior.
- Do not change subtitle font, color, position, burn-in, or background semantics.
- Do not change the subtitle schema range from `20..80`.
- Do not change non-transport timecode formats.
- Do not introduce new persistence tables or API routes.

## Open Questions

1. **Zero-duration save semantics**
   - Recommended: persist `00:00-00:00` rows in the existing schedule. Treat any present schedule as manual mode, ignore zero-duration rows during rendering, and never fall back to automatic cycling.
   - Alternative: reject saving zero-duration rows or add a new manual-mode schema marker. Either alternative conflicts with the approved first-add state or adds unnecessary schema work.

2. **New video range behavior**
   - Recommended: a newly selected video starts at `00:00-00:00`; when its Start value is edited, derive its locked End from the video's native duration.
   - Alternative: immediately assign the native duration on first selection, which would display a non-zero End and differ from the approved prototype behavior.
