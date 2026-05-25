# QA Test Plan — Video Creator

Owner: QA (manual browser-driven session, Chrome MCP)
Spec basis: `docs/designs/SPEC.md` + `tasks/launcher/SPEC_LAUNCHER.md` + `tasks/editor/SPEC_EDITOR.md` + `tasks/render/SPEC_RENDER.md`
Date: 2026-05-24
Bug log target: `docs/designs/bugs/BUG-NNN-<slug>.md` (one file per defect)

---

## 1. Scope & Strategy

This plan exercises the three primary product pages (Launcher/Setup, Editor, Render) plus cross-cutting flows that span them (reopen, recovery, navigation guards, theme/i18n, persistence, undo/redo, performance spot checks). Execution is manual browser-driven against a live `pnpm dev` instance via Chrome MCP. Every assertion below maps to a SPEC clause; the spec is authoritative when in conflict with the screenshots (per open-question 2026-05-22).

Out of scope: backend-only behaviors not surfaced through the UI, prototype-only screens (Tokens), CI-only quality gates.

## 2. Environment & Prerequisites

| Item | Value |
| --- | --- |
| OS | Windows 11 Pro |
| Node | 22.x |
| pnpm | 10.x |
| Python | 3.11 |
| ffmpeg | 6+ (libx264, libass, libfreetype) |
| Web | `pnpm dev` → http://localhost:3000 |
| API | FastAPI on dev port from `pnpm dev` |
| App DB | `%APPDATA%/videocreator/app.db` (fresh + seeded baselines) |
| Projects root | `{root}/projects/` |
| Fixture | `test01` (voice `.wav`, transcript `.txt`, watermark optional, media plan with backgrounds/foreground/PiP) |
| Browser | Chrome (MCP-controlled), 1440×900 dark + light |
| Locales | Default + at least one alternate from i18n catalog |

Pre-flight checks before each session:
1. `pnpm install`, `pnpm gen:types`, `pnpm gen:py` complete cleanly.
2. `ffmpeg -version` confirms required encoders.
3. `app.db` is empty for "empty recents" cases, seeded for "populated recents" cases.
4. Browser localStorage/sessionStorage cleared between independent flows.

## 3. Visual Parity Inventory

Every screenshot embedded in a SPEC must have a parity assertion (per SPEC_*.md "Visual parity tests"). Comparison: side-by-side capture of the live page vs the reference PNG; treat SSIM ≥ 0.98 as parity (per open-question 2026-05-19 Option 1). Any divergence beyond crisp text antialiasing is filed as a bug.

### 3.1 Launcher / Setup (12)
- `Launcher-dark.png`, `Launcher-light.png` — populated recents
- `Launcher-play-dark.png`, `Launcher-play-light.png` — thumbnail play modal
- `Setup-dark.png`, `Setup-light.png` — initial setup
- `Setup-dark-srt.png`, `Setup-dark-srt-running.png`, `Setup-dark-srt-failed.png` — subtitle generate states
- `Setup-dark-alignment.png`, `Setup-dark-alignment-selected.png`, `Setup-dark-alignment-running.png`, `Setup-dark-alignment-success.png` — alignment states
- Implicit: empty-recents state (no reference PNG; assert empty-state copy + `New project` only)

### 3.2 Editor (18)
- `editor-dark.png`, `editor-light.png` — main editor
- `editor-draft-render-strip-dark.png`, `editor-draft-render-strip-light.png` — draft strip
- `editor-transcript-1.png` — shift-click contiguous selection
- `editor-transcript-2.png` — right-click context menu
- `editor-transcript-3.png` — sentence merge
- `editor-preview-dark.png`, `editor-preview-light.png` — preview surface
- `editor-preview-1.png` — 9:16 aspect
- `editor-preview-popover.png` — Layers popover
- `editor-timeline-dark.png`, `editor-timeline-light.png` — timeline
- `editor-inspector-dark.png`, `editor-inspector-light.png` — inspector (PiP per open-question 2026-05-20)
- `editor-inspector-1.png` — background inspector
- `editor-inspector-2.png` — foreground inspector
- `AssignModal.png`, `AssignModal-light.png`, `AssignModal-light-1.png` — assign modal
- `change-background-light.png` — background modal
- `SubtitleModal.png` — subtitles modal

### 3.3 Render (2)
- `render-dark.png`, `render-light.png` — Render page; assert per written spec text where screenshots drift (filename `.mp4`, 7 stages incl. queued, separate codec/bitrate fields, Output before Render history, slash title `Project / 1080p final render`).

### 3.4 Shell (2)
- `shell-dark.png`, `shell-light.png` — global app shell chrome.

---

## 4. Test Suite — Launcher & Setup

Each case: `LNCH-NN | Title | Spec ref | Preconditions | Steps | Expected | Severity-on-fail`.

| ID | Title | Spec ref | Severity | Result |
| --- | --- | --- | --- | --- |
| LNCH-01 | Empty recents → Setup entry | SPEC_LAUNCHER Flow 1 | high | ⚠️ PARTIAL |
| LNCH-02 | Populated recents sort by `last_render_at` desc | SPEC_LAUNCHER Interaction §2/3, root §projects | high | ⚠️ PARTIAL |
| LNCH-03 | Recent card fields: thumb, name, voice duration, sentence count, media count, no raw path | SPEC_LAUNCHER Interaction §2 | high | ❌ FAIL BUG-001 BUG-002 |
| LNCH-04 | Status tags render: unrendered, queued, rendering, rendered, failed, cancelled | SPEC_LAUNCHER Launcher states | medium | ❌ FAIL BUG-001 |
| LNCH-05 | Hide last-render time + status tag when absent | SPEC_LAUNCHER Interaction §2 | medium | ✅ PASS |
| LNCH-06 | Deterministic 3-color placeholder thumb when no render | SPEC_LAUNCHER Thumbnail rules | medium | ✅ PASS |
| LNCH-07 | Thumb play icon opens modal with playable video | SPEC_LAUNCHER Thumbnail rules | high | ✅ PASS |
| LNCH-08 | Pagination changes visible set, ordering preserved | SPEC_LAUNCHER Flow 2 | medium | ⚠️ PARTIAL (only 1 project in DB; 7+ needed to exercise page 2) |
| LNCH-09 | Card body click navigates to `/editor/:projectId` | SPEC_LAUNCHER Interaction §1, root routing | critical | ✅ PASS |
| LNCH-10 | Corrupt/missing project config row is auto-deleted | SPEC_LAUNCHER Launcher states | high | ✅ PASS (re-verified 2026-05-25: corrupt rows auto-deleted from both projects+project_configs tables on Launcher load; see BUG-018 fixed) |
| LNCH-11 | No visible top nav bar | root §Routing rules | high | ✅ PASS |
| LNCH-12 | Setup four-step layout, all unchecked, `Create project` disabled | SPEC_LAUNCHER Flow 3 step 2 | critical | ✅ PASS |
| LNCH-13 | Step 1 project name + preset (`720p` / `1080p (Final)` / `9:16`) | SPEC_LAUNCHER Setup | high | ✅ PASS |
| LNCH-14 | Voice blob upload (≤10 MiB single, >10 MiB split, ≤20 MiB even split) | open-question 2026-05-15 + 2026-05-16 | high | ⚠️ PARTIAL |
| LNCH-15 | Subtitle Generate status cycle `ready → running → succeeded/failed` (HTTP + UI) | SPEC_LAUNCHER + open-question 2026-05-15 | high | ✅ PASS |
| LNCH-16 | Alignment status cycle `ready → running → succeeded/failed` | SPEC_LAUNCHER Flow 3/4 | high | ✅ PASS |
| LNCH-17 | Setup Flow 5: voice change resets subtitle+alignment | SPEC_LAUNCHER Flow 5 | high | ✅ PASS |
| LNCH-18 | Setup Flow 5: transcript change resets only alignment | SPEC_LAUNCHER Flow 5 | high | ✅ PASS |
| LNCH-19 | Watermark optional; Setup completes without it | SPEC_LAUNCHER Flow 3 | medium | ✅ PASS |
| LNCH-20 | Unsupported voice file type → recoverable error, step stays unchecked | SPEC_LAUNCHER Flow 4 | high | ⚠️ PARTIAL |
| LNCH-21 | `Cancel` from Setup returns to Launcher, no `POST /projects` | SPEC_LAUNCHER Flow 1 | high | ✅ PASS |
| LNCH-22 | `Create project` enabled only after step 4 success | root routing rules | critical | ⚠️ PARTIAL |
| LNCH-23 | `POST /projects` sourced from completed Setup draft (no legacy path/name) | open-question 2026-05-15 | critical | ⚠️ PARTIAL |
| LNCH-24 | Setup → Editor navigation on create | SPEC_LAUNCHER Flow 3 step 8 | critical | ⚠️ PARTIAL |
| LNCH-25 | Setup blob-first: client never sends absolute filesystem paths | open-question 2026-05-15 | critical | ✅ PASS |
| LNCH-26 | Visual parity Launcher dark/light | §3.1 | high | ❌ FAIL BUG-015 |
| LNCH-27 | Visual parity Setup all states dark/light | §3.1 | high | ⚠️ PARTIAL |
| LNCH-28 | Visual parity thumbnail play modal | §3.1 | medium | ✅ PASS |

## 5. Test Suite — Editor

| ID | Title | Spec ref | Severity | Result |
| --- | --- | --- | --- | --- |
| EDIT-01 | Editor route guard: `/editor/:invalid` → Launcher | SPEC_EDITOR Edge cases, root routing | critical | ❌ FAIL BUG-007 |
| EDIT-02 | Entry selects background by default (no recovery present) | SPEC_EDITOR FA, open-question 2026-05-17 | critical | ✅ PASS |
| EDIT-03 | Recovered selection wins over default background on reopen | open-question 2026-05-17 | critical | ✅ PASS |
| EDIT-04 | Toolbar state: save `pending/saving/saved/failed` | SPEC_EDITOR Toolbar | high | ❌ FAIL BUG-009 |
| EDIT-05 | Toolbar state: cache `warm/cold/partial/invalid` | SPEC_EDITOR Toolbar | high | ⚠️ PARTIAL |
| EDIT-06 | Toolbar state: render `queued/running/disabled` | SPEC_EDITOR Toolbar | high | ⚠️ PARTIAL |
| EDIT-07 | Render button gating: enabled after alignment for new project; only on config-hash change for rendered project | SPEC_RENDER routing/gating, root routing rules | critical | ⚠️ PARTIAL |
| EDIT-08 | Draft Render Strip: queued/rendering/draft-ready/failed/cancelled with documented stages | SPEC_EDITOR Draft strip | high | ❌ FAIL BUG-013 |
| EDIT-09 | Transcript row schema (index, start/end, text) for every SRT cue | SPEC_EDITOR FA | high | ❌ FAIL BUG-016 |
| EDIT-10 | Sentence single click selects; shift-click selects contiguous range | SPEC_EDITOR Transcript pane | high | ✅ PASS |
| EDIT-11 | Right-click sentence opens context menu | SPEC_EDITOR Transcript pane | high | ✅ PASS |
| EDIT-12 | Sentence merge in Transcript pane updates subtitle/sentence model + dependent anchors | SPEC_EDITOR Transcript pane, open-question 2026-05-16 | high | ✅ PASS |
| EDIT-13 | Merge persists to `project_configs` + exactly 1 op-log entry | open-question 2026-05-16 | high | ✅ PASS |
| EDIT-14 | Preview surface uses HTML5 `<canvas>` (no DOM compositor) | open-question 2026-05-18 | high | ✅ PASS |
| EDIT-15 | Video layers decoded via hidden `<video>` synced to `currentTime` | open-question 2026-05-18 | high | ⚠️ PARTIAL |
| EDIT-16 | Audio-clock-driven timing with `requestAnimationFrame`; pause/resume/seek parity | open-question 2026-05-18 | high | ✅ PASS |
| EDIT-17 | Preview transport: Previous / Play-Pause / Next | SPEC_EDITOR Preview interaction | high | ✅ PASS |
| EDIT-18 | Resolution segmented control: `1080p / 720p / 9:16` | SPEC_EDITOR Preview | high | ✅ PASS |
| EDIT-19 | Layers popover lists N layers correctly | SPEC_EDITOR Layers popover | medium | ✅ PASS |
| EDIT-20 | Timeline bottom-to-top inverse of render order | SPEC_EDITOR FA | high | ✅ PASS |
| EDIT-21 | Render order `black fallback → background → foreground → PiP → subtitles → watermark` | SPEC_EDITOR FA | critical | ✅ PASS |
| EDIT-22 | Inspector: background fields (asset list, easing, crossfade 0-2s, motion, Remove) | SPEC_EDITOR Inspector Background | high | ✅ PASS |
| EDIT-23 | Inspector: foreground fields (asset, range, motion, easing, transitions, delete) | SPEC_EDITOR Inspector Foreground | high | ❌ FAIL BUG-005 BUG-006 |
| EDIT-24 | Inspector: PiP fields (3×3 grid, size 15-60, radius 0-32, opacity 10-100, motion, transitions, delete) | SPEC_EDITOR Inspector PiP, open-question 2026-05-20 | high | ❌ FAIL BUG-005 |
| EDIT-25 | Global controls in right rail: Watermark, Subtitles, Add/Change Background | SPEC_EDITOR Inspector rail | high | ✅ PASS |
| EDIT-26 | Assign modal: range clamp/reorder, asset import progress | SPEC_EDITOR Assign modal | high | ✅ PASS |
| EDIT-27 | Assign modal: PiP-only controls hidden in fullscreen; easing disabled when motion=none | SPEC_EDITOR Assign modal states | medium | ✅ PASS |
| EDIT-28 | Background modal: image-only OR video-only playlist (no mixing) | SPEC_EDITOR Background modal, root boundaries | critical | ❌ FAIL BUG-003 |
| EDIT-29 | Background modal: video shorter than voice → black fallback for remainder; longer → truncated | SPEC_EDITOR Background modal | high | ⚠️ PARTIAL (BUG-003 fixed; video-shorter-than-voice render behavior not verified — no video background in project) |
| EDIT-30 | Subtitles modal: bg select, position, font, chars 20-80, size 28-72, burn-in | SPEC_EDITOR Subtitles modal | high | ❌ FAIL BUG-004 |
| EDIT-31 | Subtitles modal live preview matches Preview Surface resolution/aspect | SPEC_EDITOR Subtitles modal | medium | ❌ FAIL BUG-004 |
| EDIT-32 | Media upload: 10 MiB single-request cap; >10 MiB split; ≤20 MiB even | open-question 2026-05-16 | high | ⚠️ PARTIAL (single blob verified; >10 MiB split not testable without large files) |
| EDIT-33 | Image min dimensions 5×5 px; smaller rejected with error UI | open-question 2026-05-16 | medium | ❌ FAIL BUG-017 |
| EDIT-34 | Duplicate content upload returns same response payload | open-question 2026-05-16 | medium | ✅ PASS |
| EDIT-35 | Undo: every edit reversible via op log | SPEC_EDITOR FA + undo section | critical | ❌ FAIL BUG-011 |
| EDIT-36 | Redo: byte-identical `config_json` after undo+redo | SPEC_EDITOR FA + undo section | critical | ⚠️ PARTIAL |
| EDIT-37 | Equivalent edits preserve content hash | SPEC_EDITOR FA | high | ⚠️ PARTIAL |
| EDIT-38 | No-op edit does not change hash | SPEC_EDITOR Editor undo | medium | ✅ PASS |
| EDIT-39 | Sentence anchors stable across voice re-record; orphan = red, never silently deleted | SPEC_EDITOR FA, Editor flows | critical | ⚠️ PARTIAL (not testable without real voice re-record; orphan display verified in earlier EDIT-36 test) |
| EDIT-40 | Cache invalidation: replace 1 media → only that `.vc/clips/` entry rebuilt | SPEC_EDITOR flows | high | ⚠️ PARTIAL (cache warm 2/2; single-clip selective rebuild not verified) |
| EDIT-41 | Crash recovery: kill mid-edit → op-log replay restores state without prompt | SPEC_EDITOR flows | high | ❌ FAIL BUG-008 |
| EDIT-42 | Reopen restores selection (recovered or background default), scroll, assignments, undo stack, preset | SPEC_EDITOR FA + flows | high | ❌ FAIL BUG-008 |
| EDIT-43 | Visual parity editor dark/light | §3.2 | high | ❌ FAIL BUG-015 |
| EDIT-44 | Visual parity transcript states (1/2/3) | §3.2 | high | ❌ FAIL BUG-015 |
| EDIT-45 | Visual parity preview dark/light + popover + 9:16 | §3.2 | high | ❌ FAIL BUG-015 |
| EDIT-46 | Visual parity timeline dark/light | §3.2 | high | ❌ FAIL BUG-015 |
| EDIT-47 | Visual parity inspector dark/light (background, foreground, PiP) | §3.2 + open-question 2026-05-20 | high | ❌ FAIL BUG-015 |
| EDIT-48 | Visual parity assign modal (dark/light/scrolled) | §3.2 | medium | ❌ FAIL BUG-015 |
| EDIT-49 | Visual parity change-background modal | §3.2 | medium | ❌ FAIL BUG-003 |
| EDIT-50 | Visual parity subtitle modal | §3.2 | medium | ❌ FAIL BUG-004 |
| EDIT-51 | Visual parity draft render strip dark/light | §3.2 | medium | ❌ FAIL BUG-013 |

## 6. Test Suite — Render

| ID | Title | Spec ref | Severity | Result |
| --- | --- | --- | --- | --- |
| REND-01 | Route guard: `/render/:invalid/:render_id`, `/render/:projectId/:invalid`, missing segments → Launcher | SPEC_RENDER guards, root routing | critical | ✅ PASS |
| REND-02 | Render reachable immediately after alignment for new project | root routing rules | critical | ⚠️ PARTIAL (render button enabled when has_unrendered_changes=1; new project flow not testable without creating one) |
| REND-03 | Render disabled on rendered project until config hash changes | root routing rules + SPEC_RENDER | critical | ✅ PASS |
| REND-04 | Header eyebrow `Render` | SPEC_RENDER header | low | ✅ PASS |
| REND-05 | Title is `<Project> / <Resolution> <preset> render` (slash, canonical per 2026-05-22) | open-question 2026-05-22 | high | ✅ PASS |
| REND-06 | `Back to editor` returns to `/editor/:projectId` | SPEC_RENDER header | high | ✅ PASS (manual verify 2026-05-25: click Back to editor lands on `/editor/:projectId`) |
| REND-07 | `Cancel render` covers queued + active; one cancel request; `cancelling → cancelled` UI; `.partial` excluded | SPEC_RENDER Cancel | critical | ✅ PASS |
| REND-08 | Render card output filename has `.mp4` extension (per written spec) | open-question 2026-05-22 | high | ✅ PASS |
| REND-09 | Live updates: percent, encode speed, ETA, frames written | SPEC_RENDER card stats | high | ✅ PASS (manual verify 2026-05-25: completed render retains FRAMES WRITTEN `9,009`) |
| REND-10 | Stage cycle: `queued → verify alignment cache → pre-render cached clips → build subtitles.srt → compose filtergraph → mux MP4 +faststart → append render history` (7 stages incl. queued) | SPEC_RENDER stages, open-question 2026-05-22 | critical | ✅ PASS (all 7 stages verified) |
| REND-11 | WS progress ≥ 1 event/sec while rendering | root §Performance Targets | medium | ✅ PASS (~2 WS events/sec during compose_filtergraph) |
| REND-12 | Output panel fields: project name, resolution, framerate, video codec/CRF/preset, audio codec/bitrate/sample rate, actual size | SPEC_RENDER Output panel, open-question 2026-05-22 | high | ✅ PASS (all output fields present) |
| REND-13 | Layout order: Output before Render history (per written spec) | open-question 2026-05-22 | medium | ✅ PASS |
| REND-14 | Render history row: icon, filename, resolution/preset, duration, status; current project only | SPEC_RENDER history | high | ✅ PASS |
| REND-15 | After-render: `Play locally` always present | SPEC_RENDER after-render | high | ✅ PASS |
| REND-16 | `Reveal in Explorer` shown only when backend exposes OS file-manager; omitted otherwise | SPEC_RENDER after-render | medium | ✅ PASS |
| REND-17 | States render correctly: idle, queued, all active stages, done, cancelling, cancelled, failed, output missing, partial excluded, ffmpeg warning, ffmpeg fatal, history empty | SPEC_RENDER states | high | ⚠️ PARTIAL (done/queued/composing/cancelling/cancelled verified; failed/idle/output-missing/ffmpeg-warning/fatal/history-empty not tested) |
| REND-18 | Render correctness (ffprobe): duration ±0.1 s of voice, resolution matches preset, audio present, `+faststart` | SPEC_RENDER E2E | critical | ✅ PASS (duration 300.304s vs voice 300.304s, h264 1280×720 30fps, aac 48kHz, +faststart confirmed) |
| REND-19 | Subtitle frames at `cue.start+200 ms` OCR-match cue text (sim ≥ 0.85) | SPEC_RENDER E2E | high | ⚠️ PARTIAL (subtitles visible in video output; formal OCR sim ≥0.85 not done) |
| REND-20 | Foreground/PiP clip boundary perceptual-hash transitions | SPEC_RENDER E2E | high | ⚠️ PARTIAL (PiP+foreground composite visible; formal boundary perceptual-hash check not done) |
| REND-21 | PiP rendered inside configured 3×3 cell within edge-margin tolerance | SPEC_RENDER E2E | high | ⚠️ PARTIAL (PiP visible in output; formal 3×3 cell position check not done) |
| REND-22 | Background transitions: image→image, video→black fallback boundaries | SPEC_RENDER E2E | high | ⚠️ PARTIAL (image background present in renders; video→black fallback not testable — project has no video background) |
| REND-23 | Watermark region pixel signature present on every sampled frame | SPEC_RENDER E2E | medium | ⚠️ PARTIAL (no watermark set in ss project; pixel signature check not testable) |
| REND-24 | Visual parity render dark/light + state coverage | §3.3 | high | ⚠️ PARTIAL (render page visuals correct per manual check; Playwright spec produced no output — automated assertions not confirmed) |

## 7. Cross-Cutting Flows (enumerated from all four SPECs)

CC flows execute end-to-end across pages; each is one walk.

| ID | Flow | Spec sources | Result |
| --- | --- | --- | --- |
| CC-01 | New-project happy path: Launcher → Setup (4 steps with `test01`) → Editor (apply media plan with multi-bg + foreground + PiP) → Draft render reaches 100% → playable `.mp4` at `<project>/.vc/drafts/` | SPEC_LAUNCHER Flow 3 + SPEC_RENDER E2E | ⚠️ PARTIAL |
| CC-02 | Setup validation+recovery: unsupported voice → fix → subtitle fail-then-succeed → alignment fail-then-succeed → Create | SPEC_LAUNCHER Flow 4 | ⚠️ PARTIAL |
| CC-03 | Setup dependency reset: voice change resets subtitle+alignment; transcript change resets alignment only | SPEC_LAUNCHER Flow 5 | ✅ PASS |
| CC-04 | Setup cancel: enter Setup → Cancel → no project created | SPEC_LAUNCHER Flow 1 | ✅ PASS |
| CC-05 | Reopen and resume: close app → relaunch → open recents → Editor restores selection/scroll/assignments/undo/preset | SPEC_EDITOR flows + FA | ❌ FAIL BUG-008 |
| CC-06 | Recovered selection precedence: recovered = valid → overrides default background; recovered = invalid → falls back to background | open-question 2026-05-17 | ✅ PASS |
| CC-07 | Crash recovery: edits → kill mid-edit → relaunch → op-log replay restores state without prompt | SPEC_EDITOR flows | ⚠️ PARTIAL (UI recovery state restored silently via Launcher; op-log IS stored; full config-edit replay not verified; direct URL crash blocked by BUG-008) |
| CC-08 | Re-record voice: replace `voice.wav` → re-run subtitle+alignment → sentence-to-clip assignments survive, orphans marked red | SPEC_EDITOR flows | ⚠️ PARTIAL (not testable without real voice re-record) |
| CC-09 | Cache invalidation: render → replace single media → re-render rebuilds only affected `.vc/clips/` | SPEC_EDITOR flows | ⚠️ PARTIAL (cache warm 2/2; single-clip selective rebuild not verified) |
| CC-10 | Editor → Render → back to Editor → re-render disabled until config hash changes | SPEC_RENDER gating + root routing | ✅ PASS (config change re-enables render buttons; render disabled after render completes) |
| CC-11 | Cancel during render: queued cancel + active cancel both produce `cancelling → cancelled`; `.partial` not exposed as output | SPEC_RENDER cancel | ✅ PASS (cancelling→cancelled confirmed from render_events; .partial excluded in history) |
| CC-12 | Routing guards: `/editor/:invalid`, `/render/:invalid/:render`, `/render/:projectId/:invalid`, `/render/:projectId` missing → Launcher | root routing + SPEC_EDITOR + SPEC_RENDER | ❌ FAIL BUG-007 BUG-008 |
| CC-13 | No visible top nav bar across all pages | root routing rule | ✅ PASS |
| CC-14 | Theme switch (dark↔light) on Launcher, Setup, Editor, Render: critical controls visible/clickable in both; screenshots saved as parity baselines | SPEC_LAUNCHER Flow 6 + Frontend Global | ✅ PASS |
| CC-15 | i18n switch: UI copy from i18n files (no hard-coded strings) on all four pages | root §Code Style + Frontend Global | ❌ FAIL BUG-014 |
| CC-16 | Browser-recovery persistence: UI preferences, draft editing state, undo/redo ops survive page reload (not app restart) | root §Tech Stack + Editor undo | ✅ PASS |
| CC-17 | `project_configs` save round trip: edit → Save → `config_json` validated by shared schema → content hash recomputed | SPEC_EDITOR + Backend Global, root §Boundaries | ⚠️ PARTIAL |
| CC-18 | Generated shared schema not hand-edited; UI uses generated types | root §Code Style + Boundaries | ✅ PASS |
| CC-19 | No secrets stored in SQLite/config/logs/browser storage | root §Boundaries | ✅ PASS |
| CC-20 | Subtitles.srt visible at `<project>/subtitles.srt`; internal artifacts only under `<project>/.vc/` | root §Tech Stack + Boundaries | ❌ FAIL BUG-016 |
| CC-21 | Render history only shows current project | SPEC_RENDER history | ✅ PASS (all 3 history rows belong to current project only) |
| CC-22 | Empty-state coverage: empty recents, no foreground/background/PiP project still renders successfully | SPEC_LAUNCHER + SPEC_RENDER E2E | ⚠️ PARTIAL (render buttons enabled when unrendered changes present; no-layer project not testable without creating one) |
| CC-23 | After-render → `Play locally` plays the output `.mp4`; `Reveal in Explorer` opens host file manager when supported | SPEC_RENDER after-render | ✅ PASS (Play locally calls window.open to /api/server/projects/:id/render/:renderId; video plays in new tab) |
| CC-24 | Project card → corrupt config row auto-deleted from `app.db` | SPEC_LAUNCHER Launcher states | ✅ PASS (re-verified 2026-05-25: corrupt rows auto-deleted from app.db on Launcher load; see BUG-018 fixed) |

## 8. Edge Cases & Boundary Conditions

- Voice file unsupported type, sample rate, or 0-length.
- Transcript empty / mismatched length vs voice.
- Watermark missing (optional path completes).
- Media: 5×5 px lower bound; 10 MiB / 20 MiB upload thresholds; duplicate-content dedup.
- Subtitle alignment failure, retry.
- Re-record voice → orphan anchors stay marked.
- Background mixing rejected (image+video forbidden).
- Range reversed / out-of-bounds in Assign modal.
- Missing alignment timestamps.
- PiP fields only when PiP selected.
- Easing disabled when motion = none.
- Render: active cancel, queued cancel, `.partial` exclusion, output missing, ffmpeg warning vs fatal, history empty.
- Routing: every invalid project_id / render_id permutation.

## 9. Performance Spot Checks

Manual feel + DevTools FPS overlay. Numbers below come from root §Performance Targets.

| Surface | Target | Check |
| --- | --- | --- |
| Editor first paint (warm) | ≤ 1.5 s | Reload `/editor/:projectId`, DevTools timing |
| 500 sentence-chip render | ≥ 60 fps | Synthesize 500-chip fixture, scroll, FPS overlay |
| Timeline drag at 100 clips | ≥ 60 fps | 100-clip fixture, drag, FPS overlay |
| Cached re-render after single edit | ≤ 0.2× voice duration | Edit one property, re-render, measure |
| Filter-chain build (50 layers) | ≤ 50 ms | Backend log / instrumented endpoint |
| WS render-progress cadence | ≥ 1 ev/sec | DevTools WS frames during render |
| `project_configs` save + hash | ≤ 50 ms | Network panel timing on Save |
| Undo/redo replay 1000 ops | ≤ 100 ms/op | Scripted op log via console |
| 720p / 1080p / 9:16 renders on 60-sec fixture | ≤ 1.0× / ≤ 2.5× / ≤ 1.2× voice | Wall clock |

## 10. Bug Recording

Every defect lands in `docs/designs/bugs/BUG-NNN-<slug>.md` with frontmatter:

```markdown
---
id: BUG-NNN
severity: critical | high | medium | low
area: launcher | setup | editor | render | cross-cutting | visual-parity | docs
spec_ref: <SPEC file §section / test-plan ID>
status: open
discovered: 2026-05-24
---

## Summary
## Steps to Reproduce
## Expected
## Actual
## Evidence
## Notes
```

Severity rubric:
- critical — blocks a primary user flow or violates a `Never` boundary.
- high — clear spec violation on a primary path; data integrity risk; visual parity SSIM < 0.95.
- medium — secondary path violation; minor data drift; visual parity 0.95 ≤ SSIM < 0.98.
- low — copy, spacing, or cosmetic-only drift with no functional impact.

## 11. Exit Criteria

A QA pass is complete when:
1. Every test case ID in §4–§6 has a Pass/Fail outcome recorded.
2. Every cross-cutting flow in §7 has been walked end-to-end at least once.
3. Every visual reference in §3 has been compared.
4. Every Fail/Drift has a `BUG-NNN-*.md` file in `docs/designs/bugs/`.
5. Performance spot checks in §9 are recorded with measured values, not adjectives.
6. No bug of severity `critical` remains undocumented.

## 12. Out of Plan

- Token-design page (per root routing rule: not part of product UI).
- Backend-only behaviors not surfaced through UI.
- Automated suite execution (`pnpm test/lint/build`) — covered by CI quality gates.
- Native file-picker (per open-question 2026-05-15: Setup is blob-first; no native picker).
