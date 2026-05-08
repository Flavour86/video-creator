# Milestone 5 — Foreground Items & First Render

> **Goal**: User can drop images onto sentence ranges to create foreground items. The system pre-renders each foreground item to a cached MP4 clip, then composes a final MP4 in a single ffmpeg invocation. Draft preset only.
>
> **This is the milestone that produces the first real video.**

---

## Tasks

| ID | Title | Time |
|---|---|---|
| T5.1 | Drop image onto sentence range (foreground item creation) | 90 min |
| T5.2 | Asset cache (per-clip pre-render) | 3 hours |
| T5.3 | Filtergraph builder | 3 hours |
| T5.4 | Compose endpoint (single ffmpeg invocation) | 2 hours |
| T5.5 | WebSocket render progress | 90 min |
| T5.6 | Render history UI | 60 min |

---

## T5.1 — Assign Media modal, Inspector panel, and Layers popover

### Goal
The user assigns images/videos to specific sentence ranges using the **Assign Media modal**. The assigned clips appear in the timeline and can be inspected and edited via the **Inspector panel**. All layers are managed via the **Layers popover**.

---

### 5.1-A — Assign Media modal

#### Trigger paths
1. **"+" button on a transcript sentence**: Each sentence row in the transcript panel has a button labelled "Assign media to this sentence". Clicking it opens the modal pre-filled with `from = to = clicked sentence index`.
2. **"+ Add layer item" in the Layers popover**: Opens the modal pre-filled to the current sentence.
3. **Clicking the asset thumbnail in the Inspector**: Opens the modal in edit mode for the selected item (allows changing asset and other fields).

#### Modal fields (in order)
1. **Asset** — scrollable media library grid (images and videos from `media/`). One selected at a time.
2. **Sentence range** — `From` and `To` number inputs (1-based). Below them, a live preview: `s6–s7 · 00:33–00:47 · 14.2s` and a list of the sentences in range. Changing the inputs updates the preview in real time using the alignment data.
3. **Compositing** — radio: **Fullscreen** (FG layer) or **Picture-in-Picture** (PiP layer).
4. **Layer** — dropdown listing existing layers of the matching kind (`Foreground · z1`, `PiP · z3`, …) plus `+ Create new Foreground layer (z2)`. Only layers of the chosen compositing kind are shown.
5. **PiP placement** — visible only when Compositing = PiP:
   - 3×3 anchor grid (click to set `posX`/`posY` — corners are 2/98, center is 50).
   - Size slider (10–80%, default 22%).
   - Corner radius slider (0–32 px, default 16).
   - Opacity slider (0–100%, default 90).
6. **Motion** — dropdown: `None — static`, `Ken Burns · subtle`, `Ken Burns · strong`, `Zoom in`, `Zoom out`, `Pan left`, `Pan right`. Default: `Ken Burns · subtle`.
7. **Easing** — dropdown: `linear`, `ease in`, `ease out`, `ease in-out`. Disabled when motion = None. Default: `ease in-out`.
8. **Transition In / Out** — two dropdowns: `cut`, `fade · 0.4s`, `slide left`, `slide right`, `dip to black`. Defaults: both `fade · 0.4s`.

#### Confirm action
- Creates a new item in the chosen layer (or a new layer of the correct kind if "Create new" was selected).
- Calls `PUT /projects/<id>/layers` with the updated layers array.
- Closes the modal, selects the new clip in the timeline, and opens the Inspector.

#### Validation
- Asset must be selected.
- `from ≤ to`, both within `[1, sentence_count]`.
- Two items in the same layer must not overlap by sentence range. Show inline error `"Overlaps with existing item in this layer"` if they do. The user must pick a different layer or range.

#### Files
- `apps/web/components/assign-modal/AssignModal.tsx`
- `apps/web/lib/hooks/useAssignModal.ts` — open/close state + pre-fill values.

---

### 5.1-B — Inspector panel

The Inspector is a right-side panel that shows editable properties of the **currently selected timeline clip**. Selecting a clip in the timeline (click) opens the Inspector for that item.

#### Inspector is layer-kind aware:

**FG item Inspector:**
- Asset thumbnail (clickable → re-opens Assign modal in edit mode for asset pick).
- Sentence range display: `s6–s7 · 00:33–00:47`. `From` / `To` number inputs.
- "Stretch" hint: `drag clip edges in timeline ↗` (the time-precise start/end is set by dragging).
- Motion kind dropdown + easing dropdown (same options as modal).
- Transition In / Transition Out dropdowns (same options as modal).
- **Delete item** button (removes item from layer; if last item in FG/PiP layer, deletes the layer).

**PiP item Inspector:**
- Same as FG plus the PiP placement controls (3×3 grid, size, radius, opacity sliders).

**BG item Inspector:**
- Asset thumbnail (clickable → re-opens BG modal).
- Motion kind.
- Crossfade slider (0–2 s).
- **"Remove background"** button (deletes the `"bg"` layer entirely).

**SUB Inspector:**
- Burn-in toggle.
- Font family dropdown, size slider.
- Position: `bottom-center` / `top-center`.
- Max chars per line number input.
- Background style: `none` / `shadow` / `box`.

#### Inspector edits apply immediately — no Save button inside the Inspector. Each change calls `PUT /projects/<id>/layers` and updates the Zustand store.

#### Files
- `apps/web/components/inspector/Inspector.tsx`
- `apps/web/lib/hooks/useSelectedClip.ts` — tracks `{ layerId, itemId } | null`.

---

### 5.1-C — Layers popover

Opens from the **"Layers · N"** button beneath the preview (where N is total item count across all layers). Lists all layers in render order, top to bottom:

```
SUBTITLES         164 cues
PiP · z4          2 items
PiP · z3          1 item
Foreground · z1   3 items     [trash]
Background        1 item      [trash]
```

- Clicking a row selects the first item in that layer and opens the Inspector.
- Trash icon on BG and FG/PiP layers: deletes the entire layer (with a confirmation dialog).
- **"+ Add layer item"** button at the bottom: opens the Assign modal pre-filled to the current sentence.
- Max height 360px; scrolls when there are many layers.

#### Files
- `apps/web/components/layers-popover/LayersPopover.tsx`

---

### API (all layer mutations share one endpoint)

`PUT /projects/<id>/layers` — body: `{ layers: Layer[] }`. Replaces the full layers array. Server validates, writes `project.json`, returns `{ layers }`.

There are no separate POST/DELETE/PATCH per item. The frontend always sends the complete updated layers array. This keeps the server simple and the client as the single source of truth for layer state during a session.

### Validation (server-side)
- All `mediaId` values must exist in `media/`.
- Within each layer, no two items may have overlapping `[start, end]` ranges.
- `sentences[0] ≤ sentences[1]`, both within `[1, sentence_count]`.
- A `"bg"` layer has exactly one item.
- A `"sub"` layer has exactly one item with `auto: true`.

### Verification

Manual:
1. Click "+" on sentence 6. Assign Modal opens with `from=6, to=6`.
2. Pick an image. Set range to 6–7. Compositing: Fullscreen. Layer: `Foreground · z1`. Motion: `Ken Burns · subtle`. Confirm.
3. A new clip block appears in the `Foreground · z1` timeline track at the correct position.
4. Click the clip → Inspector opens showing `s6–s7` range and motion settings.
5. Change motion to `Zoom in` in Inspector → timeline clip label updates, preview uses new motion.
6. Open Layers popover → `Foreground · z1  1 item` is listed.
7. Delete item from Inspector → clip removed from timeline; layer removed (was the only item).
8. Press play → at sentences 6–7, the foreground image shows; otherwise BG shows.

### Commit
```
feat(web,server): assign media modal, inspector panel, layers popover

Refs: T5.1
```

---

## T5.2 — Asset cache (per-clip pre-render)

### Goal
For each foreground item (and the auto-distribute layer's items), pre-render a self-contained MP4 clip combining `(media, duration, motion, transitions, target_resolution, target_fps)` into a hash-keyed file under `.vc/clips/<hash>.mp4`. Reuse on subsequent renders.

### Behavior

#### Hash key
```python
hash_input = json.dumps({
    "media_sha256": sha256_of_file(media_path),
    "duration_s": duration_s,
    "motion": motion_dict_or_none,
    "transition_in": ti_or_none,
    "transition_out": to_or_none,
    "resolution": "1280x720" or "1920x1080",
    "fps": 30,
    "format_version": 1,  # bump if encoder defaults change
}, sort_keys=True).encode()
key = sha256(hash_input).hexdigest()
```

#### Per-clip ffmpeg command (still image, with Ken Burns + fade in/out)
```
ffmpeg -y \
  -loop 1 -i <image> -t <duration> \
  -filter_complex "
    [0:v]scale=<W>*1.5:<H>*1.5,
         zoompan=z='if(lte(zoom,1.0),1.0,zoom-0.0005)+0.001':
                d=<duration*fps>:
                s=<W>x<H>:fps=<fps>,
         fade=t=in:st=0:d=<fade_in_s>,
         fade=t=out:st=<duration-fade_out_s>:d=<fade_out_s>,
         format=yuv420p
  " \
  -c:v libx264 -g 1 -keyint_min 1 -preset ultrafast -crf <crf> \
  <output>.mp4
```

(Adjust `zoompan` parameters per `motion.from`/`motion.to`; if `motion` is null, just scale + pad.)

#### Per-clip ffmpeg command (video clip input)
For a video, the input changes (`-i <video>` without `-loop`), and `zoompan` is replaced with `scale` + `crop` to fit aspect.

### Files
- `apps/server/server/pipeline/cache.py` — extend with `clip_cache_key()`, `clip_cache_path()`, `is_cached()`.
- `apps/server/server/pipeline/clip_render.py` — `render_clip(item, project, output_path) -> Path`.

### Storage
- Hash as filename: `.vc/clips/<sha256[:16]>.mp4`. Truncated to 16 chars to keep paths short.
- A sidecar `.json` with the original key components (for debugging cache misses).

### Tests
`apps/server/tests/test_clip_cache.py`:
- Hash determinism (same input → same key).
- Hash sensitivity (any change → different key).
- `is_cached` correctly reports state.

(Render integration test gated on `VC_INTEGRATION=1`.)

### Verification

Manual:
1. Trigger a clip render (will be wired up in T5.4 — for this task, write a one-off script to call `render_clip` on a single item).
2. First call: ffmpeg runs, clip appears in `.vc/clips/`.
3. Second call: instant return, no re-encode.
4. Change duration → new hash, new clip.

### Commit
```
feat(server): asset cache with content-addressed clip pre-render

Refs: T5.2
```

---

## T5.3 — Filtergraph builder

### Goal
A pure function: `build_compose_command(project, alignment, output_path, preset) -> list[str]` returns the ffmpeg argv to compose the final video from `voice.wav` and the cached clips.

### Behavior

#### Inputs
- `voice.wav` (always input 0).
- One `-i <clip>` per cached foreground/auto-distribute clip.
- Watermark image if present.

#### Filtergraph structure
1. Black canvas at output resolution and audio duration: `color=black:s=WxH:r=fps:d=<voice_duration>`.
2. Layer 1 (auto-distribute) overlays: per-segment `overlay=enable='between(t, t1, t2)'`.
3. Layer 2 (foreground) overlays: same pattern, in z-order.
4. Watermark overlay (M6).
5. Subtitles `subtitles=path='<srt>'` filter (M6).
6. Audio: pass-through `voice.wav` audio with `aformat`.

#### For Phase 1 (no PiP, no transitions yet — those are M6)
Simplest filtergraph:
```
[0:v] color=black:s=1280x720:r=30:d=DURATION [bg]
[bg][1:v] overlay=enable='between(t,T1_START,T1_END)':eof_action=pass [v1]
[v1][2:v] overlay=enable='between(t,T2_START,T2_END)':eof_action=pass [v2]
...
[v_final] format=yuv420p [vout]
```
Audio:
```
[0:a] aformat=sample_rates=48000:channel_layouts=stereo [aout]
```

### Files
- `apps/server/server/pipeline/filtergraph.py` — pure builder.

### Tests
`apps/server/tests/test_filtergraph.py`:
- Empty foreground → just black + audio.
- One foreground item → produces one overlay clause with correct timestamps.
- Two non-overlapping items → two overlays.
- Z-order preserved.

### Verification
```powershell
pnpm -F @vc/server test
```

### Commit
```
feat(server): ffmpeg filtergraph builder for compose pipeline

Refs: T5.3
```

---

## T5.4 — Compose endpoint

### Goal
`POST /projects/<id>/render` with body `{ preset: "draft" | "final" }` performs the complete render:
1. Ensures alignment is current.
2. Builds the list of unique `(item, target_resolution)` cache entries.
3. Pre-renders any missing cached clips (T5.2).
4. Builds the filtergraph (T5.3).
5. Spawns ffmpeg, captures `-progress pipe:1` output.
6. Writes the result to `renders/<preset>-<timestamp>.mp4`.
7. Records the render in `render_history`.
8. Returns `200 { render_id, output_path }` (or `400/422/500` with reasons).

### Behavior
- `preset: "draft"` → 1280×720, CRF 28, x264 ultrafast, AAC 128kbps. Written to `<project>/.vc/drafts/<timestamp>.mp4`.
- `preset: "final"` → 1920×1080, CRF 18, x264 slow, AAC 192kbps. Written to `<project>/renders/<timestamp>.mp4`.
- Single-flight per project: concurrent calls return `409 RENDER_IN_PROGRESS`.
- `render_id` format: `r-<YYYY-MM-DD-HHmm>-<rand>`.

**Important**: `preset: "draft"` is triggered from the editor toolbar and does **not** navigate away from the editor. `preset: "final"` is triggered from the Render screen (T6.1) and runs there. The endpoint is shared; the distinction is in how the UI handles the response.

### Files
- `apps/server/server/routes/render.py`.
- `apps/server/server/pipeline/render.py` — orchestrates cache warm + ffmpeg invocation.
- `apps/server/server/db/renders.py` — render_history CRUD.

### Verification

Manual:
1. Create a project with 1 BG + 3 foreground items at sentence ranges.
2. Run alignment.
3. Click "Render Draft" (UI added in T5.5/T5.6; for now, hit the endpoint via curl).
4. ≤ 5 minutes (per CONVENTIONS §14 budget).
5. Output MP4 exists, plays correctly: BG fills the gaps, FG items appear at their ranges, audio is intact.

### Commit
```
feat(server): /render endpoint orchestrating cache + ffmpeg compose

Refs: T5.4
```

---

## T5.5 — WebSocket render progress + Render Draft inline UI

### Goal
A WebSocket at `/projects/<id>/render/ws` streams progress events as ffmpeg runs. The **Render Draft** path shows progress inline in the editor (the user stays on the Editor screen). The **Render Final** path shows progress on the dedicated Render screen (T6.1).

### Server

- ffmpeg invoked with `-progress pipe:1`.
- A reader task parses key=value lines: `out_time_us`, `frame`, `speed`, `progress` (`continue` / `end`).
- Computes `percent = out_time_us / total_us`, `eta_seconds` from `speed`.
- Pushes events per `CONVENTIONS.md` §9 to all WS clients subscribed to that `render_id`.

### Event shape (unchanged — from CONVENTIONS.md §9)
```json
{
  "type": "progress",
  "render_id": "r-...",
  "stage": "cache_warm" | "compose" | "muxing" | "done" | "error",
  "percent": 42.7,
  "eta_seconds": 480,
  "current_frame": 12345,
  "speed": "1.2x",
  "message": null
}
```

### Render Draft — inline editor progress bar

When the user clicks **"Render Draft"** in the editor toolbar:
1. Editor calls `POST /projects/<id>/render` with `preset: "draft"`. Response: `{ render_id, output_path }`.
2. Editor subscribes to the WS. A **28px accent-color progress bar** appears as a full-width row directly below the editor toolbar (between toolbar and editor body), pushing content down slightly.
3. Bar fills left-to-right. Contents: `● verifying cache → pre-rendering clips → ffmpeg compose → muxing audio` stage label · `42%` · `Cancel` button.
4. The **Render Draft** button becomes disabled and reads `Drafting · 42%`.
5. On `stage: "done"`: bar turns green, label reads "Draft ready", an `Open` link appears that navigates to the **Render screen** for playback. Bar auto-dismisses after 2.6 s if untouched.
6. Cancel: calls `DELETE /projects/<id>/render/<render_id>`, removes bar, re-enables button. Partial draft is discarded.

### Files
- `apps/server/server/routes/ws.py` — WebSocket route.
- `apps/server/server/pipeline/render.py` — emits events to a per-render `asyncio.Queue`.
- `apps/web/lib/hooks/useRenderProgress.ts` — subscribes to WS, returns `{ stage, percent, eta }`.
- `apps/web/components/render-draft-bar/RenderDraftBar.tsx` — the inline progress bar rendered inside the Editor layout, conditionally visible when a draft render is active.

### Verification

Manual:
1. Click "Render Draft".
2. Progress bar appears below toolbar. Stage label and % update ~2–5×/sec.
3. On completion: bar goes green, "Draft ready · Open" link visible.
4. Click "Open" → navigates to Render screen.
5. Click "Cancel" mid-render → bar disappears, "Render Draft" button re-enables.

### Commit
```
feat(web,server): WebSocket render progress + inline Render Draft bar

Refs: T5.5
```

---

## T5.6 — Render history UI

### Goal
Editor page shows the list of past renders with output path, preset, duration, and timestamp. Clicking opens the file in the OS file browser.

### Behavior
- `GET /projects/<id>/renders` returns `render_history` rows for that project.
- UI shows last 10 by default, "Show all" expands.
- Each row: preset badge, timestamp, duration, file size, "Open" button.
- "Open" calls server endpoint `POST /projects/<id>/renders/<render_id>/reveal` which opens the file's containing folder using the OS shell (`explorer` on Windows, `open` on macOS, `xdg-open` on Linux).

### Files
- `apps/web/components/render-history/RenderHistory.tsx`.
- `apps/server/server/routes/render.py` — add list and reveal endpoints.

### Verification

Manual:
1. After a successful render, history row appears.
2. Click "Open" — file browser opens at `renders/`.
3. Render again — new row at top.

### Commit
```
feat(web,server): render history list with reveal-in-folder

Refs: T5.6
```

---

## Milestone 5 verification (smoke project end-to-end)

The first time the system produces a real, watchable video:

1. Create a clean project at `C:\tmp\smoke-render`.
2. Drop in:
   - A 60-second `voice.wav` (record yourself reading 8–10 sentences).
   - `transcript.txt` matching the recording.
   - 5 images.
3. Run alignment.
4. Set image #1 as BG.
5. Drop image #2 onto sentence 2.
6. Drop image #3 onto sentences 4–5.
7. Drop image #4 onto sentence 7.
8. Drop image #5 onto sentence 9.
9. Click "Render Draft".
10. ≤ 5 min: get a draft MP4.
11. Open it: audio matches transcript, BG shows during gaps, FGs show at their ranges.
12. Edit one FG (move to a different sentence range).
13. Click "Render Draft" again → should complete in ≤ 2 min (cache hits on unchanged clips).

When all 13 pass, **Phase 1 has delivered its core value**. M6 is polish.
