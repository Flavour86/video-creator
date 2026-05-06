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

## T4.3 — Layer 1 auto-distribute (single image)

### Goal
A user can pick one image as the "auto-distribute single image" — it shows whenever no foreground item is active. For Phase 1, this is the simplest auto-distribute kind. Multi-image and clip variants come in M6.

### Behavior
- A small "Background" panel above the transcript shows the current auto-distribute image (or "None").
- Click "Set background" → media picker (lists current `media/` images) → choose one.
- Saving updates `project.json`:
  ```json
  "layers": {
    "auto_distribute": {
      "kind": "single_image",
      "items": ["bg.jpg"],
      "transition": "cut",
      "transition_duration_s": 0
    }
  }
  ```

### API
- `PATCH /projects/<id>` with a JSON Patch (RFC 6902) or just a delta over the layers. For simplicity in Phase 1: full replacement of the `layers` object via `PUT /projects/<id>/layers`.

### Files
- `apps/server/server/routes/projects.py` — add layers PUT.
- `apps/web/components/background-picker/BackgroundPicker.tsx`.
- `apps/web/lib/hooks/useProject.ts` — Zustand store for current project state.

### Verification

Manual:
1. Pick an image as background.
2. `project.json` updates correctly.
3. Reload — background persists.

### Commit
```
feat(web,server): single-image auto-distribute background

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
```ts
type DisplaySpec = {
  background?: { src: string; opacity: number };
  foreground: Array<{ src: string; compositing: "fullscreen" | { mode: "pip"; ... }; opacity: number }>;
  watermark?: { src: string; ... };
  subtitle?: { text: string };
};
```

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

## T4.5 — Timeline strip with thumbnails

### Goal
A thin horizontal strip beneath the waveform shows the *visual schedule* — what's on screen at every moment. For now, just the auto-distribute image stretched across the full duration. M5 adds foreground items.

### Behavior
- Same time-axis as waveform (synced).
- Track 1: "BG" — strip of images.
- Each slot is clickable → seeks to that time.
- Hovering shows time tooltip.

### Files
- `apps/web/components/timeline-strip/TimelineStrip.tsx`.

### Verification

Manual:
1. After T4.3, the BG track shows a single full-width thumbnail.
2. Clicking any X position seeks the waveform.
3. Strip resizes correctly with window resize.

### Commit
```
feat(web): timeline strip with BG track

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
