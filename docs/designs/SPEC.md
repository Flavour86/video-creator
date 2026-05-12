# Spec: Video Creator Prototype Product Map And Persistence Design

## Source

This spec is derived from `docs/prototype/Video Creator.html`, cross-checked against the preserved prototype source in `docs/prototype/v1/`(you can start a server and access it on browser), and the current shared schema/database files.

Reference files reviewed:

- `docs/prototype/v1/app.jsx`
- `docs/prototype/v1/components.jsx`
- `docs/prototype/v1/data.jsx`
- `docs/prototype/v1/screens/launcher.jsx`
- `docs/prototype/v1/screens/setup.jsx`
- `docs/prototype/v1/screens/editor.jsx`
- `docs/prototype/v1/screens/assign-modal.jsx`
- `docs/prototype/v1/screens/bg-modal.jsx`
- `docs/prototype/v1/screens/inspector.jsx`
- `docs/prototype/v1/screens/render.jsx`
- `docs/prototype/v1/screens/subtitles-modal.jsx`
- `docs/prototype/v1/screens/tokens.jsx`
- `docs/prototype/v1/tweaks-panel.jsx`
- `packages/shared-schemas/project.schema.json`
- `apps/server/server/db/app_db.py`
- `apps/server/server/db/projects.py`
- `apps/server/server/db/renders.py`
- `docs/designs/PHASE_1_DESIGN.md`

## Objective

Build a local-first video creation app where the transcript/subtitle timing is the editing surface. The user selects a project folder, provides voice and transcript files, optionally sets a watermark, runs alignment to generate `subtitles.srt`, assigns uploaded media to sentence ranges, previews the layered timeline, and renders queued draft/final MP4 outputs.

Target users:

- Solo video creators producing narrated videos from a written script.
- Users who already have voice-over, transcript, images, and clips.
- Users who need fast local iteration without cloud cost in Phase 1.

Success means the implemented UI exposes every required workflow in the prototype, persists project config in SQLite, can reopen existing projects, can recover browser-side edit history, and can render current-project outputs reliably.

## Tech Stack

- Frontend: Next.js 15, React 19, TypeScript, App Router.
- UI state: Zustand and focused hooks under `apps/web/lib`.
- Client persistence: browser storage for UI preferences, draft editing state, and incremental undo/redo operations.
- Styling: Tailwind CSS using existing design tokens and shared primitives. Do not copy prototype CSS directly.
- Backend: FastAPI, Python 3.11.
- Canonical project config: SQLite `project_configs.config_json`, validated by shared schema.
- User-visible project files: selected project folder.
- Cache and generated internal artifacts: `<project>/.vc/`.
- User-visible subtitles: `<project>/subtitles.srt`.
- Global app database: SQLite at `%APPDATA%/videocreator/app.db` on Windows, `~/.videocreator/app.db` on Unix.
- Render engine: ffmpeg.
- Alignment/subtitles: WhisperX reference-text alignment plus SRT generation adjusted to the transcript content.

## Commands

```bash
pnpm install
pnpm dev
pnpm launch
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm gen:types
pnpm gen:py
pnpm -F @vc/web test
pnpm -F @vc/web lint
pnpm -F @vc/server test
pnpm -F @vc/server lint
```

Required local tools:

- Node 22+
- pnpm 10+
- Python 3.11
- ffmpeg 6+ with libx264, libass, libfreetype

## Project Structure

```text
apps/web/app/                  Next.js routes: launcher/home, editor, render
apps/web/components/           Reusable UI components and screen components
apps/web/lib/                  Hooks, API clients, formatters, state helpers
apps/web/styles/               Token-based global styles
apps/server/server/routes/     FastAPI routes
apps/server/server/db/         SQLite access for app/project/render state
apps/server/server/domain/     Project and timing domain logic
apps/server/server/pipeline/   alignment, cache, filtergraph, render, subtitles
packages/shared-schemas/       JSON schema source and generated TS/Python models
docs/prototype/                Prototype source and bundled HTML
docs/designs/                  Architecture and UI specs
```

Per-project folder:

```text
<project>/
  voice.wav
  transcript.txt
  subtitles.srt
  media/
  renders/
  .vc/
    alignment.json
    alignment.hash
    thumbs/
    clips/
    drafts/
    logs/
```

## Code Style

Follow `patterns.md` and `instruction.md`.

Example style for state mutations:

```ts
type LayerPatch = {
  layerId: string;
  itemId: string;
  patch: Partial<VisualItem>;
};

export function patchLayerItem(project: ProjectConfig, input: LayerPatch): ProjectConfig {
  return {
    ...project,
    layers: project.layers.map((layer) =>
      layer.id !== input.layerId
        ? layer
        : {
            ...layer,
            items: layer.items.map((item) =>
              item.id === input.itemId ? { ...item, ...input.patch } : item,
            ),
          },
    ),
  };
}
```

Conventions:

- Use generated shared schema types. Never hand-edit generated TS/Python files.
- Keep formatters centralized: timecode, range labels, file sizes, ETA, render specs.
- Keep UI copy in i18n files.
- Use shared primitives for buttons, icon buttons, segmented controls, forms, tags, panels, modals, and layer chips.
- Use parameterized SQL only.

## Top-Level Pages

User-facing pages:

| Page | Route intent | Purpose |
| --- | --- | --- |
| Launcher | `/` | Home page, recent projects, new-project folder selection, and setup subflow |
| Editor | `/editor/:projectId` | Main transcript/subtitle-anchored editing surface |
| Render | `/render/:projectId` | Current project's render queue, progress, log, output, and history |

Non-user-facing/deferred:

- Tokens is not part of Phase 1 user UI. Keep it only as a dev-only design audit page if useful.
- Setup is not a visible top-level navigation destination. It is the new-project flow inside Launcher.
- Render only shows the current project's render information, queue, output, and history.

Routing rules:

- The app has no visible navigation bar with Launcher/Setup/Editor/Render/Tokens buttons.
- Launcher is always reachable as home.
- `New project` opens a native folder picker first; the Setup subflow starts only after a folder is selected.
- Setup collects voice, transcript, optional watermark, and then runs alignment.
- `Continue to Editor` is enabled only after alignment succeeds.
- Editor requires a valid `project_id`; without it, redirect to Launcher.
- Render requires a valid `project_id` and `render_id`; without it, redirect to Launcher.
- For a new project, Render is available immediately after alignment succeeds, even if no foreground or background exists.
- For an already-rendered project, Render is enabled only when the current config has unrendered changes.
- The Tokens page is not part of the product UI, but token-based design-system implementation is still required.

## App Shell Components

### Topbar
### Visual Truth
![dark](visuals/shell-dark.png)
![light](visuals/shell-light.png)

#### Left: Logo and Application title
Intereaction:
 - click the `logo and Application title` locate to `Launcher` Page

#### Right: Theme And Language

Controls may exist in settings/dev surfaces, but not as a persistent top nav:

- Theme toggle: dark/light.
- Language toggle: English/Chinese.

Browser storage owns UI preferences:

- `theme`
- `language`

### Bottom
#### left command pill
#### right prototype/version badge

## Launcher Page(Home page)
Purpose: show recent projects and start a new project. It does not include a separate `Open folder` action, runtime card, tips card, or create-another card.

### main interface
#### Visual Truth
![dark](visuals/Launcher-dark.png)
![light](visuals/Launcher-light.png)

#### Primary layout:
Header
- left side filled with `Recent projects` title, and the `Local workspace` at top of title .
- right side is `New project` button.

Body:
- Recent project list.

#### Interaction detail
1. Buttons:

- `New project`: opens a native folder picker; Only after the user selects a folder, start the Setup subflow.
- Project card: opens Editor for that project.

2. Project card fields:

- thumbnail.
- project name.
- voice duration.
- sentence count.
- media count.
- last opened.
- alignment/render status tag.

3. Thumbnail rules:

- Prefer the first frame of the latest successful rendered video.
- If no rendered video exists, generate a deterministic placeholder image when the project is created: three random colors divided evenly. Store or cache the generated thumbnail path.
- Click the thumbnail's play icon, open a modal to display the rendered video, check ![dark effect](visuals/Launcher-play-dark.png) and ![light effect](visuals/Launcher-play-light.png)

Launcher states:

- No recent projects.
- Project folder missing on disk.(don't show it)
- Project config missing/corrupt in database.
- tag status: `aligned`, `queued`, `running`, `rendered`, `error`.
- Folder picker cancelled.(nothing happened)
- Folder permission denied.

### Setup Subflow

#### Visual Truth
![dark](visuals/Setup-dark.png)
![light](visuals/Setup-light.png)

Purpose: create and align a new project after the user selects a folder from Launcher.

#### Primary layout:

Header:
- left: `New project` eyebrow with `SetUp` title below.
- right: `Cancel` and `Continue to Editor` button

Body:
- left: set up progess: `Folder`, `Voice + transcript` provided, `Alignment` ready
- center: Project name input, Output resolution/preset controls, Inputs: Voice, transcript and watermark input area
- right: Alignment status/action area


#### Interaction:
Header:
- right: `Cancel`: returns to Launcher, `Continue to Editor`: enabled only when alignment succeeds, click it go to `Editor` page

Body:
left: 
  - It reflect which step of setup the new project is on, the folder always selected, because without, it's impossible to get into `Setup` interface, `Voice + transcript` checked when the `Voice` and `transcript` provided by user, `Alignment` is ready only when the `Alignment` is successful\
center: 
  - Project name is the name of folder selected. Output Preset: 720p(Draft quality), 1080p(Final quality), 1080p/vertical(9:16). 
  - Inputs: Voice and transcript are provided by user. Watermark is optional.

right(Alignment):
  - Show Alignment status only: pending, running, succeeded, failed
  - description below the `Alignment` title, when `Alignment status` is running show `Calling the local alignment API and waiting for sentence timestamps.`, when `Alignment status` is done, show `Sentence timestamps are ready. Entering the editor is allowed only after this succeeds.`, otherwise `Run alignment before entering the editor.` 
  - `Forced alignment` panel, show data of `sentences`, `duration` when `Alignment status` is succeeded，otherwise show `--`\
  - `Run alignment` Button, click it, make a request, only when runs alignment and writes `<project>/subtitles.srt` successfully then creates the project row/config in SQLite, otherwise never create a new project
  - `Transcript readable / {length or '--'} sentences`
  - `Audio stream valid / pcm_s16le / 48kHz`
Setup states:

- Folder selected.
- Voice manually selected.
- Voice missing.
- Voice invalid.
- Transcript manually selected.
- Transcript missing.
- Transcript empty/invalid.
- Watermark absent or selected.
- Alignment pending/running/aligned/failed.
- Permission denied.

## Editor Page

### Visual Truth
![dark](visuals/editor-dark.png)
![light](visuals/editor-light.png)

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
- `Render Draft`: 
  1. Click: Show the `Draft Render Strip` and percentage of the progess in the `ender Draft` button, and then queue to render the draft of video,
  2. Disabled: when draft render is active, queued
- `Render Final`: 
  1. Enabled: 
    a. New aligned project: Draft/Final render is enabled even without any foreground/background/PIP. 
    b. Already-rendered or in-running project: Draft/Final render is enabled only when the current config hash differs from the latest successful rendered config hash. 
  2. Click: Get in to `Render` page, and queue to render video

`Editor Toolbar` states:

- Save pending, saving, saved, failed.
- Cache warm, cold, partial, invalid.
- Render disabled because no unrendered changes on already-rendered project.
- Render queued/running.

### Draft Render Strip

#### Visual Truth
![dark](visuals/editor-draft-render-strip-dark.png)
![light](visuals/editor-draft-render-strip-light.png)

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
- Shift-click sentence: select contiguous sentence range. Check visual ![selected multiple](visuals/editor-transcript-1.png)
- Right-click sentence: open context menu. Check visual ![show menus](visuals/editor-transcript-2.png)
- Current sentence is highlighted by playhead time.
- Search filters transcript and scrolls to the first matched element.
- Shortcuts: `Enter` or `Down arrow` in search advances to the next match, Escape clears transcript search
- Concatenate/merge sentences in the Transcript Panel, not in the Subtitles modal, check visual ![merge](visuals/editor-transcript-3.png). This updates the subtitle/sentence model and dependent clip anchors. 

Sentence states:

- normal.
- selected.
- selection first.
- selection last.
- current/now.
- search match with highlighted border.

#### Transcript Context Menu

#### Visual Truth
Check visual ![show menus](visuals/editor-transcript-3.png)

Opened at pointer position.

Buttons:

- `Assign media to range...`: opens Assign modal with `from=to=clicked sentence`.
- `Merge <N> sentences`: merge multiple sentences
- `Play from here`: selects sentence and seeks to its start.

### Preview Surface

#### Visual Truth
![dark](docs/designs/visuals/editor-preview-dark.png)
![light](docs/designs/visuals/editor-preview-light.png)

#### Layout:

- Preview stage with active aspect ratio. ![9：16](visuals/editor-preview-1.png)
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
- `Layers - N`: opens the `Layers Popover`. check visual ![layers popover](visuals/editor-preview-popover.png)

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
![layers popover](visuals/editor-preview-popover.png)

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
![dark](docs/designs/visuals/editor-timeline-dark.png)
![light](docs/designs/visuals/editor-timeline-light.png)

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

![dark](visuals/editor-inspector-dark.png)
![light](visuals/editor-inspector-light.png)

The right rail starts with global video config controls, then the contextual Inspector.

Global video config controls:

- `Watermark`: configure optional watermark.
- `Subtitles`: opens Subtitles modal for global subtitle defaults.
- `Add` or `Change` Background: opens `Change background`

Inspector states:

- No selection: There is no way no clip selected, because once user get in, the default clip the background layer.
- Subtitle clip selected.
- Background selected.
- Foreground selected.
- PiP selected.

#### Inspector: Subtitle Clip [x]

When a subtitle clip is selected, show parameters for that subtitle clip's style and a text button to apply that style to all subtitles.

Fields:

- cue text/time metadata.
- Burn-in segmented control: `On`, `Off`.
- Font select.
- Size number input.
- Position segmented control.
- Background style.
- `Apply to all subtitles` text button.

#### Inspector: Background Clip

![Inspector with Background](visuals/editor-inspector-1.png)

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

![Inspector with Foreground](visuals/editor-inspector-2.png)

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

![Inspector with PiP](visuals/editor-inspector-dark.png)

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

![visual effect](visuals/AssignModal.png)
![light](visuals/AssignModal-light.png)
![scroll-to-bottom](visuals/AssignModal-light-1.png)

Purpose: create or edit foreground/PiP assignment.

Open paths:

- `Transcript panel` sentences right-click `Assign media to range...`.
- `Inspector` asset card for foreground/PiP edit mode.

Asset rules:

- Media resources are added only when the user uploads/imports them.
- Do not auto-pick arbitrary files from the folder selected by Launcher `New project`.
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

![Background Modal with light theme](visuals/change-background-light.png)

Purpose: add or change background assets. Full-duration behavior applies only to image backgrounds.

Triggered paths:

- Right rail global video config `Add Background` or `Change Background`, `Add Background` appears when no `Background` layer
- `Background Inspector` asset card. ![multiple assets](visuals/editor-inspector-1.png)

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

![SubtitleModal with dark](visuals/SubtitleModal.png)

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

## Render Page

### Visual Truth
![dark](visuals/render-dark.png)
![light](visuals/render-light.png)

Purpose: show only the current project's render queue, active render progress, ffmpeg log, output specs, history, and post-render actions.

### Primary layout:

- Header.
- Current project render progress card.
- Render history.(Current project)
- Output panel.
- After render actions.

Header:

- Eyebrow `Render`.
- Title: project title plus resolution, for example `Tokyo Essay - 1080p final render`.
- `Back to editor`.
- `Cancel render`: cancels a queued task or directly cancels the active rendering process.

Render card:

- Data updates live.
- Output filename(with extension `.mp4`).
- Specs string.
- Status tag.
- Big progress bar.
- Stats:
  - percent complete.
  - encode speed.
  - ETA.
  - frames written.
- Stages:
  1. queued
  2. verify alignment cache
  3. pre-render cached clips
  4. build `subtitles.srt`
  5. compose filtergraph
  6. mux MP4 with `+faststart`
  7. append render history to app.db

Output panel fields:

- project name.
- resolution.
- framerate.
- video codec, CRF, preset.
- audio codec, bitrate, sample rate.
- actual size as accurately as possible from the output file on disk.

Render history row fields:

- icon.
- filename.
- resolution or preset.
- duration.
- status.

After render buttons:

- `Reveal in Explorer` only if the web app can invoke the host OS file manager through the backend. If not supported, remove this button.
- `Play locally`.

### Render states:

- idle/no active job.
- queued.
- verifying cache.
- pre-rendering clips.
- building subtitles.
- composing.
- muxing.
- logging history.
- done.
- cancelling.
- cancelled.
- failed.
- output missing.
- partial output excluded.
- ffmpeg warning.
- ffmpeg fatal error.
- history empty.

Cancel behavior:

- Ask for confirmation if a render is active and cancellation should remove the partial file.
- Send one cancel request.
- Move active render to cancelling/cancelled.
- Remove partial file gets `.partial`.
- record the Cancel action for Render history

## Keyboard Shortcuts

Shortcut boundary:

- Shortcuts must not fire while typing in input, textarea, select, or contenteditable unless the shortcut is explicitly for that control.

## Persistence Model

### Canonical Project Config

Canonical project config is stored in SQLite `project_configs`, not in `<project>/project.json`.

The config JSON should include:

- project metadata.
- audio path.
- transcript path.
- output settings.
- media library.
- ordered layers.
- subtitle settings.
- watermark settings.

Future AI and character fields are not decided and should not be added to the Phase 1 canonical schema yet.

Schema decisions:

- Add canonical `media[]` to the project config schema.
- Add background playlist support through `mediaIds` or an explicit background playlist object; the exact shape is flexible as long as multiple assets are supported.
- Canonical PiP placement uses `posX`, `posY`.
- Output settings should include full resolution/fps/codec fields, not just preset.

### User-Visible Project Files

`<project>/voice.wav`:

- copied or selected voice file.

`<project>/transcript.txt`:

- copied or selected transcript file.

`<project>/subtitles.srt`:

- generated from alignment and adjusted to transcript content.
- user-visible and directly reusable outside the app.

`<project>/media/`:

- user-uploaded/imported media only.
- do not auto-import random folder contents.

`<project>/renders/`:

- final user-facing render outputs.

### Internal Cache Files

`.vc/alignment.json`:

- alignment metadata.
- sentence timestamps.
- word timestamps.
- confidence.

`.vc/clips/`:

- primary reusable pre-rendered clip cache.
- cache key includes media content hash, duration, motion, transitions, resolution, fps.

`.vc/drafts/`:

- draft MP4 outputs.

`.vc/logs/`:

- ffmpeg logs and render job logs.

## SQLite Design

Initialization requirements:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
```

### `schema_migrations`

Tracks database version.

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `projects`
SQLite has no built-in `uuid()` function, so `project_id` should be generated by the application. If a DB-side fallback is needed, use `lower(hex(randomblob(16)))`.

```sql
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  voice_duration_s REAL,
  sentence_count INTEGER NOT NULL DEFAULT 0 CHECK (sentence_count >= 0),
  media_count INTEGER NOT NULL DEFAULT 0 CHECK (media_count >= 0),
  alignment_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (alignment_state IN ('aligned', 'pending', 'missing', 'failed')),
  thumbnail_path TEXT,
  palette_seed TEXT NOT NULL DEFAULT 'night',
  project_mtime TEXT,
  exists_on_disk INTEGER NOT NULL DEFAULT 1 CHECK (exists_on_disk IN (0, 1)),
  current_config_hash TEXT,
  last_rendered_config_hash TEXT,
  has_unrendered_changes INTEGER NOT NULL DEFAULT 1 CHECK (has_unrendered_changes IN (0, 1)),
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_last_opened
  ON projects(last_opened_at DESC);
```

### `project_configs`

Stores canonical project editing config.

```sql
CREATE TABLE IF NOT EXISTS project_configs (
  project_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);
```

Rules:

- `config_json` must validate against the shared project config schema before save.
- `config_hash` is used to detect unrendered changes.
- Saving a config updates `projects.current_config_hash`.
- Successful render updates `projects.last_rendered_config_hash` and clears `has_unrendered_changes`.

### `app_settings`

Stores backend-level defaults only. UI preferences live in browser storage.

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Allowed Phase 1 keys:

- `default_output_preset`

Do not store these in SQLite:

- `theme`
- `language`
- `show_statusbar`
- `last_project_path`
- `render_history_filter`

Explanation:

- `last_project_path` is unnecessary because `projects.last_opened_at` gives the latest project.
- `render_history_filter` and `history_include_partial` are UI preferences; if needed, keep them in browser storage.

### `runtime_checks`

Do not add a `runtime_checks` table in Phase 1. Runtime checks should come from live backend health endpoints, not a persisted cache.

### `render_history`

Persists current-project render history.

```sql
CREATE TABLE IF NOT EXISTS render_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  output_path TEXT NOT NULL,
  video_url TEXT,
  preset TEXT NOT NULL CHECK (preset IN ('draft', 'final')),
  resolution TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  status TEXT NOT NULL
    CHECK (status IN ('queued', 'running', 'done', 'error', 'cancelled')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_s REAL CHECK (duration_s IS NULL OR duration_s >= 0),
  fps REAL CHECK (fps IS NULL OR fps > 0),
  video_codec TEXT,
  video_crf INTEGER,
  video_preset TEXT,
  audio_codec TEXT,
  audio_bitrate_kbps INTEGER,
  audio_sample_rate INTEGER,
  pixel_format TEXT,
  color_space TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  speed REAL,
  frame_count INTEGER CHECK (frame_count IS NULL OR frame_count >= 0),
  config_hash TEXT,
  message TEXT,
  excluded INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_render_history_project_started
  ON render_history(project_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_history_status
  ON render_history(status);
```

Notes:

- `project_id` is a foreign key to `projects`.
- `vertical` is not a `preset`; 9:16 is represented by `resolution='1080x1920'`, `width=1080`, `height=1920`.
- `video_url` is used when the generated video can be played from Launcher/Editor/Render through a backend-served URL.
- When a project is deleted/pruned from `projects`, render history is pruned by cascade.

### `render_artifacts`

Stores generated files associated with a render. It does not store source assets such as PiP/background/foreground media.

Use cases:

- Find the final/draft MP4 for a render.
- Find a cancelled partial MP4.
- Reopen ffmpeg logs.
- Reopen the exact filtergraph script used.
- Reuse generated companion files if the same render/config hash is still valid.
- Generate/use a thumbnail for Launcher.

Primary reusable clip caching still belongs in `.vc/clips/`, not this table.

```sql
CREATE TABLE IF NOT EXISTS render_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  render_id TEXT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('output', 'partial', 'log', 'graph', 'subtitles', 'thumbnail')),
  path TEXT NOT NULL,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (render_id) REFERENCES render_history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_render_artifacts_render
  ON render_artifacts(render_id);
```

### `render_events`

Stores live render progress events so the Render page can recover after refresh or reconnect. It does not support edit undo/redo.

```sql
CREATE TABLE IF NOT EXISTS render_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  render_id TEXT NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  phase TEXT NOT NULL,
  progress REAL CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
  message TEXT,
  detail_json TEXT,
  FOREIGN KEY (render_id) REFERENCES render_history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_render_events_render_ts
  ON render_events(render_id, ts);
```

### Security Rules

- Always use `?` parameters for values.
- Whitelist setting keys, sort fields, and filter names before interpolating SQL identifiers.
- Never concatenate user-provided paths into SQL.
- Wrap multi-step writes in transactions.
- Do not expose raw SQLite errors in user-facing messages.
- On Unix, app DB directory should be `0700`; DB/WAL/SHM files should be owner read/write.
- On Windows, rely on user profile ACLs and avoid writing app DB outside `%APPDATA%`.

### Migration Rules

- Add a migration runner before changing schema beyond the current inline `SCHEMA`.
- Each migration runs inside a transaction.
- Additive migrations are preferred.
- Complex destructive changes use create-copy-swap.
- Tests use a temp SQLite file or in-memory DB.

## API Surface Required By Prototype

API base : `{origin}/api`

Launcher:

- `GET /projects`
- `DELETE /projects/:projectId`

Setup:

- `POST /projects`: create a new project, including alignment, user should wait a bit time, required checking if the `Voice` and `Transcript` is attaching

Editor:

- `GET /projects/:projectId/config` 
- `PUT /projects/:projectId/config` update config partially. including foreground, PIP, background, transcript, watermark, resolution, subtitles style
- `POST /uploads` uploading all types of assets needed by rendering and get mediaId, put all assets in the `/uploads`, so I can migrate easy in future.
- `POST /projects/:projectId/render?preset=draft|final&resolution=1920x1080|1280x720|1080x1920` get into `Render` page only when request seccussfully

Render:

- `DELETE /projects/:projectId/render/:renderId` 
- `GET /projects/:projectId/history`
- `DELETE /projects/:projectId/history/:renderId`
- `GET /projects/:projectId/render/:renderId` play the rendered video
- WebSocket for render queue data status updating.

## Edge Cases And Boundary Conditions

Project and filesystem:

- Project folder path contains spaces, Unicode, or reserved characters.
- Project folder moved after being added to `projects`.
- Project folder deleted.
- SQLite project row exists but folder is missing.
- `project_configs` row missing or invalid JSON.
- `project_configs.config_json` valid JSON but schema-invalid.
- Folder not writable.
- Disk full during setup, media import, cache, subtitle generation, or render.
- Existing `media/`, `renders/`, or `.vc/` partially present.
- File paths differ only by case.
- Network drive or removable drive disconnects.

Setup and alignment:

- Voice missing.
- Transcript missing.
- Voice codec unsupported.
- Transcript empty.
- Transcript has one very long paragraph.
- Transcript segmentation differs from user expectation.
- WhisperX not installed.
- CUDA unavailable.
- CUDA OOM falls back to CPU or fails clearly.
- Alignment fails due long silence or mismatched text.
- User edits voice or transcript after assigning clips.

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

Render:

- Start render with cold cache.
- Start multiple renders: backend queues them.
- Cancel queued render.
- Cancel active render.
- ffmpeg exits non-zero.
- Output file already exists.
- Partial output exists.
- Final render finishes but DB insert fails.
- DB history row exists but output file missing.
- User closes browser during render.
- Sidecar dies during render.
- Render log grows large.
- After-render actions requested before done.

Database:

- DB file missing: recreate with migrations.
- DB schema old: migrate.
- DB corrupted: back up corrupted file and recreate with warning.
- WAL/SHM files left after crash.
- Query parameters include SQL-like payloads.
- Config JSON too large or invalid.

## Testing Strategy

Frontend unit/component tests:

- Launcher project card states and generated thumbnail fallback.
- New project folder picker -> Setup subflow.
- Setup manual select voice and transcript.
- Continue disabled until alignment succeeds.
- Editor route guard requires `project_id`.
- Render route guard requires `project_id` and `render_id`.
- Transcript selection, shift selection, search, context menu, merge/concatenate.
- Assign modal create and edit modes.
- Background modal image/video playlist rules.
- Subtitles modal global apply and preview resolution match.
- Inspector variants, global video config, and blank empty state.
- Timeline selection, seek, resize, drag, scroll, layer packing.
- Layers popover without add-item footer.
- Draft render strip queued/running/done/cancelled/failed.
- Render page queue/status/history live states.
- Browser storage undo/redo operation stack.

Backend tests:

- SQLite migrations.
- `projects` CRUD and prune behavior.
- `project_configs` save/load/validate/hash behavior.
- Setup inspect missing/invalid/valid voice and transcript.
- Alignment writes `<project>/subtitles.srt`.
- Media import does not auto-import arbitrary selected-folder files.
- Render queue ordering.
- Render history states: queued, running, done, error, cancelled.
- Render artifacts for output, partial, log, graph, subtitles, thumbnail.
- Render events recovery after reconnect.
- SQL injection payload tests for all user-controlled DB inputs.

E2E/browser tests:

- Launcher -> New project folder picker -> Setup -> alignment -> Editor.
- New aligned project can render without foreground/background.
- Existing rendered project cannot rerender until config changes.
- Editor modal flows.
- Timeline drag/stretch syncs left transcript state.
- Render queue progress and cancellation.
- No visible Tokens/nav/statusbar prototype clutter in Phase 1 product UI.
- Visual screenshots at desktop and narrower widths.
- No console errors.

Verification commands:

```bash
pnpm test
pnpm lint
pnpm build
pnpm -F @vc/web test
pnpm -F @vc/server test
```

## Boundaries

Always:

- Store canonical project config in SQLite `project_configs`.
- Keep user-visible `subtitles.srt` at `<project>/subtitles.srt`.
- Use browser storage for UI preferences and incremental undo/redo operation history.
- Use parameterized SQL.
- Keep generated shared schema files generated, not hand-edited.
- Validate project config through shared schemas before saving.
- Maintain render order exactly.
- Keep sentence anchors stable across voice re-records unless sentences are explicitly merged/changed.
- Add focused tests for behavior changes.

Ask first:

- Adding cloud services or AI generation.
- Adding future AI/character schema fields.
- Changing render output codecs beyond MP4.
- Removing vertical 9:16 support.
- Changing project config persistence away from SQLite.
- Implementing YouTube upload.

Never:

- Store secrets in SQLite, project config, logs, browser storage, or committed files.
- Concatenate user input into SQL.
- Silently delete orphaned assignments after transcript changes.
- Silently mix image/video background playlists.
- Delete user media files when deleting clips unless explicitly requested.
- Modify generated schema outputs by hand.
- Add co-author or external attribution lines to commits.

## Success Criteria

