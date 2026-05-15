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

### Performance Targets

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


## open questions logs

- [ ] 2026-05-15: Launcher Task 5 has conflicting acceptance detail. `todo.md` only requires the four-step Setup state/layout, but `plan.md` and `SPEC_LAUNCHER.md` require Voice/Transcript/Watermark cards to open a native file picker. Current `/setup` can only call draft/subtitle APIs with filesystem paths, while browser file inputs do not expose absolute source paths. Should Setup use a desktop/native file-picker bridge now, a backend browse/stage endpoint, or keep path-based mocks until the later E2E/native boundary task?
- [X] 2026-05-14: Backend-global Task 4 makes `projects.last_render_at` canonical and says not to preserve `last_opened_at`, while `packages/shared-schemas/project.schema.json` still exposes `RecentProject.last_opened_at` and `RecentProjectCard.last_opened_at`. Should the public API/shared schema be renamed to `last_render_at` now, or should `last_opened_at` remain as a temporary response alias backed by `last_render_at` for frontend compatibility?
User: don't remain anything unused!
- [X] 2026-05-14: Backend-global Task 7 defines global `POST /uploads` and requires uploaded assets to be represented in canonical `config.media[]`, but the API surface does not say how `POST /uploads` receives the target project context. Should `POST /uploads` require `project_id` as query/form data and update that project's config, or should it only store root-level assets and leave `config.media[]` updates to a separate project config save?
User: `POST /uploads` stores root-level assets only. Project config is updated separately through `PUT /projects/:projectId/config` to connect the returned `mediaId`.
