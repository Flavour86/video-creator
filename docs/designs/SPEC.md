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

## Decisions From Review Comments

- `project.json` is no longer stored inside the selected project folder. Canonical project config is stored in SQLite `project_configs`.
- The user-selected folder stores user-visible source/output files: `voice`, `transcript`, media, renders, and `subtitles.srt`.
- `subtitles.srt` must be stored at `<project>/subtitles.srt`, not under `.vc/`, because the user may use it directly.
- No visible top navigation. Launcher is the home page. Editor and Render are only reachable with a valid `project_id`.
- Setup is a Launcher subflow for new projects only.
- New projects may render after successful alignment even if no foreground/background has been added.
- Already-rendered projects may render again only when the current config has unrendered changes.
- Multiple render requests are queued by the backend and shown live in the UI.
- Phase 1 fully supports vertical `9:16` output. It is a resolution/aspect choice, not a separate render preset.
- Undo/redo uses browser storage with incremental operations, not whole-config snapshots.
- Render artifacts are generated-output records. They are not source assets; the primary reusable clip cache remains `.vc/clips/`.

## Objective

Build a local-first video creation app where the transcript/subtitle timing is the editing surface. The user selects a project folder, provides or detects voice and transcript files, optionally sets a watermark, runs alignment to generate `subtitles.srt`, assigns uploaded media to sentence ranges, previews the layered timeline, and renders queued draft/final MP4 outputs.

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
- Setup collects/detects voice, transcript, optional watermark, and then runs alignment.
- `Continue to Editor` is enabled only after alignment succeeds.
- Editor requires a valid `project_id`; without it, redirect to Launcher.
- Render requires a valid `project_id`; without it, redirect to Launcher.
- For a new project, Render is available immediately after alignment succeeds, even if no foreground or background exists.
- For an already-rendered project, Render is enabled only when the current config has unrendered changes.
- The Tokens page is not part of the product UI, but token-based design-system implementation is still required.

## App Shell Components

### Visible Shell

The Phase 1 shell should not show prototype navigation buttons or the `phase 1 - local` logo suffix.

The bottom shell should remove the center live status segment shown in the red-highlighted part of the reference image. Keep only the left command pill and the right prototype/version badge.

### Theme And Language

Controls may exist in settings/dev surfaces, but not as a persistent top nav:

- Theme toggle: dark/light.
- Language toggle: English/Chinese.
- Accent/density can remain dev-only.

Browser storage owns UI preferences:

- `theme`
- `accent`
- `density`
- `language`

### Tweaks Panel

Tweaks is not part of Phase 1 product UI. It may remain dev-only and hidden in normal builds.

## Launcher Page

Purpose: show recent projects and start a new project. It does not include a separate `Open folder` action, runtime card, tips card, or create-another card.

Primary layout:

- Header with product logo/name.
- `New project` button.
- Recent project list.

Buttons:

- `New project`: opens a native folder picker; after the user selects a folder, start the Setup subflow.
- Project card: opens Editor for that project.

Project card fields:

- thumbnail.
- project name.
- voice duration.
- sentence count.
- media count.
- last opened.
- alignment/render status tag.
- optional current render queue status.

Project card must not show the raw folder path in the primary UI.

Thumbnail rules:

- Prefer the first frame of the latest successful rendered video.
- If no rendered video exists, generate a deterministic placeholder image when the project is created: three random colors divided evenly. Store or cache the generated thumbnail path.

Launcher states:

- No recent projects.
- Project folder missing on disk.
- Project config missing/corrupt in database.
- Alignment missing, pending, failed, or aligned.
- Current project has queued/running render.
- Folder picker cancelled.
- Folder permission denied.

Runtime status is not shown as a right rail in Phase 1.

## Setup Subflow

Purpose: create and align a new project after the user selects a folder from Launcher.

Primary layout:

- New project title.
- Project name input.
- Output resolution/preset controls.
- Voice and transcript input area.
- Optional watermark input.
- Alignment status/action area.
- `Cancel`.
- `Continue to Editor`.

Inputs:

- Voice and transcript are auto-detected from the selected folder when possible.
- If voice or transcript is not detected, the user can select each manually.
- No folder path card is needed after the folder was selected in Launcher.
- Watermark is optional.

Output choices:

- Draft quality: 720p, fast/ultrafast.
- Final quality: 1080p, CRF 18.
- Vertical output: 9:16, 1080x1920, fully supported in Phase 1.

Alignment UI:

- Show human-meaningful status only: pending, running, aligned, failed.
- Do not show hash, device, or model in the primary UI.
- It is acceptable to show duration and a simple progress indicator.

Buttons and behavior:

- `Cancel`: returns to Launcher.
- `Run alignment`: creates the project row/config in SQLite, runs alignment, and writes `<project>/subtitles.srt`.
- `Continue to Editor`: enabled only when alignment succeeds.

Setup states:

- Folder selected.
- Voice auto-detected.
- Voice manually selected.
- Voice missing.
- Voice invalid.
- Transcript auto-detected.
- Transcript manually selected.
- Transcript missing.
- Transcript empty/invalid.
- Watermark absent or selected.
- Alignment pending/running/aligned/failed.
- Permission denied.
- Disk full.

## Editor Page

Purpose: transcript/subtitle-anchored video editing.

Primary layout:

- Top editor toolbar.
- Optional draft render strip below toolbar.
- Three-pane editor body:
  - Transcript pane.
  - Center preview plus timeline.
  - Right Inspector rail with global video config at the top.

### Editor Toolbar

Left:

- Back/home icon button to Launcher.
- Project title.
- Do not show the project path crumb.

Right:

- Cache status tag, e.g. `cache 24/24`.
- `Save`.
- `Render Draft`.
- `Render Final`.

Save behavior:

- Browser storage records the working editing state and incremental operations for local recovery.
- `Save` snapshots the current browser working config and syncs it to SQLite `project_configs`.
- Do not save a whole config on every undo/redo operation; only record incremental operation entries.

Render button enablement:

- New aligned project: Draft/Final render is enabled even without foreground/background.
- Already-rendered project: Draft/Final render is enabled only when the current config hash differs from the latest successful rendered config hash.
- While a draft/final render is active, the corresponding button is disabled or attaches to the active job.

Toolbar states:

- Save pending, saving, saved, failed.
- Cache warm, cold, partial, invalid.
- Render disabled because no alignment.
- Render disabled because no unrendered changes on already-rendered project.
- Render queued/running.

### Draft Render Strip

Appears below toolbar when draft render is active, queued, failed, cancelled, or recently completed.

Fields:

- progressbar `aria-valuenow`.
- fill percentage.
- label: queued, rendering draft, draft ready, failed, cancelled.
- stage label.
- percentage.
- `Cancel` button while queued or active.

Stages:

1. queued
2. verifying cache
3. pre-rendering clips
4. building `subtitles.srt`
5. ffmpeg compose
6. muxing audio
7. done

Output:

- Drafts write to `<project>/.vc/drafts/<timestamp>.mp4`.
- Cancelled partial drafts are excluded from playback.

### Transcript Pane

Sentences are derived from the generated `<project>/subtitles.srt`, which is adjusted against the transcript content.

Components:

- Search input with search icon.
- Keyboard hint `Cmd/Ctrl+F`.
- Header: `Transcript - N aligned`.
- Selection range chip.
- Scrollable sentence list.
- Sentence row.
- Sentence add button.

Sentence row fields:

- sentence index.
- timecode(start and end time).
- sentence text.
- orphan marker state.

Interactions:

- Click sentence: select it and seek playhead to the sentence start timestamp.
- Shift-click sentence: select contiguous sentence range.
- Right-click sentence: open context menu.
- Click `+` handle: open context menu for that sentence.
- Current sentence is highlighted by playhead time.
- Search filters transcript and scrolls to the first matched element.
- Enter or Down arrow in search advances to the next match.
- Escape clears transcript search.
- Concatenate/merge sentences in the Transcript Panel, not in the Subtitles modal. This updates the subtitle/sentence model and dependent clip anchors.

Sentence states:

- normal.
- selected.
- selection first.
- selection last.
- current/now.
- orphaned assignment after transcript changes; render it in red.
- search match.
- low-confidence alignment. Low confidence means WhisperX could align the transcript text to audio only weakly for that sentence/word range; show it as a warning so the user knows timing may need review. It should not block editing by itself.

### Transcript Context Menu

Opened at pointer position.

Buttons:

- `Assign media to range...`: opens Assign modal with `from=to=clicked sentence`.
- `Play from here`: selects sentence and seeks to its start.

### Preview Surface

Components:

- Preview wrap.
- Preview stage with active aspect ratio.
- Preview canvas.
- Background scene or black fallback.
- Foreground scene when active.
- PiP overlays when active.
- Subtitle overlay when enabled.
- Watermark overlay when configured.
- Transport controls.
- Timecode display.

Render order:

1. black fallback
2. background
3. active fullscreen foreground
4. active PiP overlays
5. subtitles
6. watermark

Buttons:

- Previous sentence.
- Play/Pause.
- Next sentence.

Do not show an inline empty-background `add one` button in the preview. Background is configured from the right Inspector global config.

Do not open the Subtitles modal from preview; subtitles are configured from the right Inspector global config.

Preview controls:

- Resolution segmented control:
  - `1080p`: 1920x1080, 16:9
  - `720p`: 1280x720, 16:9
  - `9:16`: 1080x1920, vertical
- No separate `Actual` mode. Selecting a resolution makes the preview use that output aspect/resolution model directly while fitting the available preview area.
- `Layers - N`: opens the layers popover.

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

### Timeline

Components:

- Header `Timeline`.
- Metadata: `30 fps`, clip count, cache count.
- Ruler with ticks and time labels.
- Waveform bars spanning the full voice duration and the full timeline width. Do not render a half-width waveform.
- Track rows.
- Track label.
- Track clips.
- Playhead line.

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

Timeline layout:

- Timeline keeps a fixed height.
- If there are too many layers, the track area scrolls without resizing the preview or pushing the Inspector off screen.

Resize/move constraints:

- start cannot be below `0`.
- end cannot exceed voice/project duration.
- minimum duration is `0.5s`.
- resizing changes `start`/`end` seconds and automatically recalculates the covered sentence range from the updated time span.

### Layers Popover

Opened by `Layers - N`.

Content:

- Header `Layer order - top renders on top`.
- Rows in render order.

No footer `+ Add layer item` is needed. New items are added from the Transcript context menu or sentence `+` handle.

Layer row fields:

- kind dot.
- layer name.
- item count.
- optional trash button for removable background/foreground/PiP layers.

Interactions:

- Click row: select first item in layer, close popover.
- Click background trash: remove background, keep other layers.
- Click outside closes.

### Inspector Rail And Global Video Config

The right rail starts with global video config controls, then the contextual Inspector.

Global video config controls:

- `Watermark`: configure optional watermark.
- `Subtitles`: opens Subtitles modal for global subtitle defaults.
- `Add BG` or `Change BG`: opens Background modal.

Inspector states:

- No selection: show an empty/blank panel, not an explanatory empty state.
- Subtitle clip selected.
- Background selected.
- Foreground selected.
- PiP selected.

#### Inspector: Subtitle Clip

When a subtitle clip is selected, show parameters for that subtitle clip's style and a text button to apply that style to all subtitles.

Fields:

- cue text/time metadata.
- Burn-in segmented control: `On`, `Off`.
- Font select.
- Size number input.
- Position segmented control.
- Background style.
- `Apply to all subtitles` text button.

#### Inspector: Background

Background asset rules:

- Background can use images or video clips, but not a mix in one background playlist.
- If background assets are images, they cover the whole voice duration evenly.
- If background assets are video clips and total clip duration is less than voice duration, the remainder shows black fallback.
- If background video duration exceeds voice duration, the exceeding part is cut off.

Controls:

- Clickable asset card/list: opens Background modal in edit mode.
- For multiple assets, show a compact stacked/list asset presentation consistent with the rest of the UI.
- Cycle/hold control for image playlists.
- Crossfade number input.
- Motion kind select: `none`, `ken_burns`, `ken_burns_strong`.
- `Remove background` danger button.

State notes:

- Background spans the full project only for image playlists.
- Video background playlists use their natural sequence duration, then black fallback or trimming as described above.
- Fullscreen foreground hides background while active.

#### Inspector: Foreground

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
- Motion kind: `none`, `ken_burns`, `ken_burns_strong`, `zoom_in`, `zoom_out`, `pan_left`, `pan_right`.
- Easing: `linear`, `ease_in`, `ease_out`, `ease_in_out`.
- Transition in/out: `cut`, `fade`, `slide_left`, `slide_right`, `dip_black`.
- `Delete item`.

#### Inspector: PiP

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
- `Delete PiP item`.

PiP rules:

- PiP always renders above foreground.
- Multiple PiP clips can be active at the same time only when they are in different layers.
- Canonical PiP placement uses `posX` and `posY` grid coordinates plus offsets. `posX/posY` are confirmed as the canonical field names.

## Assign Media Modal

Purpose: create or edit foreground/PiP assignment from a sentence range.

Open paths:

- Transcript sentence right-click `Assign media to range...`.
- Sentence `+` handle.
- Inspector asset card for foreground/PiP edit mode.

Do not open Assign Media from a Layers popover footer.

Asset rules:

- Media resources are added only when the user uploads/imports them.
- Do not auto-pick arbitrary files from the folder selected by Launcher `New project`.
- The only files auto-detected from the selected project folder are voice and transcript.
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
4. PiP placement, only for PiP
   - 3x3 grid.
   - size slider 15-60.
   - radius slider 0-32.
   - opacity slider 10-100.
   - placement preview.
5. Layer
   - select existing compatible layer.
   - create new Foreground layer.
   - create new PiP layer.
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

## Background Modal

Purpose: add or change background assets. Full-duration behavior applies only to image backgrounds.

Open paths:

- Right rail global video config `Add BG` or `Change BG`.
- Background Inspector asset card.

Controls:

- Asset grid with multi-select.
- `Import from disk...`
- Label metadata: number selected and `images only` or `clips only`.
- Motion select: `none`, `ken_burns`, `ken_burns_strong`.
- Easing select: `linear`, `ease_in`, `ease_out`, `ease_in_out`.
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

## Subtitles Modal

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

- `Apply` saves global subtitle settings and closes.
- `Cancel` closes without saving.
- No cue list in this modal.
- No per-cue merge button in this modal. Sentence/cue merge belongs in Transcript Panel.

States:

- burn-in on/off.
- background style none/pill/block/shadow.
- top/bottom positioning.
- long cue overflow.
- no alignment cues.

## Render Page

Purpose: show only the current project's render queue, active render progress, ffmpeg log, output specs, history, and post-render actions.

Primary layout:

- Header.
- Current project render progress card.
- ffmpeg log card.
- Output panel.
- Current project render history.
- After render actions.

Header:

- Eyebrow `Render`.
- Title: project title plus resolution, for example `Tokyo Essay - 1080p`. Do not include `MP4` in the title because Phase 1 only supports MP4 output.
- `Back to editor`.
- `Cancel render`: cancels a queued task or directly cancels the active rendering process.

Render card:

- Data updates live.
- Output filename.
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

Log card:

- Data updates live.
- Header `ffmpeg log`.
- Meta `tail - live`.
- Timestamped ffmpeg lines.
- Info, ok, warning, error tones.

Output panel fields:

- file.
- resolution.
- framerate.
- video codec, CRF, preset.
- audio codec, bitrate, sample rate.
- color and pixel format.
- actual size as accurately as possible from the output file on disk.

Render history row fields:

- icon.
- filename.
- resolution or preset.
- duration.
- file size.
- status.
- reveal folder button for successful outputs.
- trash button for cancelled/partial/error entries where applicable.

After render buttons:

- `Reveal in Explorer` only if the web app can invoke the host OS file manager through the backend. If not supported, remove this button.
- `Play locally`.
- No YouTube upload in Phase 1. Add upload in Phase 2.

Render states:

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

- Ask for confirmation if a render is active and cancellation would leave a partial file.
- Send one cancel request.
- Move active render to cancelling/cancelled.
- Partial file gets `.partial`.
- Partial history row is excluded from local play actions.

## Media And Layer Model

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

Visual item fields:

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

## Keyboard Shortcuts

Required shortcuts:

- `Space`: play/pause.
- Left/right arrow: frame step at 30 fps.
- Shift + left/right arrow: previous/next sentence.
- `Cmd/Ctrl+F`: focus transcript search.
- `Enter` or Down arrow in transcript search: next search match.
- `Esc` in transcript search: clear search.
- `Backspace` or `Delete`: delete selected non-background item.
- `Cmd/Ctrl+Z`: undo.
- `Cmd/Ctrl+Shift+Z`: redo.

Do not add global Escape behavior for closing every menu/modal in Phase 1 beyond transcript search clear and component-native behavior.

Shortcut boundary:

- Shortcuts must not fire while typing in input, textarea, select, or contenteditable unless the shortcut is explicitly for that control.

Undo/redo persistence:

- Browser storage records incremental edit operations such as add clip, patch clip, delete clip, move clip, stretch clip, change subtitle style, change background, and change watermark.
- Do not record the entire project config for every operation.
- On reload, the browser can restore the current draft and operation stack for the same `project_id`.
- SQLite remains canonical after explicit save/sync.

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
- Canonical PiP placement uses `posX`, `posY`, `offsetX`, and `offsetY`.
- Output settings should include full resolution/fps/codec fields, not just preset.

Recommended config addition:

```json
{
  "media": [
    {
      "id": "m1",
      "path": "media/tokyo-skyline.jpg",
      "kind": "image",
      "name": "tokyo-skyline.jpg",
      "width": 4032,
      "height": 2268,
      "duration_s": null,
      "size_bytes": 3565158,
      "hash": "sha256:...",
      "thumb": ".vc/thumbs/m1.png",
      "import_mode": "copied",
      "created_at": "2026-05-10T00:00:00Z"
    }
  ]
}
```

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

Launcher:

- `GET /projects`
- `POST /projects/new-folder`
- `DELETE /projects/:projectId`

Setup:

- `POST /projects/:projectId/inspect`
- `POST /projects/:projectId/alignment`
- `GET /projects/:projectId/alignment`
- WebSocket event for setup inspection/alignment progress.

Editor:

- `GET /projects/:projectId/config`
- `PUT /projects/:projectId/config`
- `POST /projects/:projectId/media/import`
- `GET /projects/:projectId/media`
- `POST /projects/:projectId/clips`
- `PUT /projects/:projectId/clips/:clipId`
- `DELETE /projects/:projectId/clips/:clipId`
- `POST /projects/:projectId/background`
- `DELETE /projects/:projectId/background`
- `PUT /projects/:projectId/subtitles`
- `PUT /projects/:projectId/watermark`
- `GET /projects/:projectId/render-cache`

Render:

- `POST /projects/:projectId/render?preset=draft|final&resolution=1920x1080|1280x720|1080x1920`
- `POST /projects/:projectId/render/:renderId/cancel`
- `GET /projects/:projectId/render/history`
- `DELETE /projects/:projectId/render/history/:renderId`
- `GET /projects/:projectId/render/:renderId/log`
- `POST /system/reveal`
- `POST /system/open`
- WebSocket for render queue updates and ffmpeg log tail.

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
- Alignment cache hit.
- Alignment cache stale.
- Alignment low confidence.
- Alignment fails due long silence or mismatched text.
- User edits voice or transcript after assigning clips.

Transcript and sentence assignments:

- Range `from > to` should reorder or reject consistently.
- Range below `1` or above sentence count is clamped or rejected.
- Sentence anchor disappears after transcript edit: item becomes orphaned and red, not silently deleted.
- Re-recorded voice preserves sentence anchors and recomputes seconds.
- Manual timeline stretch preserves sentence anchor.
- Search no results.
- Search in different language input.
- Merge/concatenate sentences updates subtitle timing and clip anchors predictably.

Media:

- Import duplicate file.
- Import same filename with different content.
- Import huge video.
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
- Setup auto-detect/manual select voice and transcript.
- Continue disabled until alignment succeeds.
- Editor route guard requires `project_id`.
- Render route guard requires `project_id`.
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

- Launcher, Setup subflow, Editor, and Render match the revised product flow.
- No visible prototype top nav, Tokens page, full StatusBar, runtime right rail, Tips card, or Open Folder action appears in Phase 1 product UI.
- Every remaining visible button/control has a defined action, disabled state, or out-of-scope note.
- New project can render after alignment even with no foreground/background.
- Already-rendered project can rerender only when config has unrendered changes.
- Editor can represent no background, no foreground, no PiP, no subtitles, and no watermark.
- Background image and video playlist behavior is implemented as specified.
- Timeline supports drag/stretch and layer packing for overlaps.
- Subtitle merge/concatenate happens in Transcript Panel.
- SQLite schema supports `projects`, `project_configs`, render queue/history/events/artifacts.
- Render artifacts are generated-output manifests, while `.vc/clips` remains the primary render clip cache.
- Edge cases listed here either have tests or explicit product decisions.
