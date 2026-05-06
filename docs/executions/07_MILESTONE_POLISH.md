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

## T6.1 — Final render preset

### Goal
Wire the `final` preset through the entire pipeline. When the user clicks "Render Final", the result is 1080p / CRF 18 / x264 slow / AAC 192 kbps / MP4 with `+faststart`.

### Behavior
- The compose command from T5.4 already accepts a `preset` arg. Switch between draft and final settings.
- Cache keys include resolution and CRF — final and draft caches are independent.
- The UI now has two render buttons: "Render Draft" and "Render Final".

### Verification

Manual:
1. Render Draft on the smoke project → 720p MP4.
2. Render Final on the same project → 1080p MP4.
3. Verify with `ffprobe`:
   ```powershell
   ffprobe -v error -show_streams renders/final-*.mp4 | Select-String "width|height|codec_name|bit_rate"
   ```
4. Upload the Final output to YouTube. It should ingest without re-encode warnings.
5. Time budget: cache-cold ≤ 25 min; cache-hit ≤ 8 min.

### Commit
```
feat(server,web): final render preset (1080p CRF 18)

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

## T6.4 — Auto-distribute multi-image

### Goal
Auto-distribute supports `kind: "images"` with multiple items. They're divided evenly across the audio duration with crossfade transitions between them.

### Behavior
- UI: background panel now supports adding multiple images in order. Drag to reorder.
- Server: when computing the auto-distribute schedule, `slot_duration = audio_duration_s / len(items)`. Each slot gets a clip rendered with the configured `transition` ("crossfade" or "cut") and `transition_duration_s`.
- Asset cache hashes already include item-level info; multi-item just produces multiple cached clips.
- Filtergraph adds the auto-distribute clips as Layer 1 overlays. They run in sequence and fall through to black at the start (briefly during fade-in if the first item fades in).

### Files
- Edit `apps/web/components/background-picker/BackgroundPicker.tsx`.
- Edit `apps/server/server/pipeline/filtergraph.py`.
- Edit `apps/server/server/pipeline/clip_render.py`.

### Verification

Manual:
1. Pick 3 images for auto-distribute.
2. Preview shows them rotating evenly through the duration.
3. Render → output MP4 has the same rotation with smooth crossfades.

### Commit
```
feat(server,web): auto-distribute multi-image with crossfades

Refs: T6.4
```

---

## T6.5 — Auto-distribute clips with black-tail fallback

### Goal
Auto-distribute supports `kind: "clips"`. Clips concatenate sequentially. If their total duration is less than the audio, the trailing gap shows the universal black fallback (Layer 0).

### Behavior
- Probe each clip's duration with `ffprobe`.
- Compute schedule: clip 1 covers `[0, d1]`, clip 2 covers `[d1, d1+d2]`, etc.
- Whatever time remains after the last clip ends → the auto-distribute layer simply has nothing scheduled there. Layer 0 (black) is visible. Foreground items still appear normally.
- Each clip is added to the cache with its native motion (no Ken Burns); transitions between clips per the `transition` setting.

### Files
- Edit `apps/server/server/pipeline/clip_render.py` — clip-input branch.
- Edit `apps/server/server/pipeline/filtergraph.py`.

### Verification

Manual:
1. Pick 2 clips totaling 30 seconds for an 80-second voice.
2. Render → seconds 0–30 show clips, seconds 30–80 show black (with foregrounds where assigned).

### Commit
```
feat(server,web): auto-distribute clips with black-tail fallback

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

## T6.8 — PiP compositing mode

### Goal
A foreground item can use `compositing: { mode: "pip", position, offset_x, offset_y, scale, border_radius }` to overlay as picture-in-picture instead of replacing the full screen.

### Behavior
- UI: per-foreground-item dropdown switching "Full screen" / "Picture-in-picture". When PiP, show controls for position (9-grid), scale (0.10–0.50), offset, border radius (px).
- Preview: PiP shown via absolutely-positioned scaled `<img>`. The underlying layers (auto-distribute, lower-z foreground) keep displaying.
- Render: filtergraph constructs a sub-clip for the PiP item with rounded corners (use `geq` filter or pre-mask), then overlays it at the configured position.
- Z-order matters: a fullscreen item at higher z covers a PiP at lower z. A PiP at higher z overlays whatever's below.

### Files
- Edit `apps/web/components/foreground-list/`.
- Edit `apps/web/lib/preview/resolveDisplay.ts`.
- Edit `apps/server/server/pipeline/clip_render.py` — PiP clips need transparency-aware encoding for the rounded corners (use `format=yuva420p` then composite with alpha).
- Edit `apps/server/server/pipeline/filtergraph.py`.

### Verification

Manual:
1. Set a foreground item to PiP, top-right, scale 0.3.
2. Preview shows the PiP.
3. Render → PiP visible in MP4 with the BG showing through the rest of the frame.

### Common failures
- **Rounded corners are square**: alpha-aware path not used. Use `libvpx-vp9` for the cached PiP clip (with alpha) or pre-bake alpha mask via `geq`.
- **PiP scale wrong**: confirm scale is interpreted as fraction-of-canvas, not absolute pixels.

### Commit
```
feat(server,web): picture-in-picture compositing mode

Refs: T6.8
```

---

## T6.9 — Configurable transitions

### Goal
Each foreground item supports configurable `transition_in` and `transition_out`: `cut`, `fade`, or `slide` (with direction). Default: fade 0.4s in/out.

### Behavior
- UI: per-item dropdowns for in and out, with optional direction for slide.
- Cache key already includes transitions (T5.2).
- Render:
  - `cut`: zero-duration; clip just appears/disappears.
  - `fade`: alpha fade applied at clip boundaries (already in T5.2's example command).
  - `slide`: clip enters from the specified edge using `overlay` with a time-varying x/y expression (e.g., `overlay=x='if(lt(t,0.3), W*(1 - t/0.3), 0)'` for slide-from-right).
- Slide is more complex and applied at the *compose* stage (filtergraph), not pre-baked into the cache, because positioning depends on canvas size. **However**, fade is baked into the cached clip per T5.2 — so the cache key's transition_in/out pertains to fade only. Slide is recomputed in the filtergraph using the original cache.

### Files
- Edit `apps/server/server/pipeline/clip_render.py` — handle fade.
- Edit `apps/server/server/pipeline/filtergraph.py` — handle slide at compose stage.
- UI: `apps/web/components/transition-picker/TransitionPicker.tsx`.

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
