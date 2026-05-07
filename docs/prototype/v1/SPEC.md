# Editor — Interaction Specification

This document specifies how the Editor screen behaves. It is the source of truth for the prototype in `screens/editor.jsx` and related components. Anything the UI does not match here is a bug.

---

## 1. Mental model

A **project** is one voice recording + one transcript + a stack of **layers** that draw visual content on top of the audio.

```
                    ┌─────────────────────────┐
   render order  ▲  │  SUBTITLES              │  always present, always on top
   (top renders  │  ├─────────────────────────┤
    on top)      │  │  PiP · z3               │  optional, multiple allowed (z3, z4, z5…)
                 │  │  PiP · z2               │
                 │  ├─────────────────────────┤
                 │  │  FOREGROUND · z1        │  optional, multiple allowed
                 │  ├─────────────────────────┤
                 │  │  BACKGROUND · z0        │  optional, single layer, single item that fills the project duration
                 │  └─────────────────────────┘
```

- **SUBTITLES** is automatically derived from the aligned transcript. The user only edits style, not which sentences become cues.
- **BACKGROUND** holds one item that spans the whole timeline. While a foreground item is active, the background is hidden underneath.
- **FOREGROUND** items replace the background while they are active. Multiple FG layers can exist; the one with the highest z is drawn.
- **PiP** items overlay on top of FG/BG. Multiple PiP layers stack from z2 upward; higher z is drawn on top.

Layers are **created on demand**. They appear when the user assigns their first item; an empty FG or PiP layer is automatically deleted. SUBTITLES and BACKGROUND are special — they exist when needed, never auto-collapse.

---

## 2. Time, ranges, and the timeline

The user **never works in seconds**. Every assignment is anchored to a **sentence range** (`s6–s10`). The app converts that range to a time range under the hood using the WhisperX alignment.

- An item's start = `sentences[from-1].start`
- An item's end   = `sentences[to-1].end`
- The timeline is purely a visualization of these ranges + a way to fine-tune them by dragging clip edges.

### Stretching clips
- Each clip in the timeline has two grips (left + right edge).
- Dragging a grip changes the item's start or end **in seconds**, not by sentence boundary. This is how the user makes a visual scene cover only half a sentence.
- Constraints: `start ≥ 0`, `end ≤ project_duration`, `end − start ≥ 0.5s`.
- Stretching does NOT change `sentences[]`; that field still records the original anchor range. The Inspector shows the stretched time range alongside the sentence anchor.

### The playhead
- Click anywhere in the ruler/waveform to seek.
- The playhead snaps to whole frames at 30fps.
- Skip back / Skip forward jump to the previous/next item edge across all layers (FG + PiP), then to sentence boundaries.

---

## 3. Adding visual content

### 3.1 Right-click a sentence (primary path)
1. Right-click any sentence in the transcript, or click its `+` handle.
2. A small context menu appears: **Assign media to range…** / **Play from here**.
3. Choosing "Assign media to range…" opens the **Assign Media** modal pre-filled with `from = to = clicked sentence`.
4. The modal lets the user configure (in this order):
   - **Asset** — pick an image or video from the project's media library.
   - **Sentence range** — `from` and `to` numeric inputs. The modal previews the time span (`s6–s10 · 00:33–01:14 · 41.2s`) and lists the sentences inside it.
   - **Compositing** — Fullscreen or PiP.
   - **Layer** — drop into an existing FG/PiP layer of the matching kind, OR create a new layer (`+ Create new Foreground layer (z2)`).
   - **PiP placement** (only when comp = PiP) — 3×3 anchor grid + sliders for size %, corner radius px, opacity %.
   - **Motion** — None / Ken Burns subtle / Ken Burns strong / Zoom in / Zoom out / Pan left / Pan right.
   - **Easing** — linear / ease in / ease out / ease in-out. Disabled when motion = None.
   - **Transition in / out** — cut / fade 0.4s / slide left / slide right / dip to black.
5. Confirming creates a new item in the chosen layer (or a new layer of the right kind), selects it, and dismisses the modal.

### 3.2 Editing an existing item
- Click any clip in the timeline → it becomes selected and the **Inspector** shows its parameters.
- Inspector parameters are layer-kind aware:
  - **SUB** — burn-in toggle, font, size, position.
  - **BG** — asset (clickable to swap), cycle/hold, crossfade, motion.
  - **FG** — asset (clickable to swap), sentence range, motion + easing, transitions.
  - **PiP** — asset (clickable to swap), placement grid, size/radius/opacity, range, motion, transitions.
- Inspector edits apply **live** — no Save inside the inspector.
- Clicking the asset thumbnail in any inspector opens the Assign modal in **edit mode** so the user can pick a different asset (and optionally change other fields at the same time).

### 3.3 Adding/changing the background
- The **BG** button sits in the center of the editor toolbar, immediately after **Subtitles**.
- If no BG layer exists, the button reads **Add BG** and opens a modal restricted to: asset picker, motion, crossfade. Confirming creates the BG layer with one item spanning the whole project.
- If a BG layer exists, the button reads **Change BG** and opens the same modal in edit mode for that single item.
- The BG layer can be deleted from the inspector ("Remove background") or from the layers popover.

### 3.4 Subtitles
- The **Subtitles** button (also in the center of the editor toolbar) opens the Subtitles modal.
- The modal shows: a list of all auto-generated cues with timecodes, plus style controls (burn-in, font family, size, position, max chars per line, background style: none/shadow/box).
- The user **cannot manually concatenate cues**. Cues are derived from sentence boundaries automatically. To join two cues the user merges the underlying sentences upstream (out of scope for this prototype).

---

## 4. Layers panel (popover)

Opens from the **Layers · N** button under the preview. Lists every layer top→bottom in render order:

```
SUBTITLES         164 cues
PiP · z3          2 items
PiP · z2          1 item
FOREGROUND · z1   3 items     [trash]
BACKGROUND        1 item      [trash]
```

- Click a row → selects the first item in that layer and points the Inspector at it.
- The container scrolls when there are too many layers (max-height 360px).
- BG and FG/PiP layers have a trash icon to delete the whole layer (with confirmation).
- The **+ Add layer item** footer button opens the Assign modal pre-filled to the current sentence.

---

## 5. Preview controls (under the video)

A single horizontal strip directly under the preview, before the timeline:

```
[1080p] [720p] [9:16]    [Fit] [Actual]                        [Layers · 4]
```

- **Resolution** — 1080p (1920×1080), 720p (1280×720), 9:16 vertical (1080×1920). Switching changes the preview aspect ratio AND the eventual render output.
- **Fit / Actual** — Fit scales to viewport; Actual shows half the native pixel size for spot-checks.
- **Layers** — opens the layers popover described above.

The top editor toolbar holds only navigation, project title, and the **Subtitles** + **BG** + **Save** + **Render** buttons.

---

## 6. Toolbar layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [📁] Tokyo Essay  E:\…\tokyo-essay     [✏ Subtitles] [🖼 Add BG]    cache 24/24  [Save]  [Render Draft]  [Render Final] │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Left: open-folder + project title + path crumb.
- Center: **Subtitles** then **BG**. Both open modals.
- Right: status pill, Save, Render Draft, Render Final.

When **Render Draft** is in progress, a 28px accent-color progress bar sits directly below the toolbar (between toolbar and editor body), stretching edge-to-edge. See §9.1.

---

## 7. Keyboard shortcuts

- `Space` — play/pause.
- `←` / `→` — frame step (1/30 s).
- `Shift+←` / `Shift+→` — sentence step.
- `⌘F` / `Ctrl+F` — focus transcript search.
- `Backspace` / `Delete` — delete the selected item; if it was the last item in an FG/PiP layer the layer is removed too.
- `⌘Z` / `Ctrl+Z` — undo.

---

## 8. Persistence

- The project autosaves to disk every ~2 seconds when idle.
- Project state on disk is JSON (`<project>/project.json`); the alignment cache and pre-rendered clips live in `.vc/`.
- Re-recording the voice file invalidates the alignment but **preserves all sentence-anchored assignments**; only items whose anchor sentences disappear are flagged.

---

## 9. Render

There are two render paths: **Draft** (inline, lightweight) and **Final** (full pipeline).

### 9.1 Render Draft — inline progress
- Triggered by the **Render Draft** button in the editor toolbar.
- Does **not** navigate to the render screen. The user stays in the editor.
- A bold accent-color progress bar appears as a 28px row directly below the editor toolbar (between toolbar and editor body), stretching edge-to-edge.
- The bar fills left-to-right and is striped with a subtle moving highlight while active.
- Bar contents: status dot · stage label (`verifying cache` → `pre-rendering clips` → `building subtitles.srt` → `ffmpeg compose` → `muxing audio`) · percent · `Cancel` button.
- The Render Draft button itself becomes disabled while drafting and reads `Drafting · 42%`. Re-clicking is a no-op until the run completes or is cancelled.
- On completion the bar turns green, the label reads "Draft ready", and an `Open` button appears that takes the user to the render screen for playback. The bar auto-dismisses ~2.6s after completion if the user does nothing.
- Cancel removes the bar immediately and re-enables the button. Partial drafts are not retained.
- Output spec: 720p, fast preset, no AI re-encode of cached clips. Written to `<project>/.vc/drafts/<timestamp>.mp4`.

### 9.2 Render Final — render screen
- Triggered by the accent **Render Final** button (and from the `Open` action on a finished draft).
- Navigates to the dedicated **Render** screen.
- The render screen shows a multi-stage pipeline (verify cache → pre-render clips → build subtitles.srt → ffmpeg compose → mux → log to history).
- The user can cancel; partial renders go to history as `*.partial` and are excluded from "play locally" buttons.
- Output spec: 1080p (or whatever resolution is active), x264 slow, CRF 18.

---

## 10. Design system

The interface is built on a token-only system. Components reference tokens — never raw values. The full set is documented and rendered live on the **Tokens** screen (top-nav entry), which reads tokens from the live `:root` so it stays in sync with `styles.css`.

### 10.1 Color tokens

All color is defined in OKLCH. Tokens live on `:root` in `styles.css`; light theme overrides at `:root[data-theme="light"]`.

| Token | Role |
|---|---|
| `--bg-0` … `--bg-5` | Surface ramp — canvas → active fills |
| `--text` … `--text-4` | Text ramp — primary → disabled |
| `--line`, `--line-soft` | Borders, inner dividers |
| `--amber`, `--amber-bg`, `--amber-line` | Accent / now / active (playhead, selected clip, brand) |
| `--blue`, `--blue-bg` | Info |
| `--green`, `--green-bg` | Ok / cached / draft-complete |
| `--red`, `--red-bg` | Error |
| `--violet`, `--violet-bg` | PiP layer chips |

Accent hues all share chroma 0.13 so they read at the same visual weight. Never mix two semantic colors on the same surface.

### 10.2 Type tokens

Two faces: `--font-sans` (Inter Tight) for UI/prose, `--font-mono` (JetBrains Mono) for timecodes, paths, and any column of numbers that must align.

| Role | Size · weight |
|---|---|
| Display | 32px · 700 |
| H1 (screen title) | 24px · 700 |
| H2 (modal title) | 16px · 600 |
| Body | 13px · 400 |
| Caption | 11px · 500 |
| Eyebrow / label | 11px · 600 · uppercase · 0.06em |
| Mono · TC | 13px · 500 mono |
| Mono · meta | 10.5px · 400 mono |

### 10.3 Spacing

4px base unit. Allowed values: 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 56. Component padding picks from this scale; freestyle values are not allowed.

### 10.4 Radii

| Token | Use |
|---|---|
| `--r-xs` (4px) | Inputs, asset thumbs |
| `--r-sm` (6px) | Buttons, cards |
| `--r` (8px) | Default panels |
| `--r-md` (12px) | Modals, large panels |
| 999px | Pills (tags, dot indicators, round buttons) |

### 10.5 Shadows

| Token | Use |
|---|---|
| `--shadow-1` | Floating popovers, layer menu |
| `--shadow-2` | Modals (deeper drop) |

Inline cards stay flat (no shadow).

### 10.6 Components

The Tokens screen renders live samples for: Buttons (`primary`, `accent`, default, `ghost`, `xs`, `sm`, `iconbtn`); status tags (idle / info / ok / warn / err) with colored dots; form fields; keyboard hints (`.kbd`); and layer chips (SUB / PiP / FG / BG) using their reserved hues.
