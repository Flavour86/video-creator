# Editor Screen Spec

Source inspected: `http://192.168.31.48/app.html` → Editor tab via Chrome MCP
(dark theme, 1440×1000 and 1410×840 viewports).

This is the third in the screen-spec series after
[`UI_LAUNCHER_SETUP_SPEC.md`](./UI_LAUNCHER_SETUP_SPEC.md). Global shell,
tokens, and primitives are owned by
[`UI_GLOBAL_REQUIREMENTS.md`](./UI_GLOBAL_REQUIREMENTS.md). Conventions and
rules of engagement are inherited from those documents and from
[`patterns.md`](../../patterns.md):

- Tailwind utility classes only — no raw CSS, no `globals.css` rules beyond
  token declarations, no Tailwind `suggestCanonicalClasses` linter warnings.
- Strict i18n via `useTranslations()` from `next-intl` against `en.json` /
  `zh.json`. Technical metadata (paths, timecodes, hashes, codec strings)
  remains language-neutral.
- Encapsulate any helper used more than once: `formatTimecode(seconds)`,
  `formatRangeLabel(s1, s2)`, `parseSentenceMeta(text)`, the global
  `request()` wrapper, the WS-event hook for render/align progress, etc.
- Atomic UI globals (`Button`, `IconButton`, `SegmentedControl`, `StatusTag`,
  `Kbd`, `Panel`, `Field`, `Modal`) live in `apps/web/components/ui/` and are
  consumed unmodified.

The Editor is the most complex screen in Phase 1. Read this whole document
before starting; the screens, the timeline, the inspector, and the modals
share state and helpers.

## 0. Top-Level Layout

| Surface | Tailwind |
| --- | --- |
| Editor root | `grid h-[calc(100vh-44px-26px)] grid-rows-[44px_1fr]` (`44px` = global `Titlebar`, `26px` = global `Statusbar`, both rendered above/below this view). |
| `EditorBar` (top toolbar) | `grid grid-cols-[minmax(280px,_22%)_1fr_minmax(360px,_28%)] items-center gap-[14px] border-b border-line bg-bg-1 px-[14px]` |
| `EditorBody` | `grid grid-cols-[320px_minmax(0,1fr)_320px] divide-x divide-line bg-line` (the `bg-line` + `divide-x` give the 1px hairlines between regions). |
| Left rail (`TranscriptPane`) | `flex flex-col bg-bg-1` |
| Center column | `flex min-w-0 flex-col bg-bg-0` |
| Right rail (`InspectorPane`) | `flex flex-col bg-bg-1` |

Inspected dimensions for cross-checking the diff:

- `editor-bar` height: `48px` (toolbar) — close to but not identical to the
  global `Titlebar`. Implement at `h-12` and let content size pad organically.
- `editor-body` columns: `320 / 1fr / 320`, separated by `1px` lines.

## 1. Editor Toolbar (`EditorBar`)

Three regions:

### 1.1 Left — project identity

- Folder icon (`<IconButton>` with accessible label
  `t('editor.openFolder')`).
- `<h2>` project name (`text-base font-semibold tracking-[-0.01em]`).
- `<span class="font-mono text-[11px] text-text-3">` path crumb.

The folder icon opens the system file explorer at the project root (calls
backend `POST /system/reveal`). It does not navigate inside the app.

### 1.2 Center — sub-screen actions

`flex gap-2`. Two ghost-small buttons:

| Label | Icon | Opens |
| --- | --- | --- |
| `t('editor.subtitles')` (`Subtitles`) | type/text glyph | `SubtitlesModal` (§4.1) |
| `t('editor.changeBg')` (`Change BG`) | image glyph; `aria-label="Add or change background asset"` | `ChangeBackgroundModal` (§4.2) |

### 1.3 Right — status & render actions

`flex items-center gap-2 justify-self-end`.

1. `<StatusTag tone="info" mono>cache 24/24</StatusTag>` — derived from
   `useRenderCacheStatus()`. Tone shifts:
   - `info`  while warming
   - `ok`    when fully warm (`24/24`)
   - `warn`  when stale (`< total`)
   This tag is not interactive; tooltip on hover shows the cache directory
   path (`<project>/.vc/clips`).
2. `<Button variant="ghost" iconLeft={<Save />}>{t('editor.save')}</Button>`
   — fires `request('/projects/save')` immediately. **No modal.** While the
   request is in flight the label switches to `t('editor.saving')` and the
   button is disabled. The autosave footer chip already covers passive
   saves; this button is for "save right now".
3. `<Button variant="ghost">{t('editor.renderDraft')}</Button>` — fires
   `request('/render?preset=draft')`. **No modal.** While running, the
   button label becomes a live progress tag, e.g. `Drafting · 12%`, and the
   editor surfaces a one-line strip above the transcript pane reading
   `t('editor.renderStripDraft', { phase })` (`Rendering draft : verifying
   cache` → `composing filtergraph` → `muxing` → finishes silently). The
   strip lives in the `TranscriptPane` head, height `28px`, hairline border
   bottom, `text-[11px] font-mono text-text-2 bg-amber-bg`.
4. `<Button variant="accent" iconLeft={<Film />}>{t('editor.renderFinal')}</Button>`
   — does **not** open a modal in the Editor. It routes to `/render` (the
   dedicated Render screen), which is a separate spec. The Editor merely
   triggers `request('/render?preset=final')` and `router.push('/render')`.

### 1.4 Optional: when a render is running

If a render is in progress and the user navigates back to the Editor, the
toolbar's `Render Draft` / `Render Final` button is replaced by a `Drafting
· N%` / `Composing · N%` ghost button. Clicking it routes back to `/render`
to inspect the live job. Only one render runs at a time; if both buttons
would be active simultaneously, the one not running is disabled with a
`title` of `t('editor.renderBusy')`.

## 2. Transcript Pane (`TranscriptPane`)

`flex h-full flex-col bg-bg-1`.

### 2.1 Search bar (`tx-search`)

| Slot | Tailwind |
| --- | --- |
| Wrapper | `flex items-center gap-2 border-b border-line px-3 py-2` |
| Search icon | `h-4 w-4 text-text-3` |
| `<input>` | `flex-1 rounded border border-line bg-bg-2 px-2 py-1 text-xs text-text placeholder:text-text-4 focus-visible:border-amber/60 outline-none` |
| `<Kbd>⌘F</Kbd>` | global keyboard chip |

Behaviour (this is the user-required behaviour, **not** what the prototype
currently ships):

- Typing filters matches case-insensitively against the sentence text and
  the `s<n>` index.
- The pane scrolls so that the **first match** is the topmost visible
  sentence (`scrollIntoView({ block: 'start', behavior: 'smooth' })`).
- The matching substring inside each sentence is wrapped in
  `<mark class="bg-amber/30 text-text rounded-sm px-0.5">`.
- `Enter` advances to the next match; `Shift+Enter` to the previous.
- `Escape` clears the query and removes scroll/highlight.
- `⌘F` (macOS) / `Ctrl+F` (Win/Linux) focuses the input from anywhere in
  the editor (global `useHotkeys` registration).
- The chip on the right is purely decorative; clicking it focuses the
  input (same as `⌘F`).

### 2.2 Section header (`tx-bar`)

| Slot | Tailwind |
| --- | --- |
| Wrapper | `flex items-center justify-between px-3 py-2 border-b border-line-soft` |
| Title | `font-mono text-[11px] uppercase tracking-[0.08em] text-text-2` |
| Range badge | `<StatusTag tone="warn" mono>` |

Title: `t('editor.transcriptHead', { count: alignedCount })` →
`Transcript · 21 aligned` / `字幕 · 21 已对齐`. The integer is
language-neutral.

Range badge tracks the **active sentence range** — the contiguous sentences
whose time range contains the current playhead. Examples:

- single sentence at the playhead → `s1`
- crossing two adjacent sentences → `s6-s7`

Badge tone:

- `warn` while transcript loaded but no playhead activity yet
- `info` while audio is playing
- `ok` when paused on an aligned sentence

### 2.3 Sentence list (`tx-list`)

A virtualized scroller (use `react-virtuoso` or a thin local helper — never
hand-roll a virtualizer in the page component).

| Slot | Tailwind |
| --- | --- |
| List | `flex-1 overflow-y-auto` |
| Sentence row (`Sentence`) | `grid grid-cols-[28px_44px_minmax(0,1fr)] items-start gap-2 px-3 py-2 text-sm leading-snug border-l-2 border-transparent hover:bg-bg-2` |
| Index | `font-mono text-[11px] text-text-3 pt-0.5` |
| Timecode | `font-mono text-[11px] text-text-3 pt-0.5` |
| Text | `text-text-2` |
| Active row | `border-l-amber bg-amber-bg/40 text-text` |
| Search-match row (offscreen of active) | `bg-amber/5` |

Active state is **derived from playhead time**, not from the click target.
Clicking, right-clicking, or hitting `Enter` on a row moves the playhead
to that sentence's start; the row only renders as active when the playhead
is inside its range.

### 2.4 Sentence interactions

| Trigger | Result |
| --- | --- |
| Left click | Move playhead to sentence start, scroll waveform/preview to that time. **Does not** change the inspector subject. |
| Right click | Open `SentenceContextMenu` at the cursor. Same row also receives the playhead jump as a side-effect (matches prototype). |
| `Enter` while focused | Same as left click. |
| `Shift+Enter` | Open the `Assign media to range` modal pre-filled with `From=<n>, To=<n>`. |
| Drag-drop a file from OS onto a row | Open `Assign media to range` modal pre-filled with `From=<n>, To=<n>` and the dropped file pre-selected (when supported by the host). |

`SentenceContextMenu`:

| Slot | Tailwind |
| --- | --- |
| Menu root | `min-w-[200px] rounded-md border border-line bg-bg-2 p-1 shadow-2 text-sm` |
| Item | `flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-3` |
| Icon | `h-4 w-4 text-text-3` |
| Separator | `my-1 h-px bg-line-soft` |
| Muted item | `text-text-3` |

Items, in order:

1. `<Upload />` `t('editor.menu.assignRange')` (`Assign media to range…`) →
   opens `UploadToRangeModal` (§4.3) with `From=<n>, To=<n>`.
2. `<Play />` `t('editor.menu.playFromHere')` (`Play from here`) → moves
   playhead and starts playback.
3. separator
4. muted `t('common.cancel')` — closes the menu (also Escape).

The menu must close on outside click, Escape, route change, or scroll of
the underlying pane.

### 2.5 Timeline alignment

The transcript pane and the timeline waveform share a single time axis. A
helper `useTimelineSync()` mediates:

- Clicking a sentence: `setPlayhead(sentence.startSec)`. The waveform
  centers/scrolls to keep the playhead visible.
- Scrubbing the playhead (in the timeline ruler): `useTimelineSync()`
  computes the current sentence index from `sentence.startSec ≤ t <
  sentence.endSec` and exposes `activeSentenceRange = [s_n, s_m]` to the
  transcript head badge, the active row, and the inspector's range badge.
- Searching: when search advances to a match, `setPlayhead(match.startSec)`
  too — preview, waveform, and transcript stay synchronized.

## 3. Center Column

`flex min-w-0 flex-col`. Three vertically stacked surfaces:

### 3.1 Preview surface (`preview-wrap`)

| Slot | Tailwind |
| --- | --- |
| Wrapper | `flex flex-1 min-h-0 flex-col` |
| Stage | `relative flex flex-1 min-h-0 items-center justify-center bg-bg-0` |
| Canvas | `aspect-video w-auto h-full max-w-full overflow-hidden rounded-md` |
| Subtitles overlay | `absolute inset-x-0 bottom-[7%] text-center text-white drop-shadow-md text-[clamp(14px,2vw,28px)] font-semibold` |
| Watermark `VC` chip | `absolute right-3 bottom-3 rounded bg-bg-2/40 px-2 py-1 text-xs font-semibold text-white` |
| Preview meta strip | `flex items-center justify-between px-4 py-2 border-t border-line` |

Underneath the stage is the `Transport` cluster + a timecode display:

- `<IconButton title={t('editor.transport.prev')} ariaLabel={t('editor.transport.prev')}>`
  — skip to previous sentence start.
- `<IconButton variant="primary" title={t('editor.transport.play')}>` —
  toggle play/pause; icon swaps between `Play` and `Pause`.
- `<IconButton title={t('editor.transport.next')}>` — skip to next sentence
  start.
- Timecode: `font-mono text-[12px] text-amber` for the live timecode,
  `text-text-3` for the separator and total. Format `HH:MM:SS.mmm` via
  `formatTimecode(seconds, { ms: true })`.

### 3.2 Preview controls (`preview-controls`)

`flex items-center justify-between border-t border-line px-4 py-2`.

Left cluster: two `<SegmentedControl>` instances side-by-side (`flex gap-2`):

| Control | Items | Default | Notes |
| --- | --- | --- | --- |
| Resolution | `1080p`, `720p`, `9:16` | `1080p` | Sets preview render resolution and downstream final-render preset hint. `9:16` switches the canvas to vertical aspect; subtitle/watermark safe areas reflow. |
| Fit mode | `Fit`, `Actual` | `Fit` | `Fit` scales the canvas to fill available height with letterboxing; `Actual` shows 1:1 (scrollable if > stage). |

Right cluster: the `Layers` button.

- `<Button variant="ghost" size="sm" iconLeft={<Layers />}>Layers · {n}</Button>`.
- `n` is the layer count from `useLayers()` (subtitles + each PiP/foreground
  layer + background = 5 in the prototype).
- Click toggles `LayersPopover` (§3.4).

### 3.3 Timeline (`Timeline`)

`flex shrink-0 flex-col border-t border-line bg-bg-1` with a fixed inner
height (~302px in the prototype). Children:

| Sub-surface | Role |
| --- | --- |
| `tl-header` | `flex items-center justify-between px-4 py-2 text-[11px] font-mono text-text-3` — left label `t('editor.timeline.head')` (`TIMELINE`), right meta `30 fps · 7 clips · cache 24/24`. |
| `ruler` | `relative h-[22px] border-y border-line-soft` — tick marks at uniform intervals (`00:00`, `02:05`, `04:11`, …). Pixel-per-second derives from `(stageWidth - laneLabelCol) / totalSeconds`. |
| `waveform` | `relative h-[60px]` — sample-resolution voice waveform. Bars within the active-sentence range tint amber; the rest stays neutral. |
| `tracks` | one `track-row` per layer, each `h-[44px]` |
| `playhead-line` | `absolute inset-y-0 w-px bg-amber pointer-events-none` overlay across ruler + waveform + tracks, with a triangular cap at the top |

Layer rows, top-down (note this matches the `LayersPopover` "top renders on
top" order):

| Index | Layer | Lane label | Clip color |
| ---:| --- | --- | --- |
| 0 | Subtitles | `Subtitles · 1` | `bg-blue/70 border border-blue` |
| 1 | PiP z4 | `PiP · z4 · 2` | `bg-violet/70 border border-violet` |
| 2 | PiP z3 | `PiP · z3 · 1` | `bg-violet/70 border border-violet` |
| 3 | Foreground z1 | `Foreground · z1 · 3` | `bg-amber/70 border border-amber` |
| 4 | Background | `Background · 1` | `bg-amber-2/40 border border-amber-2` (full-width strip with file label) |

Track row internals:

| Slot | Tailwind |
| --- | --- |
| Row | `grid grid-cols-[80px_minmax(0,1fr)] h-[44px] items-center border-t border-line-soft` |
| Label cell | `flex items-center gap-1.5 px-3 text-[11px] font-mono uppercase text-text-3` (truncated with `…` when needed) |
| Lane | `relative h-full` |
| Clip | `absolute top-1/2 -translate-y-1/2 h-[24px] rounded-sm` (Subtitles 28px wide rectangles, PiP/FG variable, BG full-width with inset filename label) |
| Selected clip | `outline outline-2 outline-amber` (matches `.selected` class in prototype) |
| Background label | `absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-text` |

Clip interactions:

| Trigger | Effect |
| --- | --- |
| Click on a Foreground/PiP/Background clip | Select it. `playhead = clip.startSec`. `Inspector` retargets to the clip. |
| Click on a Subtitles clip | Same playhead jump, but Inspector is **not** retargeted (subtitle editing happens in the modal — §4.1). |
| Click on empty lane area | Deselect; Inspector falls back to the layer-default view (e.g. Background defaults to the BG inspector). |
| Drag clip body | Move clip in time (snap to sentence boundaries when possible). |
| Drag clip edge | Trim start/end (snap to sentence boundaries; minimum 1-frame width). |
| Right click on a clip | Reveal a small context menu: `Replace asset…`, `Stretch to sentence…`, `Duplicate`, `Delete`. (Out of prototype scope; build the surface anyway.) |
| Click ruler/waveform | Set playhead to that time. |
| Drag ruler/waveform | Scrub. |

Required snap targets: sentence start/end times (from alignment cache) and
the project start (`0:00.000`).

### 3.4 Layers popover (`LayersPopover`)

Anchored to the `Layers · N` button, opens above (popover, not modal).
Inspected dimensions: ~280×260, rounded-md, shadow-2.

| Slot | Tailwind |
| --- | --- |
| Root | `absolute bottom-full mb-2 right-0 w-64 rounded-md border border-line bg-bg-2/95 p-3 shadow-2 backdrop-blur` |
| Head | `mb-2 text-[11px] font-mono uppercase tracking-[0.08em] text-text-3` |
| Rows wrapper | `flex flex-col` |
| Row | `flex items-center gap-2 rounded px-2 py-2 hover:bg-bg-3` |
| Color dot | `h-2 w-2 rounded-full` (`bg-blue` for subtitles, `bg-violet` for PiP, `bg-amber` for foreground, `bg-amber-2` for background) |
| Name | `flex-1 text-sm` |
| Count | `font-mono text-[11px] text-text-3` |
| Trash icon | `<IconButton size="xs" variant="danger" title={t('editor.layers.delete')}>` — only rendered for layers that can be removed (see below). |
| Foot | `mt-2 border-t border-line-soft pt-2` |
| Add button | `<Button variant="ghost" size="sm" class="w-full justify-center">+ Add layer item</Button>` |

Head copy: `t('editor.layers.head')` → `Layer order · top renders on top`.
Order is the visual z-stack — items rendered higher up the popover sit on
top in the composite. Reorder is supported via drag handle on hover (use
`@dnd-kit` if available; otherwise up/down buttons revealed on hover).

Per-layer affordances (`canDelete` from layer state):

| Layer | Delete | Reorder | Notes |
| --- | --- | --- | --- |
| Subtitles | ✗ | ✗ | Subtitles always on top; non-deletable. |
| PiP `zN` | ✓ when `items.length === 0` | ✓ within PiP layers | Removing a PiP lane is allowed only when empty. |
| Foreground `zN` | ✓ when `items.length === 0` | ✓ within FG layers | Same rule. |
| Background | ✓ (`Remove background`) | ✗ | Removing it makes the canvas plain `--bg-0`. |

Add button → opens `UploadToRangeModal` (§4.3) with no preselected
sentence range.

## 4. Modals (Editor-Owned)

All four modals share the global `<Modal>` shell:

| Slot | Tailwind |
| --- | --- |
| Backdrop | `fixed inset-0 z-50 bg-bg-0/70 backdrop-blur-sm` |
| Frame | `mx-auto my-[5vh] flex max-h-[90vh] w-[min(900px,calc(100vw-32px))] flex-col rounded-lg border border-line bg-bg-1 shadow-2` |
| Head | `flex items-start justify-between gap-4 border-b border-line px-6 py-4` |
| Title | `text-xl font-semibold tracking-[-0.01em]` |
| Subtitle | `mt-1 text-sm text-text-3` |
| Close `<IconButton>` | top-right of head |
| Body | `flex flex-col gap-5 overflow-y-auto px-6 py-5` |
| Foot | `flex items-center justify-end gap-2 border-t border-line px-6 py-4` |
| Foot · ghost button | `<Button variant="ghost">{t('common.cancel')}</Button>` |
| Foot · primary | `<Button variant="primary">…</Button>` |

Use `Field`, `FieldRow.two`, and the global `Select`/`Input`/`Range`/`Toggle`
form primitives; never inline arbitrary form HTML in modal bodies.

### 4.1 `SubtitlesModal`

Opened from toolbar `Subtitles`.

- Title: `t('editor.subtitlesModal.title')` (`Subtitles`).
- Subtitle: `t('editor.subtitlesModal.subtitle')` (`Subtitles are
  auto-generated from the transcript via WhisperX alignment. Style and
  burn-in below.`).
- Body sections:
  1. `FieldRow.two`:
     - `Field` `Background`: `<Select>` — `None`, `Pill · 60% black`,
       `Block · 80% black`, `Drop shadow only` (default).
     - `Field` `Position`: `<Select>` — `Bottom · safe zone` (default),
       `Bottom · low`, `Top`.
  2. `FieldRow.two`:
     - `Field` `Font`: `<Select>` — `Inter` (default), `Söhne`, `Helvetica
       Neue`, `SF Pro`. Loaded fonts are language-neutral identifiers.
     - `Field` `Max chars / line`: `<Input type="number" min={20} max={120}
       defaultValue={42}>`.
  3. `FieldRow.two`:
     - `Field` `Size`: a slider (`<Range min={20} max={88}
       defaultValue={44}>`) with a hint span on the right showing
       `t('editor.subtitlesModal.sizeHint', { px })` →
       `44px @ 1080p`. Hint mirrors the live value.
     - `Field` `Burn-in`: `<Toggle defaultChecked />` — when on, subtitles
       are baked into the final render; off keeps them as a sidecar
       `.srt` only.
  4. Live preview frame:
     - 16:9 region, `bg-bg-3` placeholder, label `Preview · 16:9` in the
       top-left corner (`text-[11px] font-mono text-text-3`).
     - Renders the **current playhead's** subtitle line styled per the
       form. Uses `useSubtitlePreview()` so changes apply instantly.
  5. `Field` `Cue list`: a vertically scrollable list of cue rows derived
     from the alignment cache. Each row:

     | Slot | Tailwind |
     | --- | --- |
     | Row | `grid grid-cols-[36px_88px_minmax(0,1fr)_88px] items-center gap-3 border-t border-line-soft py-2` |
     | Index | `font-mono text-[11px] text-text-3` (`s1`, `s2`, …) |
     | Timecode | `font-mono text-[11px] text-text-3` (`00:00 → 00:05`) |
     | Text | `text-sm text-text-2` |
     | Action | `<Button variant="ghost" size="sm">merge ↓</Button>` |

     `merge ↓` collapses the current cue with the next sentence (combines
     text, takes union of time ranges). It is local to the modal — applied
     on `Apply`. Editing the text inline is allowed (`contenteditable`
     pattern via a controlled `<Input>` morph; up to product to enable).

- Foot: `Cancel` (ghost) + `Apply` (primary). `Apply` writes the subtitle
  config to `project.json` and re-issues `request('/render/cache?subtitles=1')`
  to invalidate the subtitle cache.

### 4.2 `ChangeBackgroundModal`

Opened from toolbar `Change BG` *or* from the inspector `CHANGE` button when
the Background layer is active.

- Title: `t('editor.bgModal.title')` (`Change background`).
- Subtitle: `t('editor.bgModal.subtitle')` (`The background spans the entire
  video and shows whenever no foreground is active.`).
- Body sections:
  1. `Field` `Asset`:
     - Right-aligned `<Button variant="ghost" size="xs"
       iconLeft={<Folder />}>{t('common.importFromDisk')}</Button>` — opens
       OS picker, copies file into project `media/`.
     - `AssetGrid` (4-column on desktop, 2 on narrow):
       - cell = `AssetCard` button (`group flex flex-col gap-1 rounded-md
         border border-line bg-bg-2 p-2 text-left hover:border-bg-5
         data-[selected=true]:border-amber data-[selected=true]:ring-1
         data-[selected=true]:ring-amber/40`).
       - Top: a `aspect-video rounded-sm overflow-hidden bg-bg-3` thumb
         with absolute-positioned badge `IMG`/`MP4` in the top-left
         (`absolute left-1 top-1 rounded-sm bg-bg-1/80 px-1 py-px
         font-mono text-[10px]`).
       - Bottom: filename `text-xs font-mono`.
       - Selected card displays a check mark in the top-right (`absolute
         right-1 top-1 rounded-full bg-green text-bg-0 p-0.5`).
     - Caption above grid: `t('editor.bgModal.assetMeta', { selected,
       filter })` → `1 selected · images only`. (Background allows images
       and short MP4 cycles; the prototype filter copy is `images only` for
       the still preset.)
  2. `FieldRow.two`:
     - `Field` `Motion`: `<Select>` — `None — static`, `Ken Burns · subtle`
       (default), `Ken Burns · strong`.
     - `Field` `Easing`: `<Select>` — `linear` (default), `ease in`, `ease
       out`, `ease in-out`.
  3. `Field` `Crossfade between cycles`:
     - `<Range min={0} max={2} step={0.1} defaultValue={0.6}>` rendered
       inline with a numeric value `<span class="font-mono text-text-2
       w-12 text-right">0.6s</span>`.
     - Hint below: `t('editor.bgModal.crossfadeHint')` (`When the background
       image cycles to the next asset in the playlist, this is how long
       the crossfade takes.`).
- Foot: `Cancel` + `Save changes` (primary).

`Save changes` rewrites the BG layer in `project.json`, invalidates the BG
cache (`.vc/clips/bg-*.mp4`), and triggers a re-warm in the background.

### 4.3 `UploadToRangeModal` (alias of `Assign media to range`)

Opened from:
- Transcript context menu → `Assign media to range…` (with `From=<n>,
  To=<n>`).
- `LayersPopover` → `+ Add layer item` (with no preselected range).
- Inspector `CHANGE` on a Foreground or PiP clip (with the clip's range and
  asset preselected, in "replace mode" — title becomes `Replace asset` and
  the primary button becomes `Update`).

- Title (variant): `t('editor.uploadModal.title.create')` (`Upload to
  range`) or `t('editor.uploadModal.title.replace')` (`Replace asset`).
- Subtitle: `t('editor.uploadModal.subtitle')` (`Place a media asset over a
  span of sentences. The timeline is computed automatically.`).
- Body sections (in order):
  1. `Field` `Asset` — same `AssetGrid` as §4.2 with an `Import from disk…`
     ghost button on the right. Filter pill (e.g. `images only`,
     `images + video`) reflects the chosen Compositing mode.
  2. `Field` `Sentence range`:
     - `flex items-center gap-2`.
     - `From` label + `<Input type="number" min={1} max={alignedCount}>`,
       `to` label + `<Input>`. Inputs are clamped via `useSentenceRange()`
       so `to ≥ from`.
     - Right side: `<StatusTag tone="info" mono>` showing
       `t('editor.uploadModal.timeBadge', { range, duration })` →
       `00:06-00:12 · 5.2s`. Computed from the alignment cache.
     - Below the inputs, the matching sentence text(s) are rendered
       read-only inside `bg-bg-1 rounded border border-line p-2` with the
       sentence index prefix. Multiple sentences become a vertical stack
       of `s<n> <text>` lines.
  3. `Field` `Compositing` — `CompositingPicker` (two large tile buttons):

     | Tile | Illustration | Strong | Sub |
     | --- | --- | --- | --- |
     | `Fullscreen` | full-frame block | `Fullscreen` | `Foreground replaces background while active.` |
     | `Picture-in-picture` | corner inset block | `Picture-in-picture` | `Overlay sits on top; multi-stack supported.` |

     Tile classes: `flex-1 group flex flex-col gap-2 rounded-md border
     border-line bg-bg-2 p-3 text-left hover:border-bg-5
     data-[on=true]:border-amber data-[on=true]:ring-1
     data-[on=true]:ring-amber/40`. Use a tokenized illustration (CSS
     gradient + a small block) — these are not photos.
  4. `Field` `Layer` — `<Select>` whose options derive from the project's
     existing layers of the chosen Compositing kind, plus a sentinel:
     - Fullscreen → `+ Create new Foreground layer (z<next>)`,
       `Foreground · z1 · 3 items`, `Foreground · z2 · 0 items`, …
     - PiP → `+ Create new PiP layer (z<next>)`, `PiP · z3 · 1 item`, `PiP
       · z4 · 2 items`, …
     - Hint: `t('editor.uploadModal.layerHint')` (`Higher layers render on
       top. PiP layers always sit above foreground.`).
  5. **Conditional — only when Compositing = PiP** — `Field` `PiP placement`
     contains a `pip-cfg` block:

     | Slot | Tailwind |
     | --- | --- |
     | Wrapper | `grid grid-cols-[112px_minmax(0,1fr)_140px] gap-4` |
     | `pos-grid` | `grid grid-cols-3 gap-1` of 9 `<button>` cells (TL/TC/TR/ML/MC/MR/BL/BC/BR) — each `h-7 w-7 rounded-sm border border-line bg-bg-2 text-[10px] font-mono text-text-3 data-[on=true]:bg-amber data-[on=true]:text-bg-0 data-[on=true]:border-amber` |
     | `pip-fields` | three `flex items-center gap-2` rows (Size, Radius, Opacity) — each is `<span class="text-text-3 text-[11px]">label</span> <Range /> <span class="font-mono text-text-2 w-12 text-right">value</span>` |
     | Sliders | Size `0–60% default 30%`, Radius `0–32px default 12px`, Opacity `0–100% default 100%`. |
     | Preview | a small `aspect-video rounded-sm bg-bg-3` panel with a corner-anchored filled rectangle reflecting the live config; bottom-left tag `Preview` (`text-[10px] font-mono text-text-3`). |

  6. `FieldRow.two`:
     - `Field` `Motion`: same options as §4.2 plus `Zoom in`, `Zoom out`,
       `Pan left`, `Pan right`. Default `None — static`.
     - `Field` `Easing`: `linear`, `ease in`, `ease out`, `ease in-out`
       (default `ease in-out`).
  7. `FieldRow.two`:
     - `Field` `Transition in`: `cut`, `fade · 0.4s`, `slide left`, `slide
       right`, `dip to black`. Default `fade · 0.4s`.
     - `Field` `Transition out`: same options. Default `cut`.

- Foot:
  - Create mode: `Cancel` + `Add to project` (primary).
  - Replace mode: `Cancel` + `Update` (primary). When the asset is unchanged
    and only motion/transition/PiP were edited, the button label becomes
    `Save changes`.

On submit:
- Backend `POST /editor/clip` (create) or `PUT /editor/clip/<id>` (update)
  with the full clip payload.
- The frontend optimistically inserts/updates the clip in the timeline and
  invalidates the per-clip cache (the `useRenderCacheStatus()` hook will
  recompute `cache N/M`).

## 5. Inspector Pane (`InspectorPane`)

The Inspector is the right rail. Header is a sticky `flex items-center
border-b border-line px-4 py-2.5 text-[11px] font-mono uppercase
tracking-[0.08em] text-text-2` reading `t('editor.inspector')`
(`Inspector`).

Body switches by **selected clip** (`useSelection()`). Three layouts:

### 5.1 Foreground / PiP inspector

| Section | Slot | Tailwind |
| --- | --- | --- |
| Section root | `flex flex-col gap-3 border-b border-line-soft px-4 py-4 last:border-b-0` |
| Section title | `text-[11px] font-mono uppercase tracking-[0.08em] text-text-2` |
| Field grid | `grid grid-cols-[80px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs` |
| Label cell | `text-text-3 uppercase tracking-[0.06em]` |
| Value cell | input/select/`StatusTag`/mono span |

#### Asset section (header tells you the layer)

- `<h4>` `Foreground · Foreground · z1` — the heading is built from
  `parentKind · layerName · zIndex`. PiP variant: `Foreground · PiP · z3`
  (the prototype shows `Foreground` as the umbrella kind for
  `foreground+pip` because both replace transcript imagery; verify the
  exact word with the i18n team — we keep the prototype copy verbatim).
- `<button class="ins-asset">` (`flex w-full items-center gap-3 rounded-md
  border border-line bg-bg-2 p-3 hover:border-bg-5`):
  - Thumb `h-10 w-10 rounded-sm bg-bg-3 overflow-hidden` (or the asset
    palette gradient as a fallback).
  - Body: `<div class="name text-sm font-mono">quote-card.png</div>` and
    `<div class="meta text-[11px] font-mono text-text-3">s10–s11 ·
    01:00–01:13</div>`. Both fields are language-neutral.
  - Right: `<span class="swap-hint flex items-center gap-1
    text-[11px] font-mono uppercase tracking-[0.08em] text-text-3
    group-hover:text-text-2">↑ CHANGE</span>` (the prototype uses an
    upload glyph). Click → opens `UploadToRangeModal` (§4.3) in **replace
    mode** with the clip's range and asset preselected.

#### Range section

`Field grid` rows:

- `From` → `<Input type="number" min={1} max={alignedCount}>`
- `To` → `<Input type="number" min={from} max={alignedCount}>`
- `Stretch` → static span `<span class="font-mono text-text-3 text-[11px]">
  drag clip edges in the timeline ↗</span>` (i18n key
  `editor.inspector.stretchHint`).

The range inputs commit on blur or Enter and update the clip's start/end
on the timeline.

#### Motion section

- `Kind` → `<Select>` with the same options as the upload modal §4.3 step 6.
- `Easing` → `<Select>` (linear/ease-in/out/in-out).

#### Transitions section

- `In` → `<Select>` (same options as upload modal §4.3 step 7).
- `Out` → `<Select>`.

#### Footer action

`<Button variant="ghost" tone="danger" iconLeft={<Trash />} class="mx-4
my-3">{t('editor.inspector.deleteItem')}</Button>` → confirms via
`<ConfirmDialog>` ("Delete this clip? The cached render will be invalidated.")
and on accept removes the clip and re-warms the cache.

#### Conditional: PiP placement section

When the selected clip is a PiP clip, an additional section
`PiP placement` appears between `Range` and `Motion`, with the same
`pip-cfg` block as §4.3 step 5. The 9-cell grid, three sliders, and live
preview are the same component.

### 5.2 Background inspector

Active when the Background clip (or no clip) is selected.

#### Asset section

- `<h4>` `Background`.
- `<button class="ins-asset">` with thumb + name + meta (`4032×2688 · 4.2
  MB` formatted via `formatImageMeta(width, height, bytes)`) + `↑ CHANGE`.
  Click → opens `ChangeBackgroundModal` (§4.2).
- Hint paragraph below: `<p class="text-[11px] text-text-3 leading-snug">{t('editor.inspector.bgHint')}</p>`
  (`Plays underneath all other layers. When the foreground covers the
  screen, BG is hidden.`).

#### Cycle & crossfade section

- `Cycle` → `<SegmentedControl>` `[Hold | Cycle list]`.
  - `Hold` (default): the single asset stays for the whole timeline.
  - `Cycle list`: rotate through the BG playlist; reveals an extra
    `Field` below the segmented control with a small reorderable list of
    the playlist assets.
- `Crossfade` → `<Input type="number" min={0} max={2} step={0.1}
  suffix="s">` (the prototype shows `0.6` plain — render the suffix as a
  small `font-mono text-text-3` adornment inside the input).

#### Motion section

`Kind` only (no easing here). Options: `None`, `Ken Burns · subtle`,
`Ken Burns · strong`.

#### Footer action

`<Button variant="ghost" tone="danger" iconLeft={<Trash />}
class="mx-4 my-3">{t('editor.inspector.removeBg')}</Button>` →
`Remove background` confirms and clears the BG layer.

### 5.3 Empty / fallback

When no clip is selected and there is no Background layer, the Inspector
body shows a centered hint (`flex flex-1 flex-col items-center justify-center
gap-2 px-6 text-center text-text-3`):

- `<Layers />` 24px icon
- `<p class="text-sm">{t('editor.inspector.empty')}</p>`
  (`Select a clip on the timeline to edit it.`)
- Secondary line: `<p class="text-[11px]">{t('editor.inspector.emptyHint')}</p>`
  (`Right-click a sentence to add new media.`)

## 6. Status Bar Contributions (Editor only)

The global statusbar shows:

- left: `⌘K command` chip (global)
- center segments (Editor-specific, registered on mount):
  - `dot ok` — `t('editor.status.alignmentCached')` (`alignment cached`).
  - `dot ok` (or `info` while warming) — `cache 24/24 warm` (mono digits).
  - `dot info` — `autosave · {age}` (`02s ago`). Age formatted via
    `formatRelativeTime(savedAt)` constrained to seconds/minutes.
  - `dot info` — the `<project>/project.json` mono path.
- right: shell version (global).

Tone progression mirrors §1.3 cache states. On render kick-off, swap the
"alignment cached" chip with `render in progress · 43%` (`dot warn`) and the
`autosave` chip with `ffmpeg pid 4218 · 1.2x` (mono).

## 7. Hotkeys

A single `useEditorHotkeys()` hook owns all bindings:

| Combo | Action |
| --- | --- |
| `Space` | toggle play/pause (when not focused in an input) |
| `←` / `→` | scrub one frame |
| `Shift+←` / `Shift+→` | scrub one second |
| `J` / `L` | shuttle backward/forward (multiplier increments) |
| `K` | pause |
| `,` / `.` | step to previous/next sentence |
| `⌘F` / `Ctrl+F` | focus transcript search |
| `⌘S` / `Ctrl+S` | trigger Save (toolbar action) |
| `⌘D` / `Ctrl+D` | duplicate selected clip |
| `Delete` / `Backspace` | delete selected clip (with confirm) |
| `Esc` | close any open modal / popover / context menu |

Register via the global `useHotkeys()` helper; do not call `addEventListener`
on `window` from the page component.

## 8. State Architecture

Per `patterns.md`, encapsulate. Suggested hooks (all under
`apps/web/lib/editor/`):

- `useProject()` — loads `project.json`, exposes mutations through `request()`.
- `useAlignment()` — reads `.vc/alignment.json`, exposes
  `sentences[]` with start/end seconds.
- `usePlayhead()` — current time, play/pause, scrub helpers; emits
  `activeSentenceRange`.
- `useTimelineSync()` — bridges playhead, transcript, and timeline scroll;
  used by `TranscriptPane`, `Timeline`, and `PreviewSurface`.
- `useSelection()` — single-source selection (clip id or `null`) used by
  `Inspector` and timeline highlighting.
- `useLayers()` — derives ordered layers + counts for `LayersPopover` and
  inspector heading.
- `useRenderCacheStatus()` — polls `GET /render/cache?project=…` (or WS),
  returns `{ warm, total, state }` for the toolbar tag and statusbar.
- `useRenderJob()` — subscribes to the render WS, returns the active draft
  or final job's `{ phase, progress, fps, eta }`.
- `useSubtitlePreview()` — feeds the live subtitle preview inside
  `SubtitlesModal`.
- `useHotkeys()` — global keyboard registry.
- helpers (in `apps/web/lib/format/`): `formatTimecode`, `formatRangeLabel`,
  `formatImageMeta`, `formatRelativeTime`, `truncateHash`.

## 9. Implementation Task List Slice

Append these to `UI_GLOBAL_IMPLEMENTATION_TASKS.md` as new sections
`## 15. Editor Shell`, `## 16. Transcript`, `## 17. Timeline & Preview`,
`## 18. Inspector`, `## 19. Editor Modals`. Tasks follow the same legend.

### 9.1 Editor shell

118. `[FE]` Implement `apps/web/components/editor/EditorBar.tsx` per §1
     using `Button`, `IconButton`, and `StatusTag`. Wire `Save`, `Render
     Draft`, `Render Final` to `request()` calls. **No modal** for any of
     them.
119. `[FE]` Implement the live render-progress strip described in §1.3
     bullet 3 as a small `<RenderStrip>` component fed by
     `useRenderJob()`.
120. `[FE]` Compose `apps/web/app/[locale]/editor/page.tsx` with the
     three-region layout in §0. Use the global app shell — do not
     duplicate `Titlebar`/`Statusbar`.
121. `[FE]` Register the Editor-specific statusbar segments from §6 via
     the global `useStatusbar()` registration; unregister on unmount.

### 9.2 Transcript pane

122. `[SHARED]` Add `Sentence` schema (`index`, `text`, `startSec`,
     `endSec`, optional `mark` ranges).
123. `[BE]` Expose `GET /editor/sentences?project=<...>` reading the
     alignment cache; return the `Sentence[]`.
124. `[FE]` Implement `apps/web/components/editor/TranscriptSearch.tsx` per
     §2.1, including ⌘F focus, Enter/Shift+Enter navigation, `<mark>`
     highlight, and smooth scroll to first match.
125. `[FE]` Implement `apps/web/components/editor/TranscriptPane.tsx` per
     §2 with virtualized rendering (`react-virtuoso` or local helper —
     encapsulated in `apps/web/lib/editor/useVirtualList.ts`).
126. `[FE]` Implement `apps/web/components/editor/SentenceContextMenu.tsx`
     per §2.4 with positioning helper `useFloating` from
     `@floating-ui/react`. Outside-click and Escape close.
127. `[FE]` Wire transcript ↔ playhead bidirectionality through
     `useTimelineSync()` (§2.5).
128. `[QA]` Vitest: search highlights and scroll target match the first
     match by sentence index; right-click on row 1 opens menu and on
     "Assign…" opens the upload modal pre-filled with `From=1, To=1`.

### 9.3 Timeline and preview

129. `[FE]` Implement `apps/web/components/editor/PreviewSurface.tsx` per
     §3.1 including the transport cluster and timecode display. Use
     `formatTimecode` for the display.
130. `[FE]` Implement `apps/web/components/editor/PreviewControls.tsx` per
     §3.2 with the two `SegmentedControl`s and the `Layers · N` button.
131. `[FE]` Implement `apps/web/components/editor/Timeline.tsx` per §3.3
     including ruler, waveform, layer rows, playhead overlay, and clip
     selection. The waveform is a canvas backed by
     `apps/web/lib/editor/useWaveform.ts` (returns `Float32Array`
     downsampled to display width).
132. `[FE]` Implement clip drag/drop, edge-trim, and snap-to-sentence in
     `apps/web/lib/editor/useClipGesture.ts`. Encapsulate the drag math —
     no inline handlers in the component.
133. `[FE]` Implement `apps/web/components/editor/LayersPopover.tsx` per
     §3.4 with the per-layer `canDelete`/`canReorder` rules.
134. `[BE]` `POST /editor/clip` (create), `PUT /editor/clip/{id}`
     (update), `DELETE /editor/clip/{id}` — each invalidates the
     per-clip cache and re-warms in the background.
135. `[BE]` `GET /editor/waveform?project=<...>` returning a downsampled
     PCM peak array with `samplesPerSecond` metadata.
136. `[QA]` Vitest: clicking a Foreground clip selects it (Inspector
     retargets); clicking a Subtitles clip moves the playhead but the
     Inspector stays on the previously selected layer; trash button on
     `Background` row opens the confirm dialog.

### 9.4 Inspector

137. `[FE]` Implement `apps/web/components/editor/Inspector.tsx`
     dispatching by `useSelection()` to `ForegroundInspector`,
     `PipInspector`, `BackgroundInspector`, or `EmptyInspector`.
138. `[FE]` Implement `apps/web/components/editor/inspector/AssetCard.tsx`
     (used by all three real variants). Click opens the relevant modal
     (`UploadToRangeModal` replace mode for FG/PiP; `ChangeBackgroundModal`
     for BG).
139. `[FE]` Implement `apps/web/components/editor/inspector/RangeFields.tsx`
     with clamped numeric inputs.
140. `[FE]` Implement
     `apps/web/components/editor/inspector/MotionFields.tsx`,
     `TransitionsFields.tsx`, and the BG-only
     `CycleCrossfadeFields.tsx`.
141. `[FE]` Implement `apps/web/components/editor/inspector/PipPlacement.tsx`
     (shared with the upload modal — pull into
     `components/ui/pip/PipConfig.tsx` so neither owns the math).
142. `[QA]` Vitest: each inspector variant renders the right field set;
     `↑ CHANGE` opens the right modal; the Background `Cycle list` toggle
     reveals the playlist sub-field.

### 9.5 Editor modals

143. `[FE]` Implement `SubtitlesModal.tsx` per §4.1 driven by
     `useSubtitleConfig()` and `useSubtitlePreview()`.
144. `[FE]` Implement `ChangeBackgroundModal.tsx` per §4.2.
145. `[FE]` Implement `UploadToRangeModal.tsx` per §4.3 supporting both
     create and replace modes; reuse `AssetGrid`, `AssetCard`,
     `CompositingPicker`, and `PipConfig`.
146. `[FE]` Implement `apps/web/components/editor/AssetGrid.tsx` and
     `AssetCard.tsx` once and reuse from both modals.
147. `[BE]` `GET /editor/assets?project=<...>` listing files in
     `<project>/media/` with type (`IMG`/`MP4`), dimensions, and byte
     size.
148. `[BE]` `POST /editor/assets/import` — accepts a host-OS file path
     (or upload), copies into `media/`, and returns the new asset entry.
149. `[BE]` `POST /editor/subtitles` — persists the subtitle config and
     invalidates `.vc/subtitles.srt`.
150. `[QA]` Vitest: each modal renders the documented field set and
     options; `Apply`/`Save changes`/`Add to project` all dispatch the
     right backend calls; PiP-specific fields appear only when
     Compositing is `Picture-in-picture`.

### 9.6 Hotkeys + state

151. `[FE]` Implement `apps/web/lib/editor/useHotkeys.ts` covering §7,
     scoped to the editor route.
152. `[FE]` Implement the hooks listed in §8 under `apps/web/lib/editor/`
     and the helpers under `apps/web/lib/format/`.
153. `[QA]` Vitest: each hotkey triggers the documented action; hotkeys
     are no-ops while a modal is open except for `Esc` (which closes it).
154. `[QA]` Visual diff against the prototype at `1440×1000` and
     `1158×900`, dark and light themes, EN and 中文.

## 10. Acceptance For This Slice

- All visible copy resolves through `useTranslations()`. `en.json` and
  `zh.json` carry every key listed above; technical metadata stays
  language-neutral.
- No raw CSS, no `globals.css` rules added beyond the global tokens.
  Tailwind linter does not surface `suggestCanonicalClasses` for any new
  component.
- Helpers (`formatTimecode`, `formatRangeLabel`, `formatImageMeta`,
  `formatRelativeTime`, `truncateHash`, the global `request()` wrapper)
  are used exclusively — no inline `fetch()`, no hand-rolled timecode
  formatting, no copy of the PiP placement math between modal and
  inspector.
- The transcript context menu, all four modals, the layers popover, and
  the inspector switching all behave exactly as specified above.
- Search filters the transcript and scrolls so the first match is at the
  top of the visible area; Enter advances; Esc clears.
- `Save` is one-click; `Render Draft` is one-click and emits the
  `RenderStrip`; `Render Final` routes to `/render`. None of them open a
  modal.
- Hotkeys §7 work and respect input focus.
- Screenshot diff at 1440 and ~1160 px shows no structural drift; minor
  sub-pixel differences are acceptable.
