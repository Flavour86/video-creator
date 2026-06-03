# Test Plan - v1.1

Preconditions (global): Start the app with `rtk pnpm dev` or the test harness equivalent. Open a project with aligned transcript sentences, at least one watermark image, at least three background assets (`bg-red.png`, `bg-video.mp4`, `bg-blue.png`), and an existing background layer. The project should be reachable at `/editor/<project_id>`.
Resolutions: every item is run at 1920x1080, 1280x720, and 1080x1920. At 1080x1920, use the editor's `9:16` preview mode when the item concerns preview or render framing.

## Item 1 - Subtitle Color And Background Controls

Preconditions: Open `/editor/<project_id>` with subtitles enabled and at least one transcript sentence visible.
Steps:
  1. Click `Subtitles` in the inspector. Expected: the subtitle modal opens with no visible `Max chars / line` control.
  2. Set `Background` to `Block background`, `Color` to `#ffcc00`, `Background color` to `#112233`, `Opacity` to `45`, and `Radius` to `14`. Expected: the preview cue updates live with yellow text and a dark block background.
  3. Set `Background` to `None`. Expected: `Background color`, `Opacity`, and `Radius` are disabled and visually muted.
  4. Set `Background` to `Drop shadow only`. Expected: rectangle controls remain disabled while the preview shows only shadow styling.
  5. Set `Background` to `Pill background`. Expected: background color and opacity are enabled; radius remains disabled.
  6. Return to `Block background` and click `Apply`. Expected: the modal closes, autosave reaches `Saved`, and reopening the modal shows the same values.
  7. Start a draft/final render from the edited config. Expected: rendered subtitles use the configured text color and nearest supported background fill style.
Evidence: `docs/designs/bugs/v1.1/evidence/subtitles-controls-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.1/visuals/subtitles-modal-color-bg-1920x1080.png`, `docs/designs/tasks/v1.1/visuals/subtitles-modal-color-bg-1080x1920.png`, and `docs/designs/tasks/v1.1/visuals/subtitles-modal-none-disabled-1920x1080.png` at SSIM >= 0.9. Dynamic transcript text and preview frame may differ.
Pass criteria:
  - [ ] The modal has visible `Color`, `Background color`, `Opacity`, and `Radius` controls.
  - [ ] No visible `Max chars / line` control remains.
  - [ ] Disabled states match `None`, `Drop shadow only`, `Pill background`, and `Block background`.
  - [ ] Preview, saved config, and render output reflect the applied subtitle style.

## Item 2 - Autosave-Only Editor Header

Preconditions: Open `/editor/<project_id>` with a clean loaded config and no render in progress.
Steps:
  1. Inspect the editor header. Expected: no manual `Save` button is present; the autosave area is empty or shows `Saved`.
  2. Change a config value, such as a subtitle style field or watermark position. Expected: autosave text changes to `Saving`, then `Saved`.
  3. Make two rapid edits before the first save completes. Expected: saves do not overlap; the final visible config is the last edit and the status returns to `Saved`.
  4. Reload the editor after `Saved`. Expected: the edited config persists.
  5. Trigger a render. Expected: render buttons are enabled only when the current config differs from the last rendered config, and no manual save is required.
Evidence: `docs/designs/bugs/v1.1/evidence/autosave-header-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.1/visuals/editor-dark.png`, `docs/designs/tasks/v1.1/visuals/editor-light.png`, and `docs/designs/tasks/v1.1/visuals/proto-subtitles-final-check.png` at SSIM >= 0.9. Dynamic project name, preview frame, and render progress may differ.
Pass criteria:
  - [ ] Header exposes no manual Save button.
  - [ ] Autosave status shows only empty, `Saving`, or `Saved`.
  - [ ] Config mutations persist after reload.
  - [ ] Render actions work from the autosaved config.

## Item 3 - Watermark Position, Opacity, And Size

Preconditions: Open `/editor/<project_id>` with at least one valid watermark image in project media.
Steps:
  1. Click `Watermark` in the inspector. Expected: the watermark dialog opens with `Watermark enabled`, asset selection, POSX, POSY, size, and opacity controls.
  2. Enable the watermark if needed and choose the watermark image. Expected: the dialog preview shows the selected asset.
  3. Set POSX to `30`, POSY to `70`, opacity to `42`, and size to about `16%`. Expected: preview placement and opacity update immediately.
  4. Click `Done` or close the dialog after the autosave completes. Expected: reopening the dialog shows the same values.
  5. Clear or disable the watermark. Expected: preview no longer shows the watermark and no crash occurs.
  6. Start a render with the adjusted watermark. Expected: final output places the watermark in the same relative location as the preview within a small tolerance.
Evidence: `docs/designs/bugs/v1.1/evidence/watermark-controls-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.1/visuals/watermark-modal-dark.png`, `docs/designs/tasks/v1.1/visuals/watermark-modal-light.png`, and `docs/designs/tasks/v1.1/visuals/proto-watermark-final-check.png` at SSIM >= 0.9. Watermark source pixels may differ.
Pass criteria:
  - [ ] Position X/Y, opacity, and size controls are visible and editable.
  - [ ] Preview updates immediately as each control changes.
  - [ ] Autosave persists `Project.watermark`.
  - [ ] Missing or cleared watermark media does not crash preview or render.

## Item 4 - Transcript Row Editing With Fixed Height

Preconditions: Open `/editor/<project_id>` with at least four aligned transcript sentences.
Steps:
  1. Locate sentence row 2 and click its edit icon. Expected: only row 2 enters edit mode.
  2. Compare the editing row height with adjacent regular rows. Expected: row height remains fixed; the textarea covers the normal sentence text area.
  3. Enter `Integrated browser flow edited this transcript sentence.` and confirm the edit. Expected: row 2 shows the new text, autosave reaches `Saved`, and timing remains unchanged.
  4. Reopen edit mode, enter whitespace only, and attempt to confirm. Expected: commit is blocked or disabled.
  5. Reopen edit mode, change the text, then cancel. Expected: the prior committed text is restored.
  6. Seek the preview to sentence 2. Expected: the preview subtitle uses the edited text.
  7. Start a render. Expected: generated subtitles use the edited sentence text while preserving start/end times.
Evidence: `docs/designs/bugs/v1.1/evidence/transcript-edit-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.1/visuals/transcript-edit-height-parity-1920x1080.png`, `docs/designs/tasks/v1.1/visuals/transcript-edit-height-parity-1080x1920.png`, and `docs/designs/tasks/v1.1/visuals/editor-dark-9x16.png` at SSIM >= 0.9. Sentence copy may differ.
Pass criteria:
  - [ ] Every sentence row has a right edit icon.
  - [ ] Edit mode preserves row height at desktop and portrait sizes.
  - [ ] Confirm, cancel, and whitespace-only draft behavior are correct.
  - [ ] Autosave and render output use edited transcript text.

## Item 5 - Mixed Image And Video Background Schedule

Preconditions: Open `/editor/<project_id>` with background assets `bg-red.png`, `bg-video.mp4` with a known native duration, `bg-blue.png`, plus optional extra long-name assets for crowded layout checks.
Steps:
  1. Click `Change Background`. Expected: the modal opens and accepts mixed image/video selection.
  2. Select `bg-red.png`, `bg-video.mp4`, and `bg-blue.png`. Expected: the asset header says `3 selected`; it does not say `mixed`, `image`, or `video`.
  3. Inspect the coverage rows. Expected: image rows expose editable `Start`, `End`, and `Hold`; the video row shows native duration and locked timing.
  4. Enter `01:10` into an image timing field on a long project fixture. Expected: the value normalizes to 70 seconds and dependent `Hold` text updates.
  5. Add at least five assets, including long filenames. Expected: names truncate with ellipsis and row inputs do not cross row borders.
  6. Drag a coverage row to a new order. Expected: coverage rows and selected asset cards use the same new order.
  7. Save the background. Expected: autosave reaches `Saved` and config contains one background item with ordered `mediaIds` plus `schedule[]`.
  8. In the inspector, select the background item. Expected: ordered schedule rows show explicit image ranges and the video native-duration label.
  9. Inspect the timeline. Expected: there is one background lane item labeled as timed ranges, not one lane item per segment.
  10. Seek across the schedule in preview. Expected: active background media switches at the scheduled boundaries.
  11. Start a render. Expected: output uses the scheduled image/video sequence; unscheduled legacy backgrounds still render with fallback behavior.
Evidence: `docs/designs/bugs/v1.1/evidence/background-schedule-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.1/visuals/background-coverage-modal-clear-1920x1080.png`, `docs/designs/tasks/v1.1/visuals/background-coverage-modal-clear-1080x1920.png`, `docs/designs/tasks/v1.1/visuals/background-coverage-editor-1920x1080.png`, and `docs/designs/tasks/v1.1/visuals/background-coverage-editor-1080x1920.png` at SSIM >= 0.9. Thumbnail pixels and waveform data may differ.
Pass criteria:
  - [ ] Mixed image/video backgrounds can be selected, edited, saved, reloaded, previewed, inspected, and rendered.
  - [ ] Video durations are locked; image ranges are editable as time strings.
  - [ ] Left asset order and coverage row order stay synchronized after drag reorder.
  - [ ] Crowded and long-name layouts do not overflow.
  - [ ] Server render expands scheduled images/videos by explicit schedule, while legacy unscheduled backgrounds still work.

## Integrated Regression

Preconditions: Use the same project fixture as items 1 through 5.
Steps:
  1. In one browser session, edit subtitle style, watermark position, transcript sentence text, and the mixed background schedule. Expected: each change autosaves and the header returns to `Saved`.
  2. Reload `/editor/<project_id>`. Expected: all edited values remain visible.
  3. Click `Render final`. Expected: navigation reaches `/render/<project_id>/<render_id>`.
  4. Inspect the render page. Expected: final render state is visible with no console errors or failed API responses.
Evidence: `docs/designs/bugs/v1.1/evidence/integrated-flow-<resolution>.png`
Visual parity: use the item-specific references above for changed surfaces; the render page is behavioral evidence only.
Pass criteria:
  - [ ] A single browser flow covers subtitles, watermark, transcript text, mixed background schedule, autosave, reload, and render navigation.
  - [ ] Saved config does not lose any v1.1 fields.
  - [ ] No console errors appear beyond expected test/dev warnings.
