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

## T5.1 — Drop image onto sentence range

### Goal
With one or more sentences selected in the transcript, the user clicks a thumbnail in the media library to assign that image as a foreground item covering the selected sentence range.

### Behavior
- Selection state is already tracked from T3.5.
- Media library shows clickable thumbnails. While a sentence range is selected, hovering a thumb says "Assign to sentences X–Y".
- Click → server adds a new entry to `layers.foreground[]`:
  ```json
  {
    "id": "fg-<random>",
    "z": 1,
    "anchor": "transcript",
    "sentences": [4, 5, 6],
    "media": "tokyo.jpg",
    "compositing": "fullscreen",
    "transition_in": { "kind": "fade", "duration_s": 0.4 },
    "transition_out": { "kind": "fade", "duration_s": 0.4 }
  }
  ```
- Foreground items appear in the preview canvas and timeline strip immediately (the preview already handles the layer model from T4.4 — it just needs to be passed the new project state).
- A foreground item can be deleted: hover its strip in the timeline → trash icon → DELETE → server removes from `layers.foreground[]`.

### API
- `POST /projects/<id>/layers/foreground` — body: foreground item JSON (server validates and assigns `id`, `z`).
- `DELETE /projects/<id>/layers/foreground/<fg_id>`.
- `PATCH /projects/<id>/layers/foreground/<fg_id>` — partial update (used in M6 for compositing/motion edits).

### Validation rules
- Two items with the same `z` must not have overlapping sentence ranges. Server returns `422 OVERLAP` if so.
- Sentences must exist in alignment (server checks against `.vc/alignment.json`).
- `media` must exist in `media/`.

### Files
- `apps/server/server/routes/foreground.py`.
- `apps/web/components/foreground-list/ForegroundList.tsx` — list view + delete.
- Edit `apps/web/components/timeline-strip/TimelineStrip.tsx` — add FG track.

### Verification

Manual:
1. Select sentences 5–7. Click an image thumb.
2. New strip appears in timeline at sentences 5–7.
3. Press play → at the time range covered, the image is shown in the preview.
4. Delete it → strip removed, preview reverts to BG.

### Commit
```
feat(web,server): foreground item assignment via sentence selection

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
- `preset: "draft"` → 1280×720, CRF 28, x264 ultrafast, AAC 128kbps.
- `preset: "final"` → 1920×1080, CRF 18, x264 slow, AAC 192kbps.
- Single-flight per project: concurrent calls return `409 RENDER_IN_PROGRESS`.
- `render_id` format: `r-<YYYY-MM-DD-HHmm>-<rand>`.
- Output path: `renders/<preset>-<YYYY-MM-DD-HHmm>.mp4` (relative to project dir).

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

## T5.5 — WebSocket render progress

### Goal
A WebSocket at `/projects/<id>/render/ws` streams progress events as ffmpeg runs. The UI subscribes during a render and shows a progress bar.

### Behavior

#### Server
- ffmpeg invoked with `-progress pipe:1`.
- A reader task parses key=value lines: `out_time_us`, `frame`, `speed`, `progress` (`continue` / `end`).
- Computes `percent = out_time_us / total_us`.
- Computes `eta_seconds` from `speed`.
- Pushes events to all connected WS clients of that project's render channel.

#### Event shape
Per `CONVENTIONS.md` §9:
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

#### Stages
- `cache_warm` — pre-rendering uncached clips. `percent` = clips_done / clips_total * 100.
- `compose` — main ffmpeg invocation. `percent` = video time / total.
- `muxing` — final tail (post-encode, container finalization). Briefly visible.
- `done` — emitted once with `output_path` field.
- `error` — emitted on any failure with `message`.

### Files
- `apps/server/server/routes/ws.py` — WebSocket route.
- `apps/server/server/pipeline/render.py` — emits events to a per-render `asyncio.Queue`.
- `apps/web/lib/hooks/useRenderProgress.ts` — subscribes to WS, returns progress state.
- `apps/web/components/render-status/RenderStatus.tsx` — progress bar UI.

### Verification

Manual:
1. Start a render.
2. UI shows progress bar updating ~2–5×/sec.
3. ETA decreases.
4. On completion: bar fills, "Done" message + link to output.
5. Cancel button (added in T5.6) terminates ffmpeg.

### Commit
```
feat(web,server): WebSocket progress for renders

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
