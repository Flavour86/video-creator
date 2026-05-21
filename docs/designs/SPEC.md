# Spec: Video Creator Prototype Product Map And Persistence Design

## Source

This spec is derived from `docs/prototype/v1/`(you can start a server and access it on browser), and the current shared schema/database files.

Reference files reviewed:

- `docs/prototype/v1/app.jsx`
- `docs/prototype/v1/components.jsx`
- `docs/prototype/v1/data.jsx`
- `docs/prototype/v1/screens/launcher.jsx`
- `docs/prototype/v1/screens/setup.jsx`
- `docs/prototype/v1/screens/editor.jsx`
- `docs/prototype/v1/screens/assign-modal.jsx`
- `docs/prototype/v1/screens/bg-modal.jsx`
- `docs/prototype/v1/screens/inspector.jsx`
- `docs/prototype/v1/screens/render.jsx`
- `docs/prototype/v1/screens/subtitles-modal.jsx`
- `docs/prototype/v1/screens/tokens.jsx`
- `docs/prototype/v1/tweaks-panel.jsx`
- `packages/shared-schemas/project.schema.json`

## Objective

Build a local-first video creation app where the transcript/subtitle timing is the editing surface. The user selects a project folder, provides voice and transcript files, optionally sets a watermark, runs alignment to generate `subtitles.srt`, assigns uploaded media to sentence ranges, previews the layered timeline, and renders queued draft/final MP4 outputs.

Target users:

- Solo video creators producing narrated videos from a written script.
- Users who already have voice-over, transcript, images, and clips.
- Users who need fast local iteration without cloud cost in Phase 1.

Success means the implemented UI exposes every required workflow in the prototype, persists project config in SQLite, can reopen existing projects, can recover browser-side edit history, and can render current-project outputs reliably.

## Tech Stack

- Frontend: Next.js 15, React 19, TypeScript, App Router.
- UI state: Zustand and focused hooks under `apps/web/lib`.
- Client persistence: browser storage for UI preferences, draft editing state, and incremental undo/redo operations.
- Styling: Tailwind CSS using existing design tokens and shared primitives. Do not copy prototype CSS directly.
- Backend: FastAPI, Python 3.11.
- Canonical project config: SQLite `project_configs.config_json`, validated by shared schema.
- User-visible projects output folder: Default to `{root}/projects`. Project devided by project_name: `{root}/projects/<project>`
- Cache and generated internal artifacts: `<project>/.vc/`.
- User-visible subtitles: `<project>/subtitles.srt`.
- Global app database: SQLite at `%APPDATA%/videocreator/app.db` on Windows, `~/.videocreator/app.db` on Unix.
- Render engine: ffmpeg.
- Alignment/subtitles: WhisperX reference-text alignment plus SRT generation adjusted to the transcript content.

## Commands

```bash
pnpm install
pnpm dev
pnpm launch
pnpm build
pnpm test
pnpm lint
pnpm format
pnpm gen:types
pnpm gen:py
pnpm -F @vc/web test
pnpm -F @vc/web lint
pnpm -F @vc/server test
pnpm -F @vc/server lint
```

Required local tools:

- Node 22+
- pnpm 10+
- Python 3.11
- ffmpeg 6+ with libx264, libass, libfreetype

## Project Structure

```text
apps/web/app/                  Next.js routes: launcher/home, editor, render
apps/web/components/           Reusable UI components and screen components
apps/web/lib/                  Hooks, API clients, formatters, state helpers
apps/web/styles/               Token-based global styles
apps/server/server/routes/     FastAPI routes
apps/server/server/db/         SQLite access for app/project/render state
apps/server/server/domain/     Project and timing domain logic
apps/server/server/pipeline/   alignment, cache, filtergraph, render, subtitles
packages/shared-schemas/       JSON schema source and generated TS/Python models
docs/prototype/                Prototype source and bundled HTML
docs/designs/                  Architecture and UI specs
```

Per-project folder:

```text
{default_output_preset}/<project>/
  voice.wav
  transcript.txt
  subtitles.srt
  media/
  renders/
  .vc/
    alignment.json
    alignment.hash
    thumbs/
    clips/
    drafts/
    logs/
```

`default_output_preset` is a key of the `app_settings` table in the database.

## Code Style

Follow `patterns.md`.

Conventions:

- Use generated shared schema types. Never hand-edit generated TS/Python files.
- Keep formatters centralized: timecode, range labels, file sizes, ETA, render specs.
- Keep UI copy in i18n files.
- Use shared primitives for buttons, icon buttons, segmented controls, forms, tags, panels, modals, and layer chips.
- Use parameterized SQL only.

## Top-Level Pages

User-facing pages:

| Page | Route intent | Purpose |
| --- | --- | --- |
| Launcher | `/` | Home page, recent projects, new-project folder selection, and setup subflow |
| Editor | `/editor/:projectId` | Main transcript/subtitle-anchored editing surface |
| Render | `/render/:projectId/:render_id` | Current project's render queue, progress, log, output, and history |

Routing rules:

- The app has no visible navigation bar with Launcher/Setup/Editor/Render/Tokens buttons.
- Launcher is always reachable as home.
- `New project` directly enters the `Setup` subflow.
- Setup collects voice, transcript, optional watermark, and then runs alignment.
- `Create project` is enabled only after all four Setup steps are checked.
- Editor requires a valid `project_id`; without it, redirect to Launcher.
- Render requires a valid `project_id` and `render_id` at `/render/:projectId/:render_id`; without either one, redirect to Launcher.
- For a new project, Render is available immediately after alignment succeeds, even if no foreground, background, or PiP exists.
- For an already-rendered project, Render is enabled only when the current config has unrendered changes.
- The Tokens page is not part of the product UI, but token-based design-system implementation is still required.

## Split Spec Files

- [Backend Global](SPEC_BACKEND_GLOBAL.md): persistence model, SQLite schema, project files, cache/log artifacts, security/migration rules, and API surface.
- [Frontend Global](SPEC_FRONTEND_GLOBAL.md): shell layout, theme/language controls, i18n-facing UI preferences, browser storage, and shortcut boundaries.
- [Launcher And Setup](SPEC_LAUNCHER.md): Launcher page, recent projects, thumbnails, pagination, and the four-step Setup subflow.
- [Editor](SPEC_EDITOR.md): editor toolbar, draft render strip, transcript pane, preview, timeline, inspector, modals, and media/layer model.
- [Render](SPEC_RENDER.md): Render page layout, progress card, output panel, history, after-render actions, render states, and cancel behavior.

## Performance Targets

Measured on dev baseline hardware (8-core x86 CPU, 16 GB RAM, integrated GPU, NVMe SSD, Node 22, Python 3.11, ffmpeg 6+, no other heavy workloads). Numbers may be tuned during implementation but cannot regress beyond 10% without an explicit SPEC revision.

| Surface | Target |
| --- | --- |
| Subtitle Generate (voice → `subtitles.srt`, warm model) | ≤ 0.5× voice duration end-to-end |
| Subtitle Alignment (WhisperX reference-text, warm model) | ≤ 0.4× voice duration end-to-end |
| `720p` draft render on a 60-second fixture | ≤ 1.0× voice duration |
| `1080p` final render on a 60-second fixture | ≤ 2.5× voice duration |
| `9:16` vertical render on a 60-second fixture | ≤ 1.2× voice duration |
| Cached-clip re-render after a single property edit | ≤ 0.2× voice duration |
| Filter-chain build for 50 layers | ≤ 50 ms |
| WS render-progress event cadence | ≥ 1 event per second while rendering |
| `project_configs` save + content hash | ≤ 50 ms for a typical config |
| Undo/redo replay across a 1000-op log | ≤ 100 ms per op |
| Editor route first paint (warm dev server) | ≤ 1.5 s |
| Sentence-chip render at 500 chips | ≥ 60 fps (≤ 16 ms/frame) |
| Timeline drag at 100 clips | ≥ 60 fps (≤ 16 ms/frame) |

## Boundaries

Always:

- Store canonical project config in SQLite `project_configs`.
- Keep user-visible `subtitles.srt` at `<project>/subtitles.srt`.
- Use browser storage for UI preferences and incremental undo/redo operation history.
- Use parameterized SQL.
- Keep generated shared schema files generated, not hand-edited.
- Validate project config through shared schemas before saving.
- Maintain render order exactly.
- Keep sentence anchors stable across voice re-records unless sentences are explicitly merged/changed.
- Add focused tests for behavior changes.

Never:

- Store secrets in SQLite, project config, logs, browser storage, or committed files.
- Concatenate user input into SQL.
- Silently delete orphaned assignments after transcript changes.
- Silently mix image/video background playlists.
- Delete user media files when deleting clips unless explicitly requested.
- Modify generated schema outputs by hand.
- Add co-author or external attribution lines to commits.

## pre-existing issues


## open questions logs

- [X] 2026-05-17: Editor Task 9 acceptance says "Editor entry always selects background by default when available," but Task 2 acceptance and Editor success criteria also require restoring prior selection from browser recovery on reopen. Which rule has precedence when both apply?
User: Recovered selection is canonical on reopen and wins when valid. Default background selection applies only when there is no valid recovered selection. Rendering without a background layer remains allowed.

- [X] 2026-05-16: Editor Task 5 requires handling huge video chunking plus too-small/corrupt media as recoverable states, but current API contract only has single-request `POST /uploads -> UploadResult[]` and no canonical thresholds/protocol for `huge` or `too-small`. Which contract should we implement now?
User: Option A. Keep single-request `POST /uploads`; define deterministic server thresholds and UI import behavior. Confirmed constants and behavior: max upload bytes `10 MiB` per request payload, files above `10 MiB` upload in splits, files within `<= 20 MiB` split evenly, minimum image dimensions `5x5` px, and duplicate content returns the same response payload as the prior import.

- [X] 2026-05-16: Editor Task 4 requires transcript merge to (1) persist merged sentence/subtitle model into `project_configs` on Save and (2) append exactly one operation-log entry. Current shared schema `Project.transcript` only has `{ kind, path }` and does not define any sentence/cue payload field, while `apps/web/lib/editor-operation-log/operation-log.ts` working state only tracks `layers/output/subtitles/watermark` (no transcript sentence model). Which canonical persistence contract should we implement for merged sentences?
User: Option A. Extend shared schema/config with a transcript sentence/cue override payload persisted in `project_configs`.

- [X] 2026-05-15: Launcher Task 8 acceptance says `POST /projects` creates a project only from a completed Setup draft/session, but `docs/designs/tasks/launcher/plan.md` also says legacy routes may remain temporarily for compatibility tests. Current `POST /projects` still accepts legacy `path` + `name`, which bypasses the completed Setup draft gate. Should `POST /projects` reject legacy `path`/`name` creation now and require `setup_id`, or should legacy direct creation remain on this endpoint temporarily for compatibility?
User: Avoid both retaining the legacy implementation and requiring `setup_id` in the final create payload. `POST /projects` should get the project info from the active Setup draft/session. If project creation fails, the user should refill Setup to create a new project. Project name, voice, `subtitles.srt`, and transcript files are required; watermark is optional.
- [X] 2026-05-15: Launcher Task 7 acceptance says subtitle alignment status must cycle `ready -> running -> succeeded/failed`. In current blob-first synchronous `POST /subtitle/alignment`, UI/draft state does cycle (`draft.alignment.status` + optimistic UI), but the HTTP response body only returns `status: succeeded` on success and standard error envelopes on failure. Should we enforce status-cycle semantics strictly at the API response contract level (including explicit `failed` payload, and possibly `running/ready` representation), or is draft/UI state the canonical source for this acceptance?
User: enforce status-cycle semantics strictly at the API response contract level, as long as UI rendering demands are covered.
- [X] 2026-05-15: Launcher Task 5 has conflicting acceptance detail. `todo.md` only requires the four-step Setup state/layout, but `plan.md` and `SPEC_LAUNCHER.md` require Voice/Transcript/Watermark cards to open a native file picker. Current `/setup` can only call draft/subtitle APIs with filesystem paths, while browser file inputs do not expose absolute source paths. Should Setup use a desktop/native file-picker bridge now, a backend browse/stage endpoint, or keep path-based mocks until the later E2E/native boundary task?
User: Setup must be blob-first. Frontend uploads `File` blobs (voice/transcript/watermark) to backend staging endpoints; backend stages and processes files server-side. Client must never send or depend on local filesystem paths for selected files.
- [X] 2026-05-14: Backend-global Task 4 makes `projects.last_render_at` canonical and says not to preserve `last_opened_at`, while `packages/shared-schemas/project.schema.json` still exposes `RecentProject.last_opened_at` and `RecentProjectCard.last_opened_at`. Should the public API/shared schema be renamed to `last_render_at` now, or should `last_opened_at` remain as a temporary response alias backed by `last_render_at` for frontend compatibility?
User: don't remain anything unused!
- [X] 2026-05-14: Backend-global Task 7 defines global `POST /uploads` and requires uploaded assets to be represented in canonical `config.media[]`, but the API surface does not say how `POST /uploads` receives the target project context. Should `POST /uploads` require `project_id` as query/form data and update that project's config, or should it only store root-level assets and leave `config.media[]` updates to a separate project config save?
User: `POST /uploads` stores root-level assets only. Project config is updated separately through `PUT /projects/:projectId/config` to connect the returned `mediaId`.

- [X] 2026-05-18: Editor Task 12 follow-up asks to use `canvas-api` to simulate a live video player frame-by-frame. Please confirm the exact implementation boundary:
  1. Does `canvas-api` mean in-app HTML5 `<canvas>` rendering in `PreviewSurface` (React + Canvas 2D), not static art output from the `canvas-design` skill?
  2. Should we fully replace the current DOM-based preview compositor with canvas, or keep DOM as fallback and run canvas as primary?
  3. For video media layers, should canvas playback decode real video frames via hidden `<video>` elements synchronized to `currentTime`, or is thumbnail/frame simulation acceptable in this phase?
  4. Should preview timing stay audio-clock-driven (`audio.currentTime`) with canvas redraw on `requestAnimationFrame`, including pause/resume/seek parity with existing transport behavior?
User: (1) yes, use HTML5 `<canvas>` in `PreviewSurface` with React + Canvas 2D; (2) fully replace DOM preview compositor with canvas; (3) decode real video frames via hidden `<video>`; (4) keep audio-clock-driven timing with `requestAnimationFrame`, including pause/resume/seek parity.

- [X] 2026-05-19: Editor Task 16 visual parity gate ambiguity. When we run real SSIM comparison (without copying reference over actual), the first editor parity case fails hard (`editor-dark.png` SSIM `0.2120` vs threshold `0.9800`), which indicates current implementation visuals and canonical reference screenshots are not close enough for strict parity. Which canonical rule should we follow for Task 16?
  1. Keep strict parity against existing reference screenshots and treat this as a product/UI implementation gap (do not weaken test assertions).
  2. Keep current implementation visuals and lower/relax SSIM thresholds for editor visual tests.
  3. Re-baseline canonical editor screenshots in `docs/designs/visuals/` to current implementation output, then keep strict SSIM checks on the new baseline.
User: Option 1

- [X] 2026-05-20: Editor inspector visual references disagree on PiP motion controls. `editor-dark.png` default PiP inspector matches the merged `Motion & transitions` runtime section, while targeted `editor-inspector-dark.png` for PiP z4 shows separate `Motion`, `Easing`, and `Transitions` sections. Should runtime PiP inspector keep the merged section, restore separate sections for all PiP/foreground clips, or should the stale reference be re-authored before continuing strict SSIM work?
User: The `Editor inspector` visual references should be following the one  `editor-inspector-dark.png`,  for all PiP/foreground/background clips, they stay with their own inspector

- [X] 2026-05-19: Follow-up implementation boundary for Option 1 strict parity. After replacing editor visual fixtures with prototype-aligned data and media mocks, first-case SSIM improved from `0.2120` to `0.4157`, but remaining mismatch is now mostly structural layout/UI (left/center/right pane geometry and inspector control composition order/style). Which canonical implementation path should we take?
  1. Continue full runtime UI refactor so normal `/editor/:projectId` layout/components match the reference screenshots directly (broader product UI changes).
  2. Keep runtime UI behavior as-is and finish parity through a dedicated visual renderer mode (for example `?visual=1`) used only by visual tests, while preserving strict SSIM against the canonical references.
User: Option 1

- [X] 2026-05-21: Editor Task 17 requires performance-gate acceptance (cached-clip re-render target, filter-chain build for 50 layers, undo/redo replay 1000-op, 500 sentence chips, timeline drag at 100 clips), but current required verification commands (`pnpm test/lint/build`, web/server tests, visual editor tests) do not execute explicit benchmark assertions for these thresholds. Which canonical completion rule should Task 17 follow?
  1. Treat current command-gate green runs as sufficient for Task 17 completion, and track performance targets separately.
  2. Block Task 17 completion until we add executable benchmark checks for all listed targets and they pass.
  3. Allow Task 17 completion with a committed performance report documenting measured results plus explicit owner/follow-up for any unmet target.
User: Option 3
Closure note: Command gates are green. The Task 17 performance report now records committed benchmark assertions for every listed performance target; no target remains unmeasured.
