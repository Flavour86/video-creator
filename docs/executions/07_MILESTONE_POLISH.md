# Milestone 6 — Polish

> **Goal**: Add the features that turn the working render pipeline from M5 into a YouTube-publishable tool. Each task is independent — they can be done in any order if needed, but the listed order is the recommended one.

---

## Tasks

| ID | Title | Time |
|---|---|---|
| T6.1 | Final render preset (1080p CRF 18) | 30 min |
| T6.2 | Subtitle SRT generation | 90 min |
| T6.3 | Subtitle burn-in toggle | 60 min |
| T6.4 | Auto-distribute multi-image | 90 min |
| T6.5 | Auto-distribute clips with black-tail fallback | 60 min |
| T6.6 | Watermark layer | 60 min |
| T6.7 | Time-pinned override (`anchor: "time"`) | 90 min |
| T6.8 | PiP compositing mode | 2 hours |
| T6.9 | Configurable transitions | 2 hours |

---

## T6.1 — Render Final screen + final preset

### Goal
Wire the `final` preset (1080p / CRF 18 / x264 slow / AAC 192 kbps / `+faststart`) and implement the dedicated **Render screen** where Final renders run and render history is shown.

### Render Final flow
- Clicking **"Render Final"** in the editor toolbar navigates to `/render?project=<path>`.
- The **Render screen** (tab: Render) starts `POST /projects/<id>/render` with `preset: "final"` automatically on arrival if no render is already in progress.
- The Render screen shows:
  - **Multi-stage pipeline** with individual stage rows: `verifying cache` · `pre-rendering clips` · `building subtitles.srt` · `ffmpeg compose` · `muxing audio`. Each row shows a spinner / checkmark / error icon.
  - A progress bar + percent + ETA below the stage list.
  - A **Cancel** button. Cancelled renders go to history as `*.partial` (not playable).
  - On completion: a **Play** button that opens the output file, or an **Open folder** button.
- Cache keys include resolution and CRF — Final and Draft caches are fully independent.

### Render history
Below the active render, a list of past renders for this project:
- Columns: preset badge (`DRAFT` / `FINAL`), timestamp, duration, file size, status.
- **Open** button reveals the file in Explorer/Finder.
- **Play** button (if file exists): calls server to open in the OS default player.
- Partial renders are labelled `partial — not playable`.

### API additions
- `GET /projects/<id>/renders` — returns render history rows.
- `POST /projects/<id>/renders/<render_id>/reveal` — shell-opens the containing folder.

### Files
- `apps/web/app/(app)/render/page.tsx` — Render screen.
- `apps/web/components/render-pipeline/RenderPipeline.tsx` — stage rows + progress bar.
- `apps/web/components/render-history/RenderHistory.tsx` — history list.
- `apps/server/server/routes/render.py` — add list + reveal endpoints.
- `apps/server/server/db/renders.py` — render_history CRUD.

### Verification

Manual:
1. Assign items, click "Render Final" → navigated to Render screen.
2. Pipeline stages check off one by one.
3. Output: 1080p MP4. Verify:
   ```powershell
   ffprobe -v error -show_streams renders/final-*.mp4 | Select-String "width|height|codec_name"
   ```
4. History row appears. "Open" reveals the file.
5. Upload to YouTube → ingests cleanly, no re-encode warnings.
6. Time budget: cache-cold ≤ 25 min; cache-hit ≤ 8 min.

### Commit
```
feat(server,web): render screen with Final preset, pipeline view, and history

Refs: T6.1
```

---

## T6.2 — Subtitle SRT generation

### Goal
Generate a subtitle file `.vc/subtitles.srt` from `alignment.json`. Always generated. Source-of-truth for text is the user's transcript; timing comes from word-level alignment.

### Behavior
- Chunker rules (per design §8):
  - ≤ 42 chars per line, ≤ 2 lines per cue.
  - ≤ 7 seconds per cue.
  - Splits prefer punctuation > clause boundaries (commas, semicolons) > word boundaries; never mid-word.
- Each cue's start/end pulled from word-level timestamps.
- Cue numbering 1-based.
- SRT format: standard, UTF-8, no BOM, CRLF line endings (most players accept either; CRLF is safer).
- Regenerated on alignment cache invalidation.

### Files
- `apps/server/server/pipeline/srt.py` — `generate_srt(alignment) -> str`.
- Hook into the alignment endpoint: after computing alignment, also write `subtitles.srt`.

### Tests
`apps/server/tests/test_srt.py`:
- A 3-sentence alignment with a long sentence produces multi-cue output.
- No cue exceeds 42 chars / 7 seconds.
- Cue numbers are 1-based, contiguous.
- Timestamps are formatted `HH:MM:SS,mmm` (note the comma — SRT spec).

### Verification

Manual:
1. Run alignment.
2. `Get-Content C:\tmp\smoke-render\.vc\subtitles.srt | Select-Object -First 10` shows valid SRT.
3. Open the SRT in a media player alongside the voice file → captions sync.

### Commit
```
feat(server): SRT generation from alignment with cue chunker

Refs: T6.2
```

---

## T6.3 — Subtitle burn-in toggle

### Goal
A per-project setting `subtitles.burn_in` (default `false`). When `true`, the final ffmpeg compose adds a `subtitles=` filter that burns the SRT into the video.

### Behavior
- UI: a toggle in the editor sidebar labeled "Burn subtitles into video".
- Server: when `subtitles.burn_in == true`, append `,subtitles='<path>':force_style='Fontname=...,...'` to the video filter chain.
- Default style (Phase 1, hardcoded — Phase 3 makes this configurable):
  - Fontname: Arial.
  - Fontsize: 28.
  - PrimaryColour: white (`&H00FFFFFF`).
  - OutlineColour: black (`&H00000000`).
  - BorderStyle: 1 (outline + drop shadow).
  - Outline: 2.
  - Shadow: 1.
  - Alignment: 2 (bottom-center).
  - MarginV: 60.

### Files
- Edit `apps/server/server/pipeline/filtergraph.py`.
- `apps/web/components/subtitle-toggle/SubtitleToggle.tsx`.

### Verification

Manual:
1. Toggle on, render Final.
2. Output video has clean white-on-black-outline captions at the bottom.
3. Toggle off, render Final → no captions.
4. SRT file always exists either way.

### Common failures
- **Subtitle filter fails with "Cannot open"**: ffmpeg requires forward-slash paths and escaped colons on Windows. Use `subtitles='C\:/path/file.srt'` style.
- **Garbled text**: SRT was written without UTF-8 BOM but ffmpeg expects one in some configs. Try writing with UTF-8 BOM.

### Commit
```
feat(server,web): subtitle burn-in toggle with default style

Refs: T6.3
```

---

## T6.4 — Background layer: multi-image rotation

### Goal
The BG layer supports multiple images that rotate evenly across the project duration, with configurable crossfade between them.

### Behavior
- The BG modal (from T4.3) gains a **multi-asset picker**: the user can add more than one image, drag to reorder. A `crossfade` slider (0–2 s) sets the transition between each image.
- The server stores this as a single `"bg"` layer with **multiple items** (one per image). Each item's `start`/`end` is computed as `slot_duration = project_duration_s / image_count`.
- The filtergraph concatenates the pre-rendered BG clips sequentially, inserting a crossfade between each pair.
- Cache hashing per BG item is already compatible (each item is hashed independently on its `mediaId`, `duration`, `motion`, `crossfade`).

### Files
- Edit `apps/web/components/bg-modal/BgModal.tsx` — add multi-asset list + drag-reorder + crossfade slider.
- Edit `apps/server/server/pipeline/filtergraph.py` — BG layer can now have N items instead of 1.
- Edit `apps/server/server/pipeline/clip_render.py` — no changes needed (already handles per-item render).

### Verification

Manual:
1. In BG modal, add 3 images. Set crossfade to 0.6 s.
2. Preview shows them rotating across the duration.
3. Render → output MP4 has smooth crossfades between BG images.

### Commit
```
feat(server,web): multi-image background layer with crossfade rotation

Refs: T6.4
```

---

## T6.5 — Background layer: video clip with black-tail fallback

### Goal
The BG layer supports video clips as the background asset. If the clip is shorter than the project, the remainder shows black (with foreground items still visible on top).

### Behavior
- In the BG modal, the user can pick a **video** from `media/`. The server probes its duration with `ffprobe`.
- If `clip_duration < project_duration`: the BG item covers `[0, clip_duration]`; the remaining time `[clip_duration, project_duration]` has no BG — black shows underneath any FG/PiP items.
- The video plays through once; it does not loop.
- Motion (Ken Burns etc.) is not applied to video BG items — only scale/crop to fit canvas.

### Files
- Edit `apps/server/server/pipeline/clip_render.py` — video-input branch for BG clips.
- Edit `apps/server/server/pipeline/filtergraph.py` — BG segment ends at `clip_duration`, not `project_duration`.

### Verification

Manual:
1. Pick a video clip (e.g. 30 s) as BG for an 80 s project.
2. Render → seconds 0–30 show the video; seconds 30–80 show black with FG items.

### Commit
```
feat(server,web): video clip background with black-tail fallback

Refs: T6.5
```

---

## T6.6 — Watermark layer

### Goal
A persistent watermark image overlays the entire video at a configurable position, scale, and opacity.

### Behavior
- UI: dedicated "Watermark" panel. Pick image (from `media/`), position (9-grid: top/center/bottom × left/center/right), scale (0.05–0.30), opacity (0–1).
- Server: prepend to filtergraph just before the final output. Implemented as the final overlay stage (above subtitles? Actually — design §6 puts watermark **above** subtitles — confirm with §6 of the design doc).
- Per design §6: watermark is the topmost layer. Subtitles are below it. So filtergraph order: ... → subtitles → watermark.

### Files
- `apps/web/components/watermark-panel/WatermarkPanel.tsx`.
- Edit `apps/server/server/pipeline/filtergraph.py`.

### Verification

Manual:
1. Pick a logo image, position bottom-right, scale 0.08, opacity 0.6.
2. Preview shows the watermark.
3. Render → watermark visible, doesn't obscure subtitles.

### Commit
```
feat(server,web): persistent watermark overlay

Refs: T6.6
```

---

## T6.7 — Time-pinned override

### Goal
Foreground items can use `anchor: "time"` with explicit `from`/`to` strings (HH:MM:SS.mmm). They bypass alignment.

### Behavior
- UI: when creating a foreground item, the user can switch from "Anchor to sentences" to "Pin to time range" before assigning.
- Time-pinned items don't shift if alignment changes.
- The UI shows them on the timeline with a different border color (e.g., amber) so the user can tell them apart at a glance.
- Validation: `from < to`, `0 ≤ from`, `to ≤ audio_duration`.

### Files
- Edit `apps/web/components/foreground-list/ForegroundList.tsx`.
- Edit `apps/server/server/routes/foreground.py`.
- Edit `apps/server/server/pipeline/filtergraph.py` — already produces `between(t, t1, t2)` overlays from a resolved range; no change needed once the resolver in T5.3 handles both anchors.

### Verification

Manual:
1. Add a time-pinned item at 1:00–1:15 with an image.
2. Re-record voice (significantly different timing).
3. Re-run alignment.
4. Time-pinned item still appears at 1:00–1:15. Sentence-anchored items shift accordingly.

### Commit
```
feat(server,web): time-pinned foreground anchor

Refs: T6.7
```

---

## T6.8 — PiP compositing mode (render support)

### Goal
PiP items are already creatable via the Assign modal (T5.1) and visible in the preview. This task wires PiP into the ffmpeg render pipeline so they appear correctly in the output MP4.

### PiP item data model (reminder)
```json
{
  "id": "pip-001", "mediaId": "callout-map.png",
  "sentences": [6, 7], "start": 36.0, "end": 44.0,
  "motion": { "kind": "none", "easing": "linear" },
  "transitions": { "in": "fade", "out": "fade" },
  "pip": { "posX": 2, "posY": 2, "size": 30, "radius": 12, "opacity": 100 }
}
```

- `posX` / `posY`: 0–100, percentage of canvas. `posX=2, posY=2` = top-left corner. `posX=98, posY=2` = top-right.
- `size`: % of canvas width. `size=30` on a 1920-wide canvas = 576 px wide.
- `radius`: corner radius in px (applied with a rounded-mask filter).
- `opacity`: 0–100.

### Behavior
- The PiP clip is pre-rendered like FG clips (cached to `.vc/clips/<hash>.mp4`) but with additional overlay geometry baked into the cache key.
- Rounded corners: pre-bake an alpha mask using ffmpeg's `geq` filter to create a rounded rectangle mask, then apply `alphamerge` / `format=yuva420p`. Output is a VP9 clip with alpha (not H.264, which doesn't support alpha).
- The filtergraph overlays each PiP clip at the correct canvas position using `overlay=x=<posX_px>:y=<posY_px>:enable='between(t,start,end)'`.
- Opacity: applied with `colorchannelmixer=aa=<opacity/100>` before the overlay.
- Z-order: PiP layers with higher z-index appear later in the filtergraph (drawn on top). Array order drives this — PiP layers at lower array index are drawn later (on top).

### Files
- Edit `apps/server/server/pipeline/clip_render.py` — PiP render branch: scale to `size`% of canvas width, apply rounded-corner alpha mask, encode as VP9 with alpha.
- Edit `apps/server/server/pipeline/filtergraph.py` — overlay PiP clips in z-order after FG overlays, before subtitles and watermark.
- Edit `apps/web/lib/preview/resolveDisplay.ts` — already returns `pip[]` array; confirm `posX`/`posY`/`size`/`opacity` are being used for the preview CSS positioning.

### Verification

Manual:
1. Open a project with a PiP item at `posX=98, posY=2, size=22` (top-right corner).
2. Render Draft.
3. Output: PiP image appears at top-right with rounded corners, BG visible through the rest of the frame.
4. Opacity 50% → PiP is semi-transparent in output.

### Common failures
- **Rounded corners appear square in render**: alpha path not used. Check that the PiP clip is encoded as VP9 (`libvpx-vp9`) with the `yuva420p` pixel format.
- **PiP position offset from preview**: `posX`/`posY` in the preview is CSS percentage of a scaled container; in ffmpeg it must be converted to absolute pixels of the output canvas.

### Commit
```
feat(server,web): picture-in-picture compositing mode

Refs: T6.8
```

---

## T6.9 — Configurable transitions

### Goal
Each FG and PiP item supports five transition options for both `in` and `out`: `cut`, `fade`, `slide_left`, `slide_right`, `dip_black`. The UI dropdowns are already wired by T5.1. This task wires them into the render pipeline.

### Transition options (match prototype exactly)
| Value | Description |
|---|---|
| `cut` | Instant — clip appears/disappears with no transition |
| `fade` | Alpha fade over 0.4 s |
| `slide_left` | Clip slides in from right / exits to left |
| `slide_right` | Clip slides in from left / exits to right |
| `dip_black` | Fade to black then fade in (for in) or fade to black (for out) |

### Render implementation
- **`cut`**: no filter added. Clip simply starts/ends at its `start`/`end` time.
- **`fade`**: baked into the cached clip (already in T5.2's `fade=t=in:st=0:d=0.4` / `fade=t=out`). Cache key includes `transition_in`/`transition_out` values.
- **`slide_left` / `slide_right`**: applied at the **compose stage** (filtergraph), NOT pre-baked, because the slide offset depends on canvas size. Use a time-varying `overlay=x=` expression:
  - Slide-in from right: `overlay=x='if(lt(t-START, 0.4), W*(1-(t-START)/0.4), 0)'`
  - Slide-out to left: `overlay=x='if(gt(t, END-0.4), -W*((t-(END-0.4))/0.4), 0)'`
- **`dip_black`**: two-phase fade on top of the clip — compose a black overlay that fades out (in) or fades in (out) over 0.4 s.

### Cache key note
`slide_left`/`slide_right`/`dip_black` transitions do **not** change the cached clip — they are applied at compose time. Only `fade` is baked. The cache key still includes `transition_in`/`transition_out` to future-proof it (a `fade` cached clip cannot be reused as `cut`).

### Files
- Edit `apps/server/server/pipeline/clip_render.py` — fade baking only.
- Edit `apps/server/server/pipeline/filtergraph.py` — slide and dip_black overlay expressions.

### Verification

Manual:
1. Set one foreground to slide-from-right, fade-out.
2. Preview approximates it (CSS transform).
3. Render → smooth slide-in, fade-out at the end.
4. Toggle to cut/cut → instant on/off.

### Commit
```
feat(server,web): configurable transitions (cut/fade/slide)

Refs: T6.9
```

---

## Milestone 6 verification (Phase 1 acceptance)

This is the Phase 1 "done" check from `00_OVERVIEW.md` §2. Run the canonical 10-step acceptance test on the user's machine, with a real 15-minute video script:

1. ✅ `npx -y .` (or `pnpm launch`) opens the browser.
2. ✅ Create a project, drop in 15-min `voice.wav` + `transcript.txt` + 30+ images.
3. ✅ Alignment completes within budget.
4. ✅ Assign foreground items to sentence ranges (~30 of them).
5. ✅ Configure: BG = 4 rotating images, watermark = logo, subtitles burn-in = on.
6. ✅ Render Draft → ≤ 5 minutes.
7. ✅ Render Final → ≤ 25 minutes.
8. ✅ Output MP4 plays correctly.
9. ✅ Upload to YouTube → ingests without complaints.
10. ✅ Edit one item, re-render Final → ≤ 5 minutes.

When all 10 pass, mark M6 complete and **Phase 1 ships**.

Update `STATE.md`:
- All M0–M6 tasks → `[x]`.
- Add a Notes log entry: "Phase 1 complete on YYYY-MM-DD. Acceptance test passed."

---

## After Phase 1

The next phase is documented separately (not in this guide). Per `PHASE_1_DESIGN.md` §15, Phase 2 adds:
- AIProvider adapter (Fal / Modal).
- Image generation, image-to-video.
- LoRA training and character-consistent inference.
- TTS integration.

All Phase 2 work must run on **online serverless GPUs** — never on the local machine — per the user's design decision.

A separate `docs/executions/PHASE_2_*.md` set of guides will be authored when Phase 1 is shipped and proven.
