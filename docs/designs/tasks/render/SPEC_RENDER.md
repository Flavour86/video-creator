# Video Creator Spec - Render

Parent spec index: [SPEC.md](../../SPEC.md).

## Render Page

### Visual Truth
![dark](../../visuals/render-dark.png)
![light](../../visuals/render-light.png)

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

## API Surface Required By Prototype

Render:

- `DELETE /projects/:projectId/render/:renderId` 
- `GET /projects/:projectId/history`
- `DELETE /projects/:projectId/history/:renderId`
- `GET /projects/:projectId/render/:renderId` play the rendered video
- WebSocket for render queue data status updating.

## Edge Cases And Boundary Conditions

Render:

- Start render with cold cache.
- Start multiple renders: backend queues them.
- Cancel queued render.
- Cancel active render.
- ffmpeg exits non-zero.
- Output file already exists.
- Final render finishes but DB insert fails.
- DB history row exists but output file missing.
- User closes browser during render.
- Sidecar dies during render.
- Render log grows large.
- After-render actions requested before done.

## Testing Strategy

### Frontend unit/component tests (Vitest + Testing Library)

Render page:

- Header renders the `Render` eyebrow, title with resolution (for example `Tokyo Essay - 1080p final render`), `Back to editor`, and `Cancel render`.
- `Cancel render` covers queued/running renders, active-render confirmation, one cancel request, cancelling/cancelled UI states, `.partial` output handling, and render-history recording.
- Render progress card updates live: output filename (`.mp4`), specs string, status tag, big progress bar, percent complete, encode speed, ETA, and frames written.
- Stage label cycles through documented stages: queued -> verify alignment cache -> pre-render cached clips -> build `subtitles.srt` -> compose filtergraph -> mux MP4 with `+faststart` -> append render history to `app.db`.
- Render states render the correct label and visual: idle/no active job, queued, verifying cache, pre-rendering clips, building subtitles, composing, muxing, logging history, done, cancelling, cancelled, failed, output missing, partial output excluded, ffmpeg warning, ffmpeg fatal error, history empty.
- Render history shows only the current project's history with preset, resolution, duration, file size, status, and path.
- Output panel renders the resolved output specs string and final file size.
- After-render actions: `Play locally` is always present; `Reveal in Explorer` is rendered only when the backend exposes OS-file-manager invocation and is omitted otherwise.

Routing guards and render gating:

- `/render/:invalidProject/:render_id`, `/render/:projectId/:invalidRender`, and missing route segments redirect to Launcher.
- For a new project, Render is reachable immediately after alignment succeeds.
- For an already-rendered project, Render is reachable only when current config hash differs from the last successful render hash.

### Backend tests (pytest)

Render API surface:

- `POST /projects/:projectId/render?preset=draft|final&resolution=1920x1080|1280x720|1080x1920` accepts documented presets/resolutions and rejects unknown values.
- `DELETE /projects/:projectId/render/:renderId` cancels queued/running renders.
- `GET /projects/:projectId/history` returns only the current project's render history.
- `DELETE /projects/:projectId/history/:renderId` removes the selected history row according to persistence rules.
- `GET /projects/:projectId/render/:renderId` serves the rendered video.

`pipeline/render.py`:

- `1080p` preset emits a 1920x1080 16:9 H.264 MP4 with `+faststart`.
- `720p` emits 1280x720 16:9.
- `9:16` emits 1080x1920 vertical.
- Stages execute in order: queued -> verify alignment cache -> pre-render cached clips -> build `subtitles.srt` -> compose filtergraph -> mux MP4 with `+faststart` -> append `render_history`.
- Stage transitions and progress are emitted on the WS at the documented cadence.
- Cancellation from UI (queued or running) cleanly aborts the current stage and records a `cancelled` row in `render_history`.
- ffmpeg non-zero exit produces a `failed` `render_history` row and a `render_events` failure event.

Render persistence and logs:

- Every successful render produces consistent rows across `render_history`, `render_artifacts`, and `render_events`.
- Render artifacts can reopen ffmpeg logs.
- Missing output, partial output, ffmpeg warning, ffmpeg fatal error, and empty history states are covered.

### E2E / browser tests (Playwright + ffmpeg)

- **New-project happy path (`test01`, 4-step Setup, one-minute draft).** Launcher -> `New project` -> enter Project Name -> pick `720p` preset -> select the `test01` voice (`.wav`) -> `Generate subtitle` (panel reaches `succeeded`) -> pick the `test01` transcript + optional watermark -> run Alignment (panel reaches `succeeded`) -> `Create project` -> land in `/editor/:projectId` -> load/apply the `test01` media plan with multiple backgrounds, foreground clips, and PiP overlays active on the same timeline -> click `Draft render` -> draft render strip reaches 100% and a playable one-minute draft `.mp4` exists at `<project>/.vc/drafts/`.
- This journey is the canonical end-to-end render fixture and must exercise subtitle generation, subtitle alignment, multiple background assets, foreground, and PiP layers together.

- **Render correctness (frame/keyframe-level, draft preset).** Reuse the one-minute `test01` draft MP4 produced by the Launcher happy path; do not start a separate render unless that artifact is missing.
- Locate the latest successful `test01` draft artifact at `<project>/.vc/drafts/`; if absent, render it via `POST /projects/:projectId/render?preset=draft&resolution=1280x720`.
- Probe output with ffprobe: duration matches voice within 0.1 s, resolution is 1280x720, audio stream is present, container has `+faststart`.
- Parse `subtitles.srt` from `<project>/subtitles.srt`.
- For every cue: extract frame at `cue.start + 200 ms`, save the sampled frame as a test screenshot artifact, run OCR/text detection, and fuzzy-match against `cue.text` with similarity >= 0.85.
- For every foreground clip: compare perceptual hashes at `clip.start - 200 ms` vs `clip.start + 200 ms`, and at `clip.end - 100 ms` vs `clip.end + 200 ms`, confirming the layer appears and disappears.
- Repeat the same boundary checks for every PiP overlay; additionally assert each PiP renders inside its configured `posX/posY` 3x3 cell within edge-margin tolerance.
- Repeat boundary checks for background-layer transitions between auto-distributed background images or across a video-set -> black-fallback boundary.
- Capture screenshot artifacts for every key frame used by foreground, PiP, background-transition, subtitle, and watermark checks.
- If a watermark is configured, assert its region's mean pixel signature is present on every sampled frame.
- **Routing guards and render gating.** Invalid render route segments redirect to Launcher; a newly aligned project with no foreground/background/PiP renders successfully; Render button on an already-rendered project stays disabled until config hash changes.

### Visual parity tests

- Every Render screenshot embedded in this spec has exactly one parity test.
- Covered states include idle/no active job, queued, all active stages, done, cancelling, cancelled, failed, output missing, partial output excluded, ffmpeg warning, ffmpeg fatal error, history empty, after-render actions, and dark/light variants.

### Verification commands

```bash
pnpm test
pnpm lint
pnpm -F @vc/web test
pnpm -F @vc/server test
```

## Success Criteria

Phase 1 Render work is accepted when all items below hold.

### Functional Acceptance

- A new aligned project can be rendered immediately, even with no foreground, background, or PiP layers configured.
- Output for an empty visual configuration is voice + subtitles + optional watermark over the black fallback.
- An already-rendered project cannot be re-rendered until the current config hash differs from the last successful render config hash.
- The Render button reflects the hash-diff render-gating state.
- The Render page renders eyebrow + title (`<Project> - <Resolution> <preset> render`), `Back to editor`, `Cancel render`, live render card, and current-project render history.
- Live render card shows output filename `.mp4`, specs string, status tag, big progress bar, percent, encode speed, ETA, and frames written.
- Stages execute and surface in the UI in order: queued -> verify alignment cache -> pre-render cached clips -> build `subtitles.srt` -> compose filtergraph -> mux MP4 with `+faststart` -> append `render_history`.
- `Cancel render` cancels both queued and running renders cleanly: active renders ask for confirmation before preserving/removing partial output, one cancel request is sent, UI moves through cancelling/cancelled, partial files are removed, and the row is recorded as `cancelled`.
- After-render actions: `Play locally` is always present; `Reveal in Explorer` is rendered if and only if the backend supports invoking the OS file manager.
- Resolution presets produce correct outputs: `1080p` 1920x1080 16:9, `720p` 1280x720 16:9, `9:16` 1080x1920 vertical.
- Output MP4 includes the `+faststart` flag and passes a YouTube-equivalent upload check.
- Invalid or missing `:projectId` or `:render_id` route segments in `/render/:projectId/:render_id` redirect to Launcher.
- Render-route enabling follows the rules above: immediate for new aligned projects, hash diff required for already-rendered projects.

### Performance Targets

| Surface | Target |
| --- | --- |
| `720p` draft render on a 60-second fixture | <= 1.0x voice duration |
| `1080p` final render on a 60-second fixture | <= 2.5x voice duration |
| `9:16` vertical render on a 60-second fixture | <= 1.2x voice duration |
| WS render-progress event cadence | >= 1 event per second while rendering |

### Quality Gates

Render correctness, asserted by the frame/keyframe-level E2E journey:

- For every cue in produced `subtitles.srt`, the video frame at `cue.start + 200 ms` contains the cue text with OCR similarity >= 0.85 vs. `cue.text`.
- For every foreground clip, PiP overlay, and background layer in config, perceptual-hash diffs at start and end boundaries confirm the layer appears at `start_time` and disappears at `end_time`.
- Every PiP overlay renders inside its configured `posX/posY` 3x3 cell with edge-margin tolerance, and at `MC` with no edge margin.
- A configured watermark is detectable in every sampled frame.
- Screenshot artifacts exist for every key frame sampled by render-correctness E2E checks.
- Output resolution matches the requested preset and duration matches voice length within 0.1 s.
- Output MP4 includes `+faststart` and passes a YouTube-equivalent upload check.

Recoverability and errors:

- Killing mid-render leaves a `failed` row, or `cancelled` when user-initiated, in `render_history`.
- Mid-render failure leaves cleanable temp files.
- Subsequent renders succeed without manual cleanup.
- Render failure, ffmpeg error, disk full, and drive disconnect surface non-blocking recoverable UI errors with a clear next action.
- Render edge cases have matching tests: cold cache, multiple renders queued by backend, cancel queued render, cancel active render, ffmpeg non-zero exit, output file already exists, final render succeeds but DB insert fails, history row exists but output file missing, browser closes during render, sidecar dies during render, large render log, and after-render action requested before done.
- Render visual parity coverage exists for every embedded screenshot, render state, after-render action, and dark/light variant.
