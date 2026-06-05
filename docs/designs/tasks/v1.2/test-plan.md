# Test Plan - v1.2

Preconditions (global): Start the app with `rtk pnpm dev` or an equivalent browser test harness. Open a project at `/editor/<project_id>` with aligned transcript sentences, subtitles enabled, and four background assets named `neon-lights.jpg`, `ramen-shop.jpg`, `station-intro.mp4`, and `tokyo-skyline.jpg`. `station-intro.mp4` must have a known native duration of `12s`. The project should have a long enough timeline to show a total duration of `15:42`.
Resolutions: every item is run at `1920x1080`, `1280x720`, and `1080x1920`. At `1080x1920`, use the editor's `9:16` preview mode when the item concerns preview or subtitle-modal framing.

## Item 1 - Manual Background Coverage Scheduling

Preconditions: Open `/editor/<project_id>` with the four background assets selected in one background layer. Start from a manual schedule of `neon-lights.jpg 00:00-00:30`, `ramen-shop.jpg 00:30-00:40`, `station-intro.mp4 00:40-00:52`, and `tokyo-skyline.jpg 00:52-15:42`.
Steps:
  1. Click `Change Background`. Expected: the modal opens with four coverage rows and no `Auto fill` control.
  2. Inspect `ramen-shop.jpg`. Expected: `Start`, `End`, and `Hold` fields are editable.
  3. Set `Start ramen-shop.jpg` to `00:00` and `End ramen-shop.jpg` to `00:00`. Expected: only the ramen row changes; the neon, station, and tokyo rows keep their prior values.
  4. Inspect `station-intro.mp4`. Expected: `Start` remains `00:40`, `End` remains locked at `00:52`, and the row still reports native video duration.
  5. Click `Save changes`. Expected: the modal closes and autosave reaches `Saved`.
  6. Reopen `Change Background`. Expected: all four rows retain order and values, including the zero-duration ramen row and the `30s-40s` gap.
  7. Seek preview time to `00:35`. Expected: the preview shows no background media for the gap; the app does not cycle to another selected asset.
  8. Seek preview time to `00:45`. Expected: `station-intro.mp4` is the active background.
Evidence: `docs/designs/bugs/v1.2/evidence/background-manual-coverage-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.2/visuals/background-manual-coverage-16x9.png` at SSIM `>= 0.98`. Dynamic thumbnails and filenames may differ, but row count, no-auto-fill state, spacing, and zero-row fields must match.
Pass criteria:
  - [ ] The modal contains no `Auto fill` control.
  - [ ] Selected assets can retain `00:00-00:00` rows.
  - [ ] Editing one row does not redistribute or mutate unaffected rows.
  - [ ] Saved row order, row IDs, and time values survive modal reopen and project reload.
  - [ ] Preview and render behavior leave manual schedule gaps empty.

## Item 2 - Subtitle Maximum Characters Control

Preconditions: Open `/editor/<project_id>` with subtitles enabled and at least one long subtitle sentence visible in the preview.
Steps:
  1. Click `Subtitles` in the inspector. Expected: the modal opens with a `Max characters per line` numeric field beside the Size control.
  2. Confirm the field loads the current saved value. Expected: a project using the default shows `42`; a project configured for v1.2 evidence shows `20`.
  3. Enter `20`. Expected: the modal preview wraps the sample cue into shorter lines immediately.
  4. Enter `10` and blur the field. Expected: the value normalizes to `20`.
  5. Enter `100` and blur the field. Expected: the value normalizes to `80`.
  6. Return the field to `20` and click `Apply`. Expected: the modal closes and autosave reaches `Saved`.
  7. Reopen the modal after reload. Expected: the field still shows `20`, and the preview uses the same wrapping.
  8. Start a render. Expected: rendered subtitle cues honor the saved max-character value.
Evidence: `docs/designs/bugs/v1.2/evidence/subtitles-max-characters-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.2/visuals/subtitles-max-characters-16x9.png` and `docs/designs/tasks/v1.2/visuals/subtitles-max-characters-9x16.png` at SSIM `>= 0.98`. Dynamic subtitle copy may differ; field label, placement, value, and wrapping response must match.
Pass criteria:
  - [ ] The `Max characters per line` control is visible in landscape and portrait modal layouts.
  - [ ] Values normalize to the existing `20..80` range.
  - [ ] Apply persists the value; Cancel does not persist a draft value.
  - [ ] Editor preview and server render use the same saved wrapping value.
  - [ ] Subtitle settings remain undoable and survive reload.

## Item 3 - Whole-Second Preview Transport Timecodes

Preconditions: Open `/editor/<project_id>` with a loaded duration of `15:42` and a visible preview transport.
Steps:
  1. Inspect the preview transport at load. Expected: current and total time display without decimals, for example `00:00 / 15:42`.
  2. Seek or set playback to `38.399s`. Expected: the preview transport displays `00:38 / 15:42`.
  3. Play and pause preview. Expected: current time continues updating as whole seconds only.
  4. Confirm transcript timestamps, timeline ruler labels, and background range fields are unchanged. Expected: only preview transport labels changed in v1.2.
  5. Use an over-one-hour fixture if available. Expected: the transport keeps the hour segment, for example `01:00:02`, with no milliseconds.
Evidence: `docs/designs/bugs/v1.2/evidence/editor-time-display-<resolution>.png`
Visual parity: compare against `docs/designs/tasks/v1.2/visuals/editor-time-display-16x9.png` at SSIM `>= 0.98`. Dynamic current time may differ; format, typography, and placement must match.
Pass criteria:
  - [ ] Preview transport labels never show decimal points or millisecond digits.
  - [ ] Fractional seconds truncate rather than round.
  - [ ] Durations under one hour use `MM:SS`; durations over one hour use `HH:MM:SS`.
  - [ ] Non-transport time displays keep their previous format.

## Integrated Regression - Save, Reload, And Render

Preconditions: Use the same project fixture as Items 1 through 3. The render buttons should be enabled after config changes, and the render page should be reachable at `/render/<project_id>/<render_id>`.
Steps:
  1. In one browser session, create the manual background zero row and gap from Item 1. Expected: autosave reaches `Saved`.
  2. Set subtitle max characters to `20` from Item 2. Expected: autosave reaches `Saved`.
  3. Seek preview to a fractional time around `38.399s`. Expected: transport shows `00:38 / 15:42` with no milliseconds.
  4. Reload `/editor/<project_id>`. Expected: the background schedule, subtitle max-character value, and transport formatting remain visible.
  5. Click `Render final`. Expected: navigation reaches `/render/<project_id>/<render_id>` and the render page shows `Final render ready`.
  6. Inspect browser console and API responses. Expected: no unexpected console errors and no failed `/api/server/` responses.
Evidence: `docs/designs/bugs/v1.2/evidence/integrated-flow-<resolution>.png`
Visual parity: use the item-specific visual references above for changed surfaces; the render page is behavioral evidence only.
Pass criteria:
  - [ ] A single browser flow covers manual background scheduling, subtitle max characters, whole-second transport, autosave, reload, and render navigation.
  - [ ] Saved config does not lose zero-duration rows, schedule gaps, row order, or subtitle max-character settings.
  - [ ] Final render starts from the reloaded config.
  - [ ] No unexpected console errors or failed server API responses occur.
