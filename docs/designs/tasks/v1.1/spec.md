# Spec: v1.1 Prototype Update

## Source

- `docs/prototype/v1.1/records.md` item 1: update the subtitles modal by replacing `Max chars / line` with subtitle text `Color`, and add background rectangle color, opacity, and radius controls.
- `docs/prototype/v1.1/records.md` item 2: remove the manual editor Save button and show only autosave state text: empty, `Saving`, or `Saved`.
- `docs/prototype/v1.1/records.md` item 3: add watermark position, opacity, and size controls.
- `docs/prototype/v1.1/records.md` item 4: add sentence-level transcript editing from the sentence row, and keep row height fixed when a row enters edit mode.
- `docs/prototype/v1.1/records.md` item 5: support a mixed background made from image assets and video footage, with explicit timing for images.
- Canonical visual references are in `docs/designs/tasks/v1.1/visuals/`.
- Prototype implementation lives under `docs/prototype/v1/`.

## Change Item 1 - Subtitle Color And Background Controls

### Interaction

1. The user opens the global `Subtitles` control from the editor inspector.
2. The modal shows two columns for `Background`, `Position`, `Font`, and `Color`.
3. `Color` uses a color input and hex text to set subtitle text color.
4. `Size` remains a slider.
5. `Show subtitles` remains a switch that controls burn-in visibility.
6. Background-related controls appear below the switch:
   - `Background color`
   - `Opacity`
   - `Radius`
7. When `Background` is `None`, all background-related controls are disabled and visually muted.
8. When `Background` is `Drop shadow only`, background color, opacity, and radius are disabled because the mode does not draw a rectangle.
9. When `Background` is `Pill background`, background color and opacity are enabled; radius is disabled because pill radius is fixed.
10. When `Background` is `Block background`, background color, opacity, and radius are enabled.
11. The preview updates live for text color, background color, opacity, radius, position, size, and show/hide state.
12. `Apply` persists the draft settings; `Cancel` closes without applying modal changes.

### Component states

- `EditorModal` / subtitle modal:
  - Default: `Block background`, `Bottom - safe zone`, `Arial`, `#ffffff`, `42px`, enabled burn-in, background color `#000000`, opacity `62`, radius `8`.
  - `None`: preview cue has transparent background; background controls are disabled.
  - `Shadow`: preview cue uses drop shadow only; background rectangle controls are disabled.
  - `Pill`: preview cue has fixed pill radius; color and opacity are enabled, radius is disabled.
  - `Block`: preview cue has a rectangular background; color, opacity, and radius are enabled.
  - Hidden subtitles: switch off removes preview cue but leaves style controls editable.
  - Disabled controls: native `disabled` attributes plus dimmed visual treatment.

### Frontend behavior

- Replace `SubtitlesSettings.style.max_chars_per_line` UI with `SubtitlesSettings.style.color`.
- Extend subtitle style state with:
  - `color: string`
  - `bg_color: string`
  - `bg_opacity: number`
  - `bg_radius: number`
- Keep `bg_style: "none" | "pill" | "block" | "shadow"`.
- Normalize missing style fields from older configs to:
  - `color = "#ffffff"`
  - `bg_color = "#000000"`
  - `bg_opacity = 62`
  - `bg_radius = 8`
- Keep `max_chars_per_line` only if the schema still requires it during migration; it must no longer be visible in this modal.
- `EditorModal.test.tsx` covers applying color/background settings, disabled controls per background mode, cancel behavior, and preview style.
- Visual parity compares modal layout, spacing, disabled states, and preview cue style against the v1.1 references.

### Backend behavior

- Extend `packages/shared-schemas/project.schema.json` `SubtitleStyle` with `color`, `bg_color`, `bg_opacity`, and `bg_radius`.
- Regenerate shared schema outputs with `rtk pnpm gen:types` and `rtk pnpm gen:py`.
- Persist the extended `Project.subtitles.style` through `PUT /projects/{project_id}/config` and SQLite `project_configs.config_json`.
- Update ffmpeg subtitle `force_style` generation:
  - `PrimaryColour` derives from `style.color`.
  - `OutlineColour` / `BackColour` derives from `style.bg_color` where ASS styling supports it.
  - `bg_opacity` maps into ASS alpha for filled background modes.
  - `bg_radius` affects preview and exported style where supported; if libass cannot render rounded block backgrounds, render still uses closest block style and keeps radius as a preview/config property.
- Existing configs without the new fields remain valid through default normalization.

### Acceptance criteria

- The subtitles modal has no visible `Max chars / line` field.
- The modal has visible `Color`, `Background color`, `Opacity`, and `Radius` controls.
- Text color changes update preview and persisted config.
- Background color, opacity, and radius update preview and persisted config.
- `None` disables background color, opacity, and radius.
- `Drop shadow only` disables background color, opacity, and radius.
- `Pill background` enables background color and opacity but disables radius.
- `Block background` enables all background rectangle controls.
- Generated TS and Python schema artifacts match the updated schema.
- Render output respects subtitle text color and supported background fill settings.

### Visual parity

- `docs/designs/tasks/v1.1/visuals/subtitles-modal-color-bg-1920x1080.png`
- `docs/designs/tasks/v1.1/visuals/subtitles-modal-color-bg-1080x1920.png`
- `docs/designs/tasks/v1.1/visuals/subtitles-modal-none-disabled-1920x1080.png`
- SSIM target: 0.98 for modal layout, control states, colors, typography, and preview cue treatment. Dynamic transcript text, thumbnail content, timecodes, and background editor state may differ.

## Change Item 2 - Autosave-Only Editor Header

### Interaction

1. The editor header no longer offers a manual Save button.
2. When the current config matches the last saved config, the header shows `Saved`.
3. While a config save request is in flight, the header shows `Saving`.
4. While the editor has just loaded or no user-facing status should be shown, the header reserves the same space but renders empty text.
5. Any config-changing action queues asynchronous save work in the background.
6. Render actions remain visible and keep using saved config hash state to decide whether a render is dirty.

### Component states

- `EditorBar`:
  - Empty: reserves status width, no text.
  - Saving: shows `Saving` in a non-clickable status label.
  - Saved: shows `Saved` in a non-clickable status label.
  - Failed: no manual button appears; failed state remains available to screen readers or future error surfacing, but v1.1 visual text stays empty unless an explicit error design is approved.
- Editor page:
  - Pending local operation: operation log is dirty and autosave is scheduled.
  - Saving: exactly one PUT may be in flight; additional edits wait and save after the in-flight request resolves.
  - Saved: operation log is cleared only after the current config signature matches the saved signature.

### Frontend behavior

- Keep using `apps/web/app/editor/page.tsx` autosave refs:
  - `autosaveBaselineRef`
  - `inFlightSaveRef`
  - `autosaveTimerRef`
  - `saveStatus`
- `EditorBar` must not render a Save button.
- Any mutation that changes layers, media, subtitles, watermark, transcript overrides, or output config sets `saveStatus` to `pending` and schedules autosave.
- Autosave writes through `PUT /projects/{project_id}/config`.
- If the PUT fails, local edits and pending operations remain in browser storage.
- i18n keys for `save` may remain for other dialogs, but the editor header must not expose a manual save command.

### Backend behavior

- No new route is required.
- Existing `PUT /projects/{project_id}/config` remains canonical.
- `save_config_snapshot` continues to validate the shared schema and write SQLite `project_configs`.
- Response continues to drive `config_hash` and `has_unrendered_changes`.

### Acceptance criteria

- The editor header has no manual Save button.
- The autosave label shows only empty, `Saving`, or `Saved`.
- Any changed project config schedules a background save.
- Multiple rapid edits do not issue overlapping conflicting saves.
- Failed saves keep local operation-log recovery state.
- Successful saves clear committed operations and update current config hash.
- Render buttons continue to respect dirty/saved state.

### Visual parity

- `docs/designs/tasks/v1.1/visuals/editor-dark.png`
- `docs/designs/tasks/v1.1/visuals/editor-light.png`
- `docs/designs/tasks/v1.1/visuals/proto-subtitles-final-check.png`
- SSIM target: 0.98 for header layout and autosave label placement. Dynamic project name, render progress, and preview frame may differ.

## Change Item 3 - Watermark Position, Opacity, And Size

### Interaction

1. The user opens the global watermark control from the inspector.
2. The watermark dialog shows the selected watermark media and editable controls for:
   - horizontal position
   - vertical position
   - opacity
   - size threshold / scale
3. The preview updates live as the user changes position, opacity, and size.
4. Applying the dialog persists the watermark settings.
5. Removing or disabling watermark clears it from preview and render.

### Component states

- Watermark dialog:
  - No watermark media: empty or disabled controls until media is selected.
  - Image watermark: position, opacity, and scale controls enabled.
  - Video watermark: same controls enabled; preview loops video/thumbnail as already supported.
  - Invalid or missing media: show missing state and prevent apply until a valid media id is selected.
- Preview surface:
  - Watermark absent: no overlay.
  - Watermark present: overlay appears above background/foreground and below UI chrome; position and opacity match controls.

### Frontend behavior

- Use existing `Project.watermark` fields:
  - `mediaId`
  - `posX`
  - `posY`
  - `scale`
  - `opacity`
  - optional `enabled`
- UI labels can say Size, but persisted field remains `scale`.
- Position controls use normalized percentages `0..100`.
- Opacity uses `0..100`.
- Scale uses a bounded percent-like slider in UI and writes schema `scale`.
- Applying the dialog appends a `watermark_update` operation-log entry and schedules autosave.
- `PreviewSurface` and any fallback preview component render the same placement math as final render.

### Backend behavior

- No schema change is required for item 3; `Watermark` already includes position, scale, and opacity.
- `filtergraph.py` already overlays watermark using `pos_x`, `pos_y`, `scale`, and `opacity`; implementation must keep frontend field names and generated Python aliases aligned.
- Persist through `PUT /projects/{project_id}/config`.

### Acceptance criteria

- The watermark dialog exposes position X, position Y, opacity, and size/scale controls.
- Changing each control updates preview immediately.
- Applying writes `Project.watermark` with expected numeric values.
- Autosave persists the watermark update through `PUT /projects/{project_id}/config`.
- Final render overlay uses the same position, size, and opacity as preview within a small tolerance.
- Missing watermark media does not crash preview or render.

### Visual parity

- `docs/designs/tasks/v1.1/visuals/watermark-modal-dark.png`
- `docs/designs/tasks/v1.1/visuals/watermark-modal-light.png`
- `docs/designs/tasks/v1.1/visuals/proto-watermark-final-check.png`
- SSIM target: 0.98 for modal layout, controls, and preview placement. Watermark source image content may differ.

## Change Item 4 - Sentence Row Editing With Fixed Height

### Interaction

1. Each transcript sentence row shows an edit icon at the right edge.
2. Clicking the icon enters edit mode for that sentence only.
3. Edit mode replaces the sentence text with an inline textarea and shows confirm/cancel icon buttons.
4. The row keeps the same height as the selected regular mode, even when the action column changes from one icon to two icons.
5. Confirm commits the edited sentence text.
6. Cancel restores the previous text.
7. Empty or whitespace-only text cannot be committed.
8. Editing one sentence does not change its timing range.

### Component states

- Transcript row:
  - Regular: index, timecode, sentence text, edit icon.
  - Hover/selected: same height as regular, with visible selection treatment.
  - Editing: same grid height as selected regular row; a textarea overlays the whole normal sentence text element while a hidden text copy preserves wrapping and height; confirm/cancel buttons occupy a reserved action width.
  - Invalid draft: commit disabled or blocked until non-empty text exists.
- Transcript panel:
  - One active edit at a time.
  - Autosave status updates after commit.

### Frontend behavior

- Use existing `Project.transcript.sentences[]` override support when present.
- If loaded project has no `transcript.sentences`, derive editable sentence rows from alignment data and write the committed override payload into `Project.transcript.sentences`.
- Preserve `index`, `start_s`, `end_s`, and `confidence_avg` for edited rows; only `text` changes.
- Append exactly one operation-log entry for a committed sentence edit.
- Schedule autosave after commit.
- Preview subtitles and transcript list use the edited text immediately.
- Re-recorded alignment may change timing, but sentence edits remain attached by sentence index unless future merge/split behavior changes that index.

### Backend behavior

- No new route is required.
- Persist edited sentence payload through `PUT /projects/{project_id}/config`.
- Rendering and `subtitles.srt` generation must prefer `Project.transcript.sentences[].text` when present, while preserving aligned timings.
- Existing transcript file on disk is not rewritten by this UI unless a later explicit export workflow is added.

### Acceptance criteria

- Every sentence row has a right-aligned edit icon.
- Entering edit mode does not change the row height at desktop or portrait viewport sizes.
- The edit textarea covers the full normal sentence text element, not only a single input line.
- Confirm updates the visible sentence text and preview subtitle text.
- Cancel restores the previous sentence text.
- Whitespace-only commits are rejected.
- Committing schedules autosave and persists the edited transcript sentence payload.
- Render output uses the edited sentence text.

### Visual parity

- `docs/designs/tasks/v1.1/visuals/transcript-edit-height-parity-1920x1080.png`
- `docs/designs/tasks/v1.1/visuals/transcript-edit-height-parity-1080x1920.png`
- `docs/designs/tasks/v1.1/visuals/editor-dark-9x16.png`
- SSIM target: 0.98 for row layout, selected/editing treatment, icon placement, and fixed-height behavior. Sentence copy may differ.

## Change Item 5 - Mixed Image And Video Background Schedule

### Interaction

1. The user opens `Change Background`.
2. The background modal allows selecting both images and video footage in one background sequence.
3. Videos display their native duration and are locked by default.
4. Images display explicit editable `Start`, `End`, and `Hold` values.
5. The `Coverage plan` is an ordered row list; there is no separate timeline strip or bottom gap/overlap status banner.
6. The left asset header shows only `{n} selected`; it does not append `mixed`, `image`, or `video` kind text.
7. Each row stays inside its card at crowded counts, including its `Start`, `End`, and `Hold` inputs plus any row action.
8. Each timing control keeps the label and input on the same line.
9. Timing inputs display time strings and accept `mm:ss`, `hh:mm:ss`, or raw seconds. For example, entering `01:10` stores `70` seconds and updates dependent `Hold` text.
10. Long asset filenames truncate with `...` in both left asset cards and coverage row titles; the full filename remains available through the element title/tooltip.
11. `Auto fill` distributes image ranges around locked video ranges to cover the full project duration.
12. The user can manually edit image ranges after auto-fill.
13. The user can drag rows in `Coverage plan` to reorder the sequence.
14. Reordering coverage rows immediately reorders the selected assets in the left asset section, and reordering selected assets on the left immediately reorders the coverage rows.
15. Saving writes one background layer with a single background item containing both the ordered media ids and a schedule array.
16. The inspector shows the resolved background schedule rows, including native video duration labels and explicit image range labels.
17. The timeline shows one background lane with a coverage label such as `4 timed ranges`.

### Component states

- Background modal:
  - Empty: no save until at least one valid background media asset exists.
  - Mixed selected: accepts image and video assets in one ordered list.
  - Video row: duration locked; shows start/end from the schedule and native duration.
  - Image row: start/end/hold editable with same-line label/input controls.
  - Crowded plan: five or more selected assets remain readable; row inputs do not overflow their row border horizontally or vertically.
  - Long names: asset cards and schedule rows apply single-line truncation with ellipsis instead of expanding the row.
  - Dragging row: dragged row is visually muted and valid drop targets show a subtle dashed outline.
  - Reordered plan: both the row list and selected asset cards share the same order.
  - Invalid range: save disabled when any segment has `end <= start` or references missing media.
- Inspector:
  - Shows ordered assets with range and type labels.
  - Replacing a background asset keeps the schedule row when kind/duration remains compatible; otherwise invalidates cache and requires range review.
- Timeline:
  - Shows one background lane item for the scheduled sequence.

### Frontend behavior

- Extend the background item model with an explicit schedule:
  - `schedule: BackgroundScheduleSegment[]`
  - segment fields: `id`, `mediaId`, `start`, `end`, `lockedDuration`
  - optional future fields may include `transitionIn`, `transitionOut`, and `label`, but v1.1 should keep transition behavior on the parent item unless implementation requires per-segment transitions.
- Keep `mediaIds` as the ordered asset list for compatibility with existing inspector/timeline logic.
- Do not enforce the current production `BgModal` first-kind lock; mixed image/video selection is allowed.
- Do not render a separate coverage strip or a separate coverage-status banner in the modal; the ordered row list is the editing surface.
- Maintain one order source in `mediaIds`; drag-and-drop from either the left selected asset cards or the right coverage rows updates `mediaIds` and rebuilds `schedule` in that order.
- Display the selected asset count as `{n} selected` only.
- Render timing fields as compact label/input pairs on one row per field.
- Format time inputs as `mm:ss` for values under one hour and `hh:mm:ss` for longer values.
- Parse user-entered timing strings in `mm:ss`, `hh:mm:ss`, or numeric seconds form, normalize them to seconds, and store schedule `start`/`end` as numbers.
- Recompute `Hold` from normalized `end - start` after a `Start` or `End` edit.
- Use ellipsis truncation for long filenames in the asset grid and schedule rows, with the full name available through `title`.
- `Auto fill` algorithm:
  - Sort selected assets by modal order.
  - Video segments use known media duration and are locked.
  - Image segments split all unclaimed time around locked videos.
  - If no video duration is known, split the full background range evenly across selected assets.
  - Clamp all segments to `[0, projectDuration]`.
  - Preserve user-edited image ranges until the user runs `Auto fill` again.
- Save invalidates background cache when the schedule, media order, motion, easing, crossfade, or duration changes.
- Preview and timeline resolve active background media by current playback time using the schedule, not even-split fallback.

### Backend behavior

- Extend `BackgroundItem` schema with a `schedule` array and regenerate TS/Python types.
- Persist the schedule in `project_configs.config_json`.
- Update render expansion in `apps/server/server/pipeline/filtergraph.py`:
  - If a background item has `schedule`, expand from schedule segments.
  - For each scheduled image segment, use `-loop 1` image input behavior and apply motion over `end - start`.
  - For each scheduled video segment, use native video media and clamp to schedule `start/end`; locked native duration must not extend past project duration.
  - Keep parent `crossfade`, motion, easing, and transitions unless per-segment transitions are added in implementation.
  - Existing background items without `schedule` continue to render with the current fallback expansion.
- Update preview resolver and any render correctness tests to prefer explicit schedule.
- Validate schedule references against project `media[]`; missing assets mark the item invalid/orphaned rather than crashing.

### Acceptance criteria

- The background modal accepts a mixed image/video selection.
- Video rows show native duration and locked start/end.
- Image rows show editable start/end/hold values.
- The modal does not show a separate coverage strip or bottom gap/overlap status banner.
- The asset header shows `{n} selected` only and never shows `mixed`.
- Timing labels and inputs stay on the same line for `Start`, `End`, and `Hold`.
- Time fields accept strings such as `01:10` and persist normalized seconds.
- Five or more selected assets fit without row inputs crossing the row border.
- Long asset names truncate with `...` instead of expanding asset cards or coverage rows.
- Dragging a coverage row reorders the coverage rows and the left selected asset cards together.
- Dragging a selected asset card reorders the left selected asset cards and the coverage rows together.
- `Auto fill` creates full coverage for mixed image/video selections when total selected duration can cover the project.
- Save persists `mediaIds` plus `schedule` in the project config.
- Inspector and timeline show timed background ranges.
- Preview switches active background media according to schedule.
- Render expands scheduled images and videos according to their explicit time ranges.
- Existing non-scheduled background configs remain valid.

### Visual parity

- `docs/designs/tasks/v1.1/visuals/background-coverage-modal-clear-1920x1080.png`
- `docs/designs/tasks/v1.1/visuals/background-coverage-modal-clear-1080x1920.png`
- `docs/designs/tasks/v1.1/visuals/background-coverage-editor-1920x1080.png`
- `docs/designs/tasks/v1.1/visuals/background-coverage-editor-1080x1920.png`
- SSIM target: 0.98 for modal structure, schedule rows, drag-ready row treatment, compact input layout, inspector schedule display, and timeline label. Actual thumbnails and waveform data may differ.

## Open Questions

1. Confirm the background schedule contract for item 5.
   - Recommended: store `BackgroundItem.schedule[]` with explicit segment `start`/`end` times, lock video rows by native duration, keep `mediaIds` as the single order source, and let image rows carry editable durations. This matches the approved prototype and gives users direct control when static images have no natural duration.
   - Alternative A: keep no schedule field and compute ranges by even split at render time. This is simpler but makes user intent implicit and hard to inspect.
   - Alternative B: store a per-image `duration` only and derive start times by order. This is easier than explicit ranges but weaker for gaps, overlaps, and manual placement.
   - Alternative C: model every background segment as a separate `BackgroundItem`. This reuses existing item timing but makes the modal/inspector harder to reason about as one background sequence.
2. Confirm whether `max_chars_per_line` should remain in the schema as a hidden legacy/default field for this version.
   - Recommended: keep it for backward compatibility during v1.1 implementation, hide it from UI, and remove it only in a later schema cleanup if no renderer code depends on it.
3. Confirm how much final-render parity is required for subtitle background radius.
   - Recommended: persist `bg_radius` and show it in preview; render the closest supported libass block style if rounded rectangle radius cannot be represented exactly by ffmpeg subtitles.
