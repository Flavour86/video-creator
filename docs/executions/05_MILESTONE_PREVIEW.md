# Milestone 4 — In-Browser Preview

> **Goal**: Build the live preview surface. Audio plays in real time alongside a waveform; sentence boundaries are visible; assigned media swaps on schedule. No ffmpeg involvement — pure browser rendering. This is the user's primary feedback loop.

---

## Tasks

| ID | Title | Time |
|---|---|---|
| T4.1 | WaveSurfer integration | 90 min |
| T4.2 | Transcript ↔ waveform sync | 60 min |
| T4.3 | Layer 1 auto-distribute (single image) preview | 60 min |
| T4.4 | In-browser preview player (image swap on timestamp) | 90 min |
| T4.5 | Timeline strip with thumbnails | 90 min |

---

## T4.1 — WaveSurfer integration

### Goal
Embed a WaveSurfer 7 waveform of the project's `voice.wav` in the editor. Plays/pauses with a button. Shows current time. Server streams the audio file via `GET /projects/<id>/audio`.

### Behavior
- Load `wavesurfer.js` (peer dep already in `apps/web/package.json`).
- WaveSurfer instance:
  - container: a div in the editor.
  - height: 80px.
  - waveColor: tailwind slate-400.
  - progressColor: tailwind sky-500.
  - cursorColor: tailwind sky-700.
  - normalize: true.
  - barWidth: 2, barGap: 1.
- Controls: play/pause button, current time / total time display.
- Server endpoint streams the file with proper `Content-Type` (audio/wav) and `Accept-Ranges: bytes` for seeking.

### Files
- `apps/web/components/preview-player/Waveform.tsx`.
- `apps/server/server/routes/media.py` — add `GET /projects/<id>/audio`.

### Verification

Manual:
1. Open a project with audio.
2. Waveform renders within 2 seconds.
3. Play button starts audio + cursor moves.
4. Click on waveform seeks audio.
5. Time display updates ≥ 10 Hz.

### Commit
```
feat(web,server): WaveSurfer integration with streamed audio

Refs: T4.1
```

---

## T4.2 — Transcript ↔ waveform sync

### Goal
Bidirectional sync: clicking a sentence in the transcript seeks the waveform; the current-playing sentence is highlighted in the transcript and the waveform shows sentence-boundary tick marks.

### Behavior
- WaveSurfer regions plugin: one region per sentence, very subtle (transparent fill, thin top border).
- Hovering a sentence in the transcript highlights its region.
- When playback time enters a sentence, that sentence's row scrolls into view (smooth) and gets a "now playing" border.
- Clicking a sentence: `wavesurfer.setTime(sentence.start_s)`.

### Files
- Edit `apps/web/components/preview-player/Waveform.tsx`.
- Edit `apps/web/components/transcript-panel/TranscriptPanel.tsx`.
- New: `apps/web/lib/hooks/usePlaybackTime.ts` — RAF-driven `currentTime` state.

### Verification

Manual:
1. Click a mid-transcript sentence → waveform jumps to its start.
2. Press play → that sentence highlights when playing reaches it.
3. Sentences before it have not-yet-played styling.

### Commit
```
feat(web): transcript ↔ waveform bidirectional sync

Refs: T4.2
```

---

## T4.3 — Background layer setup and preview

### Goal
The user assigns a single image or video as the background — a `"bg"` layer that fills the canvas whenever no foreground item is visible. This is the first content assignment in the editor.

### Behavior
The editor toolbar has an **"Add or change background asset"** button (center of toolbar, between a Subtitles button and Save). When clicked:
- If no `"bg"` layer exists in `layers[]`: opens the **BG modal** in add mode. Fields: asset picker (images and video from `media/`), motion kind, crossfade duration. Confirming appends a new `"bg"` layer to `layers[]` with one item covering `sentences: [1, total_sentences]`, `start: 0`, `end: project_duration_s`.
- If a `"bg"` layer exists: opens the **BG modal** in edit mode, pre-filled with current values. Confirming replaces the `"bg"` layer's single item.

After assigning, the preview canvas shows the background image/video continuously.

### API
`PUT /projects/<id>/layers` — replaces the full `layers` array. Used for all layer mutations throughout the app. Server validates the array structure, writes `project.json`, returns the saved layers.

### Files
- `apps/server/server/routes/projects.py` — add `PUT /projects/<id>/layers` endpoint.
- `apps/web/components/bg-modal/BgModal.tsx` — modal for add/change BG.
- `apps/web/lib/hooks/useProject.ts` — Zustand store holding `{ project, layers, sentences }`. All UI mutations call the API then update the store optimistically.

### Verification

Manual:
1. Open a project with alignment done.
2. Click "Add BG". Pick an image. Confirm.
3. Preview shows the image filling the canvas continuously.
4. `project.json` has a `layers` array containing one `{ kind: "bg" }` entry.
5. Click "Change BG". Switch asset. Preview updates immediately.
6. Reload — background persists.

### Commit
```
feat(web,server): background layer add/change via BG modal

Refs: T4.3
```

---

## T4.4 — In-browser preview player

### Goal
A `<canvas>` (or layered `<img>`) above the waveform that, at every animation frame, evaluates `display_at(currentTime)` and shows the right visual.

### Behavior
- 16:9 aspect, fits available width (max 960px in editor).
- Falls through layers per `PHASE_1_DESIGN.md` §6 resolution rule.
- Fades and crossfades approximated with CSS `opacity` transitions.
- PiP (later) approximated with `position: absolute` + transform.
- Watermark (later) overlaid as `<img>`.

### Files
- `apps/web/components/preview-player/PreviewPlayer.tsx`.
- `apps/web/lib/preview/resolveDisplay.ts` — pure function `(project, time) => DisplaySpec`.

### Resolve function

The resolver walks the `layers[]` array (which is in render order, top → bottom) and determines what to draw at the given time. It returns a `DisplaySpec`:

```ts
type PipPlacement = { posX: number; posY: number; size: number; radius: number; opacity: number };

type DisplaySpec = {
  // One entry per visible layer, bottom of stack first (drawn in order)
  bg?: { mediaId: string; opacity: number };
  fg: Array<{ mediaId: string; compositing: "fullscreen"; opacity: number }>;
  pip: Array<{ mediaId: string; placement: PipPlacement; opacity: number }>;
  watermark?: { mediaId: string; posX: number; posY: number; scale: number; opacity: number };
  subtitle?: { text: string };
};
```

Resolution rule for a given `currentTime`:
1. Walk the `layers[]` array from last (BG) to first (SUB).
2. For each `"bg"` layer: its single item always covers the full duration → include it.
3. For each `"fg"` or `"pip"` layer: find the item where `item.start <= currentTime < item.end` (if any) → include it.
4. Transitions (fade in/out) are approximated with CSS `opacity` based on how far into the item's `start`/`end` the current time falls.
5. Subtitles: find the alignment sentence whose `[start_s, end_s]` contains `currentTime` → pass its text as `subtitle.text`.

The resolver is a **pure function** — no side effects. The preview component calls it on every animation frame.

### Verification

Manual:
1. Set background image.
2. Press play → image displays.
3. Pause/scrub → image displays at all times.

### Commit
```
feat(web): in-browser preview player with display-at resolver

Refs: T4.4
```

---

## T4.5 — Timeline with layer tracks

### Goal
A multi-track timeline below the preview shows the visual schedule for every layer. In M4, BG and Subtitles tracks are visible; FG and PiP tracks appear in M5 as items are added.

### Layout (matches the prototype)

```
[ruler: timecodes at regular intervals — 00:00  02:05  04:11 ...]
[Subtitles row  | s1 | s2 | s3 … s21 |  (sentence chips, non-editable in M4) ]
[PiP rows       |                     |  (empty until M5)                      ]
[Foreground rows|                     |  (empty until M5)                      ]
[Background row | ████████████████████|  (full-width BG thumbnail if set)      ]
```

The timeline header shows: fps (`30 fps`), total clip count, cache status pill (`cache N/N`).

### Behavior
- **Ruler**: time markers at regular intervals, scaled to the project duration. Click anywhere → seek playhead.
- **Playhead**: vertical amber line that tracks `currentTime`. Moves on play and on click.
- **Sentence chips** (Subtitles row): one chip per sentence (`s1`, `s2`, …), width proportional to sentence duration. Non-interactive in M4 (clicking them is implemented in M5 via the "Assign media" flow).
- **Background row**: if a `"bg"` layer exists, renders one full-width block with the asset's thumbnail gradient. Clicking anywhere on it seeks.
- **Clip blocks** (FG/PiP rows, added in M5): colored blocks whose width = `(end - start) / project_duration * timelineWidth`. Clicking selects the clip and shows the Inspector.
- The timeline has a shared horizontal scroll when project duration is long.

### Files
- `apps/web/components/timeline/Timeline.tsx` — container; renders ruler + one `<TimelineTrack>` per layer in render order.
- `apps/web/components/timeline/TimelineTrack.tsx` — single layer row with clip blocks.
- `apps/web/components/timeline/TimelineRuler.tsx` — ruler with time markers.

### Verification

Manual:
1. After T4.3 (BG set), the Background row shows a full-width block.
2. Subtitles row shows sentence chips with correct relative widths.
3. Clicking the ruler at any point moves the playhead and seeks audio.
4. Timeline resizes with the window.

### Commit
```
feat(web): multi-track timeline with ruler, sentence chips, and BG row

Refs: T4.5
```

---

## Milestone 4 verification

End-to-end:

1. Open a project with voice + transcript + 5 images, alignment done.
2. Set one image as the BG.
3. Press play.
4. Confirm:
   - Audio plays.
   - Waveform cursor advances.
   - Transcript scrolls to current sentence.
   - Preview canvas shows the BG image continuously.
   - Timeline strip shows the BG.
5. Click a sentence mid-transcript → waveform + audio + preview all jump there.

When all pass, mark M4 complete.
