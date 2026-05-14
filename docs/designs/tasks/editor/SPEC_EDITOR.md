# Video Creator Spec - Editor

Parent spec index: [SPEC.md](../../SPEC.md).

## Editor Page

### Visual Truth
![dark](../../visuals/editor-dark.png)
![light](../../visuals/editor-light.png)

Purpose: transcript/subtitle-anchored video editing.

### Primary layout:

- Top editor toolbar.
- draft render strip below toolbar(showing when click the `draft render` button).
- Three-pane editor body:
  - Transcript pane.
  - Center preview plus timeline.
  - Right Inspector rail with global video config at the top.

#### Editor Toolbar Interactions

Left:

- Back/home icon button to `Launcher`(Home).
- Project title.

Right:

- `Save`: 
  1. Click: Browser storage records the working editing state and incremental operations for local recovery, `Save` snapshots the current browser working config and syncs it to SQLite `project_configs`
  2. Disabled: when the config is saving
  3. Shortcuts: `Cmd/Ctrl+Z`: undo, `Cmd/Ctrl+Shift+Z`: redo. Don't save a whole config on every undo/redo operation,
    Undo/redo persistence:
      - Browser storage records incremental edit operations such as add clip, patch clip, delete clip, move clip, stretch clip, change subtitle style, change background, and change watermark.
      - Do not record the entire project config for every operation.
      - On reload, the browser can restore the current draft and operation stack for the same `project_id`.
      - SQLite remains canonical after explicit save/sync.
  4. Editing autosave writes browser draft/operation-log recovery state and marks the project dirty; it does not replace explicit `Save` sync to SQLite.
- `Render Draft`: 
  1. Click: explicitly save/sync the current config, show the `Draft Render Strip` and percentage of the progress in the `Render Draft` button, and then queue the draft render,
  2. Disabled: when draft render is active, queued
- `Render Final`: 
  1. Enabled: 
    a. New aligned project: Draft/Final render is enabled even without any foreground/background/PIP. 
    b. Already-rendered or in-running project: Draft/Final render is enabled only when the current config hash differs from the latest successful rendered config hash. 
  2. Click: explicitly save/sync the current config, queue final render, and navigate to `/render/:projectId/:render_id` after queue succeeds.

`Editor Toolbar` states:

- Save pending, saving, saved, failed.
- Cache warm, cold, partial, invalid.
- Render disabled because no unrendered changes on already-rendered project.
- Render queued/running.

### Draft Render Strip

#### Visual Truth
![dark](../../visuals/editor-draft-render-strip-dark.png)
![light](../../visuals/editor-draft-render-strip-light.png)

Appears below toolbar when draft render is active, queued, failed, cancelled, or recently completed.

Fields:

- progressbar `aria-valuenow`.
- fill percentage.
- label: queued, rendering draft, draft ready, failed, cancelled.
- stage label.
- percentage.

Stages label:

1. queued
2. verifying cache
3. pre-rendering clips
4. building `subtitles.srt`
5. ffmpeg compose
6. muxing audio
7. done

Output:

- Drafts write to `<project>/.vc/drafts/<timestamp>.mp4`.

### Transcript Pane

Sentences are derived from the generated `<project>/subtitles.srt`, which is adjusted against the transcript content.

Layout:

- Search input with search icon.
- Keyboard hint `Cmd/Ctrl+F`.
- Header: `Transcript - N aligned`.
- Selection range chip.
- Scrollable sentence list.
- Sentence row.

Sentence row fields:

- sentence index.
- timecode(start and end time).
- sentence text.

Interactions:

- Click sentence: select it and seek playhead to the sentence start timestamp.
- Shift-click sentence: select contiguous sentence range. Check visual ![selected multiple](../../visuals/editor-transcript-1.png)
- Right-click sentence: open context menu. Check visual ![show menus](../../visuals/editor-transcript-2.png)
- Current sentence is highlighted by playhead time.
- Search filters transcript and scrolls to the first matched element.
- Shortcuts: `Enter` or `Down arrow` in search advances to the next match, Escape clears transcript search
- Concatenate/merge sentences in the Transcript Panel, not in the Subtitles modal, check visual ![merge](../../visuals/editor-transcript-3.png). This updates the subtitle/sentence model and dependent clip anchors.
- Save persists merged transcript/sentence state to `project_configs`; it does not rewrite `<project>/subtitles.srt`.
- `<project>/subtitles.srt` is rewritten from the latest saved config when the user taps `Render Draft` or `Render Final`.

Sentence states:

- normal.
- selected.
- selection first.
- selection last.
- current/now.
- search match with highlighted border.

#### Transcript Context Menu

#### Visual Truth
Check visual ![show menus](../../visuals/editor-transcript-3.png)

Opened at pointer position.

Buttons:

- `Assign media to range...`: opens Assign modal with `from=to=clicked sentence`.
- `Merge <N> sentences`: merge multiple sentences
- `Play from here`: selects sentence and seeks to its start.

### Preview Surface

#### Visual Truth
![dark](docs/designs/../../visuals/editor-preview-dark.png)
![light](docs/designs/../../visuals/editor-preview-light.png)

#### Layout:

- Preview stage with active aspect ratio. ![9：16](../../visuals/editor-preview-1.png)
- Preview canvas.
- Background scene or black fallback.
- Foreground scene when active.
- PiP overlays when active.
- Subtitle overlay when enabled.
- Watermark overlay when configured.
- Transport controls.
- Timecode display.
- `icon + Layers - N` Button

Render order:

1. black fallback
2. background
3. active fullscreen foreground
4. active PiP overlays
5. subtitles
6. watermark

#### Interaction：

- Preview stage: reflect the visual effect that configed by user in live time, including Background scene, Foreground scene, PiP overlays, Subtitle, Watermark
- Shortcuts `Space`: play/pause.

Buttons:
- Previous, play from previous sentence.
- Play/Pause.
- Next, play from next sentence.

Preview controls:
- Resolution segmented control:
  - `1080p`: 1920x1080, 16:9
  - `720p`: 1280x720, 16:9
  - `9:16`: 1080x1920, vertical
- `Layers - N`: opens the `Layers Popover`. check visual ![layers popover](../../visuals/editor-preview-popover.png)

Preview states:

- no background.
- background only.
- no foreground.
- foreground active over background.
- no PiP overlays.
- one or more active PiP overlays.
- subtitles off.
- subtitles visible.
- watermark off.
- watermark visible.
- playing.
- paused.

#### Layers Popover

Opened by `Layers - N`.
![layers popover](../../visuals/editor-preview-popover.png)

Content:

- Header `Layer order - top renders on top`.
- Rows in render order.

Layer row fields:

- kind dot.
- layer name.
- item count.
- optional trash button for removable background/foreground/PiP layers.

Interactions:

- Click row: select first item in layer, close popover.
- Click background trash: remove background, keep other layers.
- Click outside closes.

### Timeline

#### Visual Truth
![dark](docs/designs/../../visuals/editor-timeline-dark.png)
![light](docs/designs/../../visuals/editor-timeline-light.png)

#### Layout:

- Header `Timeline`.
- Metadata: `30 fps`, clip count, cache count.
- Ruler with ticks and time labels.
- Waveform bars spanning the full voice duration and the full timeline width. Do not render a half-width waveform.
- Track rows.
- Track label.
- Track clips.
- Playhead line.

Timeline layout:

- Timeline keeps a fixed height.
- If there are too many layers, the track area scrolls without resizing the preview or pushing the Inspector off screen.

#### Interaction

Track visual order:

- Display from bottom to top as background, foreground, PiP overlays, subtitles.
- This visual order must match render stacking.

Layer row packing:

- Background row is bottom.
- Foreground clips that overlap in time must sit on different foreground layers; non-overlapping foreground clips can share a layer.
- PiP clips that overlap in time must sit on different PiP layers; non-overlapping PiP clips can share a layer.
- Subtitles row is top.

Clip interactions:

- Click ruler/waveform area: seek.
- Click clip: select clip and populate Inspector.
- Drag left grip: resize start time.
- Drag right grip: resize end time.
- Drag clip body: move both start and end time together.
- Drag/drop and stretch must be supported for every visible clip kind where the underlying data has timing: background clips, foreground clips, PiP clips, and subtitle clips.
- During drag/stretch, synchronize current time/selection state with the sentence row in the left panel.
- Delete selected non-background clip through clip `x`.
- Shortcuts `Backspace` or `Delete`: delete selected non-background item.

Resize/move constraints:

- start cannot be below `0`.
- end cannot exceed voice/project duration.
- minimum duration is `0.5s`.
- resizing changes `start`/`end` seconds and automatically recalculates the covered sentence range from the updated time span.

### Inspector Rail And Global Video Config

![dark](../../visuals/editor-inspector-dark.png)
![light](../../visuals/editor-inspector-light.png)

The right rail starts with global video config controls, then the contextual Inspector.

Global video config controls:

- `Watermark`: configure optional watermark.
- `Subtitles`: opens Subtitles modal for global subtitle defaults.
- `Add` or `Change` Background: opens `Change background`

Inspector states:

- No selection: There is no way no clip selected, because once user get in, the default clip the background layer.
- Background selected.
- Foreground selected.
- PiP selected.

#### Inspector: Background Clip

![Inspector with Background](../../visuals/editor-inspector-1.png)

Sections:
- Background assets(multiple).
- Crossfade.
- Motion.
- Easing
- `Delete item` with danger color..

Fields:
- Assets card.
- Crossfade: from 0-2 seconds.
- Motion kind: `none`, `ken burns_subtle`, `ken_burns_strong`.
- Easing: `linear`, `ease_in`, `ease_out`.
- `Delete item` with danger color.

Interactions:

Background asset rules:

- Background can use images or video clips, but not a mix in one background playlist.
- If background assets are images, they cover the whole voice duration evenly.
- If background assets are video clips and total clip duration is less than voice duration, the remainder shows black fallback.
- If background video duration exceeds voice duration, the exceeding part is cut off.

Controls:

- Clickable asset card/list: opens Background modal in edit mode.
- For multiple assets, show a compact stacked/list asset presentation consistent with the rest of the UI.
- Easing kind select: `linear`, `ease_in`, `ease_out`.
- Crossfade number input, from 0-2s.
- Motion kind select: `none`, `ken_burns_subtle`, `ken_burns_strong`.
- `Remove background` danger button.

State notes:

- Background spans the full project only for image playlists.
- Video background playlists use their natural sequence duration, then black fallback or trimming as described above.
- Fullscreen foreground hides background while active.

#### Inspector: Foreground Clip

![Inspector with Foreground](../../visuals/editor-inspector-2.png)

Sections:
- Foreground asset.
- Range.
- Motion.
- Transitions.

Fields:
- Asset card.
- Sentence range: from/to sentence indexes.
- Corresponding resolved time range.
- Stretch hint.
- Motion kind: `none`, `ken_burns`, `ken_burns_strong`.
- Easing: `linear`, `ease_in`, `ease_out`.
- Transition in/out: `cut`, `fade`, `slide_left`, `slide_right`.
- `Delete item` with danger color.

#### Inspector: PiP Clip

![Inspector with PiP](../../visuals/editor-inspector-dark.png)

Sections:

- PiP asset.
- Placement.
- Range.
- Motion and transitions.

Fields:

- Asset card.
- 3x3 placement grid: `TL`, `TC`, `TR`, `ML`, `MC`, `MR`, `BL`, `BC`, `BR`.
- Preserve a proper edge margin for every non-center placement. `MC` is centered and does not use edge margin.
- Size range: 15 to 60 percent.
- Radius range: 0 to 32 px.
- Opacity range: 10 to 100 percent.
- Sentence range and corresponding resolved time range.
- Motion kind.
- Transition in/out.
- `Delete PiP item` with danger color.

PiP rules:

- PiP always renders above foreground.
- Multiple PiP clips can be active at the same time only when they are in different layers.
- Canonical PiP placement uses `posX` and `posY` grid coordinates plus offsets. `posX/posY` are confirmed as the canonical field names.

### Assign(Edit) Media to range Modal

![visual effect](../../visuals/AssignModal.png)
![light](../../visuals/AssignModal-light.png)
![scroll-to-bottom](../../visuals/AssignModal-light-1.png)

Purpose: create or edit foreground/PiP assignment.

Open paths:

- `Transcript panel` sentences right-click `Assign media to range...`.
- `Inspector` asset card for foreground/PiP edit mode.

Asset rules:

- Media resources are added only when the user uploads/imports them.
- Do not auto-pick arbitrary files from the project folder; media resources enter the project only through explicit upload/import.
- Supported media badges include image/video types such as `IMG`, `MP4`, `MOV`, `RMVB`, and `FLV`, subject to backend decoder support.

Sections and controls:

1. Asset
   - `Import from disk...`
   - Asset grid cards.
   - Per-card import progress while uploading/importing.
2. Sentence range
   - `From` number input.
   - `To` number input.
   - derived time span tag.
   - duration in seconds.
   - preview list of included sentences.
3. Compositing
   - `Fullscreen`
   - `Picture-in-picture`
4. Layer
   - create new Foreground layer.
   - create new PiP layer. when selectd PiP layer, the `PiP placement` appeared
5. PiP placement, only for PiP layer
   - 3x3 grid.
   - size slider 15-60.
   - radius slider 0-32.
   - opacity slider 10-100.
   - placement preview.
6. Motion and easing.
7. Transition in/out.

Footer:

- `Cancel`.
- Create mode: `Add to project`.
- Edit mode: `Save changes`.

Submit behavior:

- Clamp/reorder sentence range so lower index comes first.
- Resolve start from first sentence start.
- Resolve end from last sentence end.
- Create item in existing layer or create a new layer.
- Store the clip parameters for rendering and next-time editing in the project config.
- Invalidate only the affected clip cache.
- Select the created/edited item.
- Close modal.

Modal states:

- create mode.
- edit mode.
- no media assets.
- selected asset.
- import in progress with percent.
- import failed.
- unsupported file type.
- range reversed.
- range out of bounds.
- missing alignment timestamps.
- PiP controls hidden for fullscreen.
- easing disabled when motion is `none`.
- submit disabled if no valid asset or range.

### Background Modal

![Background Modal with light theme](../../visuals/change-background-light.png)

Purpose: add or change background assets. Full-duration behavior applies only to image backgrounds.

Triggered paths:

- Right rail global video config `Add Background` or `Change Background`, `Add Background` appears when no `Background` layer
- `Background Inspector` asset card. ![multiple assets](../../visuals/editor-inspector-1.png)

Controls:

- Modal title: when triggered by `Add Background` button
- Asset grid with multi-select.
- `Import from disk...`
- Label metadata: number selected and `images only` or `clips only`.
- Motion select: `none`, `ken_burns_subtle`, `ken_burns_strong`.
- Easing select: `linear`, `ease_in`, `ease_out`.
- Crossfade range: 0 to 2 seconds, step 0.1.
- `Cancel`.
- `Add background` or `Save changes`.

Behavior:

- At least one asset must remain selected.
- Background playlist cannot mix images and video clips.
- Selecting an asset of a different kind replaces the selection.
- Multiple image assets are distributed evenly across the whole voice duration.
- Multiple video assets play in selected order.
- If total video duration is shorter than voice duration, remaining time is black fallback.
- If total video duration is longer than voice duration, the excess is cut.
- Existing background updates media, motion, and crossfade.
- Rendering behavior must match Inspector: Background.

States:

- create mode.
- edit mode.
- one asset selected.
- multiple assets selected.
- kind-locked selection.
- will-replace visual state.
- no media.
- import failed.
- invalid crossfade.

### Subtitles Modal

![SubtitleModal with dark](../../visuals/SubtitleModal.png)

Purpose: edit global subtitle style defaults.

Open paths:

- Right rail global video config `Subtitles`.

Controls:

- Background select: `none`, `pill`, `block`, `shadow`.
- Position select: `bottom`, `bottom_low`, `top`.
- Font select.
- Max chars per line number input: 20 to 80.
- Size range: 28 to 72.
- Burn-in switch.
- Live preview using the same resolution/aspect setting as Preview Surface.
- `Cancel`.
- `Apply`.

Behavior:

- `Apply` saves global subtitle settings(apply to all subtitles) and closes.
- `Cancel` closes without saving.

States:

- burn-in on/off.
- background style none/pill/block/shadow.
- top/bottom positioning.
- long cue overflow.
- no alignment cues.

### Media And Layer Model

Media asset fields required by project config:

- `id`
- `name`
- `kind`: image or video
- `path`
- `thumb_path`
- width
- height
- duration for video
- file size
- content hash
- import mode: copied or referenced
- created/imported timestamp

Layer kinds:

- `sub`: subtitle clips, top visual layer.
- `pip`: picture-in-picture overlays above foreground.
- `fg`: fullscreen foreground replacements above background.
- `bg`: background visuals above black fallback.

Visual item fields: checkout `project.schema.json`

- `id`
- `mediaId` or `mediaIds` where playlist semantics apply.
- `sentences`: inclusive sentence range `[from, to]`.
- `start`: resolved seconds.
- `end`: resolved seconds.
- `motion`.
- `transitions`.
- `pip` placement for PiP only.
- cache status.
- orphan status.

Layer rules:

- Subtitle layer always exists when alignment/subtitles exist.
- Background is optional.
- Foreground and PiP layers are created as needed based on overlap rules.
- Empty foreground/PiP layers are automatically removed.
- Timeline visual order is bottom-to-top: background, foreground, PiP, subtitles.
- Render order is black fallback -> background -> foreground -> PiP -> subtitles -> watermark.

## API Surface Required By Prototype

Editor:

- `GET /projects/:projectId/config` 
- `PUT /projects/:projectId/config` update config partially. including foreground, PIP, background, transcript, watermark, resolution, subtitles style
- `POST /uploads` ![reference](SPEC_BACKEND_GLOBAL.md#api-surface-global)
- `POST /projects/:projectId/render?preset=draft|final&resolution=1920x1080|1280x720|1080x1920` returns a `render_id`; frontend navigates to `/render/:projectId/:render_id` only when request succeeds.

## Edge Cases And Boundary Conditions

Transcript and sentence assignments:

- Range `from > to` should reorder or reject consistently.
- Range below `1` or above sentence count is clamped or rejected.
- Sentence anchor disappears after transcript edit: item becomes orphaned and red, not silently deleted.
- Manual timeline stretch preserves sentence anchor.
- Search no results.
- Search in different language input.
- Merge/concatenate sentences updates subtitle timing and clip anchors predictably.

Media:

- Import duplicate file.
- Import same filename with different content.
- Import huge video. (split to multiple chunks uploading)
- Import image too small for output.
- Import corrupt image/video.
- Import referenced file that later disappears.
- Image/video mixed in BG playlist is blocked or replaces selection.
- Thumbnail generation fails.

Layers and clips:

- No background.
- No foreground.
- No PiP.
- No subtitles.
- No watermark.
- Delete background.
- Delete selected foreground/PiP item.
- Delete last item in FG/PiP layer: remove layer.
- Delete subtitles must not be allowed globally; individual subtitle clip timing/style edits are allowed where specified.
- Same-layer foreground/PiP overlap should auto-place on a different layer or surface a validation state.
- PiP offscreen due invalid position.
- Minimum clip duration.
- Clip end before start.
- Clip starts before zero or after duration.
- Clip extends beyond voice duration.
- Unsaved browser draft on navigation.
- Undo/redo after delete/move/stretch.

## Testing Strategy

Shared fixtures:

- `test01` ([../../projects/test01](../../projects/test01)) is the canonical E2E/integration fixture with voice, transcript, mixed media, and a project config that exercises every layer type.

### Frontend unit/component tests (Vitest + Testing Library)

Editor toolbar:

- Left Back/Home icon button navigates to Launcher; project title renders and stays in sync with canonical config.
- Save state renders the correct label: `pending / saving / saved / failed`.
- Render state renders the correct label: `queued / running / disabled because no unrendered changes`.
- `Draft render` / `Final render` enable rules hold: enabled for a newly unrendered project even with no foreground/background/PiP; for an already-rendered or actively running project, enabled only when the current config hash differs from the latest successful render config hash; otherwise disabled.
- Clicking `Draft render` explicitly saves/syncs the current config, shows the draft render strip, and disables the button until draft rendering is finished.
- Clicking `Final render` explicitly saves/syncs the current config, queues the render, and navigates to `/render/:projectId/:render_id`.

Editor draft render strip:

- Appears below the toolbar when a draft render is active, queued, failed, cancelled, or recently completed.
- Renders the `progressbar` element with the correct `aria-valuenow`, fill percentage, label (`queued / rendering draft / draft ready / failed / cancelled`), stage label, and percentage text.
- Stage label cycles through: queued -> verifying cache -> pre-rendering clips -> building `subtitles.srt` -> ffmpeg compose -> muxing audio -> done.

Editor transcript pane:

- Each sentence derived from `<project>/subtitles.srt` renders as a row with sentence index, start/end timecode, and text.
- Clicking a sentence row selects it, seeks the playhead to the sentence start timestamp, and syncs preview/timeline state.
- Shift-click selects a contiguous sentence range.
- Right-click opens the transcript context menu.
- Search highlights matched rows; "no results" renders a clear empty state.
- Merge/concatenate sentences updates subtitle timing and dependent clip anchors.

Editor preview surface:

- Buttons render: `Previous` (play from previous sentence), `Play / Pause`, `Next` (play from next sentence).
- Resolution segmented control offers `1080p` (1920x1080, 16:9), `720p` (1280x720, 16:9), `9:16` (1080x1920 vertical); selecting one updates preview aspect and persists to canonical config.
- `Layers - N` button opens the Layers Popover.
- Preview surface renders every documented state: no background; background only; no foreground; foreground active over background; no PiP overlays; one or more active PiP overlays; subtitles off; subtitles visible; watermark off; watermark visible; playing; paused.

Editor Layers Popover:

- Opens by clicking `Layers - N`; closes on outside click.
- Header reads `Layer order - top renders on top`.
- Rows appear in render order; each row shows kind dot + layer name + item count + trash button for removable bg/fg/PiP layers.
- Clicking a row selects the first item in that layer and closes the popover.
- Clicking background trash removes the background layer and keeps every other layer.
- Subtitle layer is non-removable while alignment/subtitles exist.

Editor timeline:

- Drag left grip resizes start; drag right grip resizes end; drag body moves both endpoints together.
- Drag/stretch is supported for every visible clip kind: background, foreground, PiP, and subtitle clips.
- During drag/stretch, current time/selection state syncs with the sentence row in the transcript pane.
- Clip `x` and `Backspace`/`Delete` shortcuts delete a selected non-background clip; background layer cannot be deleted via timeline.
- Resize/move constraints: `start >= 0`; `end <= voice/project duration`; minimum duration `>= 0.5 s`; resizing recalculates covered sentence range from the updated time span.
- Track visual order is bottom-to-top: background, foreground, PiP, subtitles.
- Foreground clips that overlap in time sit on different foreground layers; non-overlapping foreground clips may share a layer. Same rule for PiP layers. Empty foreground/PiP layers are automatically removed.

Editor inspector and global video config:

- Inspector has no "no selection" state: on entering the Editor, the background layer is selected by default.
- Inspector states Background selected, Foreground selected, and PiP selected render the documented sections and fields.
- Global config controls in the right rail: `Watermark`, `Subtitles` (opens Subtitles Modal), `Add Background` / `Change Background` (opens Background Modal).
- Foreground inspector fields render and update: asset card, sentence range + resolved time range, stretch hint, motion (`none / ken_burns / ken_burns_strong`), easing (`linear / ease_in / ease_out`), transition in/out (`cut / fade / slide_left / slide_right`), and `Delete item`.
- PiP inspector fields render and update: asset card, 3x3 placement grid (`TL TC TR ML MC MR BL BC BR`), size 15-60%, radius 0-32 px, opacity 10-100%, sentence + time range, motion, transition in/out, and `Delete PiP item`.
- Background inspector renders the clickable asset card/list, easing select, crossfade input 0-2 s, motion select (`none / ken_burns_subtle / ken_burns_strong`), and `Remove background`.
- Editing any property marks the project dirty and writes browser autosave recovery state; explicit `Save`, `Draft render`, and `Final render` sync current config to SQLite.

Editor modals:

- Assign/Edit Media to Range Modal covers sentence range + resolved time range, stretch hint, motion, easing, transition in/out.
- Assign/Edit submit is disabled if no valid asset or range; reversed range and out-of-bounds range are rejected with clear error; PiP-only controls are hidden for fullscreen; easing is disabled when motion is `none`.
- Background Modal enforces image-only OR video-only playlist. Image set covers the whole voice duration evenly; video set shorter than voice duration shows black fallback for the remainder; video set longer than voice duration is truncated.
- Background Modal covers crossfade 0-2 s, motion (`none / ken_burns_subtle / ken_burns_strong`), easing (`linear / ease_in / ease_out`), and `Remove background`.
- Subtitles Modal covers background select (`none / pill / block / shadow`), position select (`bottom / bottom_low / top`), font select, max chars per line 20-80, size 28-72, and burn-in switch.
- Subtitles Modal live preview uses the same resolution/aspect as the Preview Surface.

Editor undo / redo / content hash:

- Every undoable edit appends exactly one entry to the operation log.
- Undo pops the last op; redo replays it; both paths reach byte-identical `config_json`.
- Content hash is derived from `project.config`; it changes if and only if a persisted property changes.
- A no-op edit does not change the hash.
- Sentence anchors stay stable across voice re-records; anchors that no longer map to a sentence are marked orphan (red) and never silently deleted.

### Backend tests (pytest)

Editor API surface:

- `GET /projects/:projectId/config` returns canonical config validated by shared schema.
- `PUT /projects/:projectId/config` partially updates foreground, PiP, background, transcript, watermark, resolution, and subtitle-style config.
- `POST /uploads` imports rendering assets and returns a `mediaId`.

`pipeline/clip_render.py`:

- Each foreground clip produces one cached output in `.vc/clips/`.
- Cache key includes media content hash, duration, motion, transitions, resolution, and fps; changing any single component invalidates only that clip.
- Background and PiP layers respect the same cache rules.

`pipeline/subtitles.py`:

- `subtitles.srt` lives at `<project>/subtitles.srt` as the user-visible subtitle file.
- Explicit `Save` updates `project_configs` only; it does not rewrite `<project>/subtitles.srt`.
- `subtitles.srt` is regenerated from latest saved config when `Render Draft` or `Render Final` is queued.
- Cue start/end equal alignment timestamps within 1 ms.
- Subtitle style controls (background, position, font, max chars, size, burn-in) are honored when rendering.

`pipeline/filtergraph.py`:

- Generated filter chain order is black fallback -> background -> foreground -> PiP -> subtitles -> watermark.
- Each configured transition produces the matching ffmpeg filter expression with the chosen easing.
- Output resolution and aspect flags reflect the requested preset: `1080p` 1920x1080, `720p` 1280x720, `9:16` 1080x1920.

### E2E / browser tests (Playwright)

- **Re-open and resume.** Close the app -> relaunch -> open the same project from Launcher recents -> editor restores selection (default = background), layer assignments, scroll position, undo stack, and selected resolution preset from SQLite + browser storage.
- **Crash recovery.** Make several edits -> kill the process abruptly -> relaunch -> operation-log replay reproduces the live session's final state without prompting.
- **Cache invalidation.** Render once -> replace a single media file or change a clip motion/transition -> re-render -> only affected `.vc/clips/` entries are rebuilt by mtime; unaffected clips are reused.
- **Re-record voice.** Replace `voice.wav` -> re-run Subtitle Generate and Subtitle Alignment -> sentence-to-clip assignments survive; resolved timestamps shift to match the new voice; anchors that no longer map to a sentence become orphan (red), never silently deleted.
- **Editor route guard.** `/editor/:invalid` redirects to Launcher.

### Visual parity tests

- Every Editor screenshot embedded in this spec has exactly one parity test.
- Covered states include default editor, draft render strip states, transcript selection/context menu/merge, preview/layers popover, timeline states, inspector states, Assign/Edit modal, Background modal, Subtitles modal, and dark/light variants.

### Verification commands

```bash
pnpm test
pnpm lint
pnpm -F @vc/web test
pnpm -F @vc/server test
```

## Success Criteria

Phase 1 Editor work is accepted when all items below hold.

### Functional Acceptance

- On entering the Editor, the background layer is selected by default; there is no "no selection" state.
- Every sentence derived from `<project>/subtitles.srt` is represented as a row with sentence index, start/end timecode, and text.
- All four layer kinds are editable as documented: background, foreground, PiP, subtitles.
- Render order is `black fallback -> background -> foreground -> PiP -> subtitles -> watermark`.
- Timeline visual order is the inverse bottom-to-top order.
- Inspector exposes per-clip properties: asset card, ranges, motion, easing, transitions; PiP additionally exposes 3x3 placement, size, radius, and opacity.
- Inspector exposes global config controls: Watermark, Subtitles modal, Add/Change Background modal.
- Preview Surface exposes `Previous / Play-Pause / Next`, the `1080p / 720p / 9:16` resolution segmented control, and the `Layers - N` popover.
- Every undoable edit is reversible through the operation log.
- Redo restores byte-identical `config_json`.
- Equivalent edits preserve the content hash.
- Sentence anchors stay stable across voice re-records.
- Orphan anchors are marked red and never silently deleted.
- Editor Toolbar reflects save (`pending / saving / saved / failed`), cache (`warm / cold / partial / invalid`), and render (`queued / running / disabled`) states correctly.
- Draft Render Strip surfaces queued / rendering / draft-ready / failed / cancelled drafts with documented stages.
- Closing and reopening the app restores editor state exactly: selection (default background), scroll, layer assignments, undo stack, and selected preset.
- Killing the process mid-edit and relaunching loses no committed operation-log entries.

### Performance Targets

| Surface | Target |
| --- | --- |
| Cached-clip re-render after a single property edit | <= 0.2x voice duration |
| Filter-chain build for 50 layers | <= 50 ms |
| Undo/redo replay across a 1000-op log | <= 100 ms per op |
| Editor route first paint (warm dev server) | <= 1.5 s |
| Sentence-chip render at 500 chips | >= 60 fps (<= 16 ms/frame) |
| Timeline drag at 100 clips | >= 60 fps (<= 16 ms/frame) |

### Quality Gates

- Operation-log replay reaches the same end state as the live session for the same op sequence.
- Content hash changes if and only if a persisted property changes.
- Cache invalidation is precise: editing one clip rebuilds only its `.vc/clips/` entry; unaffected clips are reused.
- Sentence anchors survive voice re-records; orphan anchors are visibly marked, never silently deleted.
- Transcript/sentence assignment edge cases have matching tests: range `from > to`, range below 1 or above sentence count, disappearing sentence anchors, manual timeline stretch, search no results, search in different language input, and merge/concatenate sentence behavior.
- Media edge cases have matching tests: duplicate file import, same filename with different content, huge video import, too-small image, corrupt image/video, missing referenced file, mixed image/video background playlist, and thumbnail generation failure.
- Layer/clip edge cases have matching tests: no background, no foreground, no PiP, no subtitles, no watermark, delete background, delete selected foreground/PiP item, delete last item in fg/PiP layer, blocked global subtitle deletion, same-layer overlap handling, invalid/offscreen PiP position, minimum clip duration, end before start, start outside duration, clip beyond voice duration, unsaved browser draft on navigation, undo/redo after delete/move/stretch.
- User-triggered Editor failures surface non-blocking, recoverable errors with a clear next action.
- Editor visual parity coverage exists for every embedded screenshot, modal, interaction state, and dark/light variant.
