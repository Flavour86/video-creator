# Repository Instructions

## Project Structure

This is a pnpm monorepo for a local-first video creator.

- `apps/web` — Next.js 15 / React 19 UI: routes in `app/`, reusable UI in `components/`, client logic in `lib/`, styles in `styles/`.
- `apps/server` — FastAPI backend in `server/`, pytest coverage in `tests/`.
- `packages/shared-schemas` — owns `project.schema.json`; generated TypeScript and Python models live in `ts/` and `py/`.
- `scripts/` — automation; `bin/` — launch entrypoints; `docs/` — design notes.

## Build, Test, and Development Commands

```bash
pnpm install                  # install workspace dependencies
pnpm dev                      # start FastAPI (:8787) + Next.js (:3000) concurrently
pnpm launch                   # run the local launcher
pnpm build                    # run all package build steps

pnpm test                     # run web Vitest + server pytest
pnpm lint                     # run ESLint (web) + Ruff & mypy (server)
pnpm format                   # format TS/JS/JSON/Markdown with Prettier

pnpm gen:types                # regenerate TS schema models → packages/shared-schemas/ts/index.ts
pnpm gen:py                   # regenerate Python schema models → packages/shared-schemas/py/schemas.py
```

Use focused commands while iterating:

```bash
pnpm -F @vc/web test          # Vitest
pnpm -F @vc/web test:watch
pnpm -F @vc/web lint          # ESLint
pnpm -F @vc/server test       # pytest
pnpm -F @vc/server lint       # Ruff + mypy
```

Required tools: Node 22, pnpm 10, Python 3.11, ffmpeg 6+.

## Architecture

**Monorepo** (`pnpm-workspace.yaml`): `apps/web` (Next.js 15 / React 19), `apps/server` (FastAPI / Python 3.11), `packages/shared-schemas` (JSON Schema source of truth).

**Runtime topology**: `bin/video-creator.mjs` boots both servers and opens a browser. In dev, `scripts/dev.mjs` does the same without a production build. The Next.js app rewrites `/api/server/*` to `localhost:8787` — all FastAPI calls from the browser go through this proxy.

**Shared schema pipeline**: `packages/shared-schemas/project.schema.json` is the single source of truth for the project data model. TypeScript types and Pydantic models are **generated** from it — never edit `ts/index.ts` or `py/schemas.py` by hand; run `gen:types` / `gen:py` instead.

**Project data layout** (user-selected directory):

```
<project>/
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

**Render pipeline** (server-side):

1. POST `/api/server/projects/:projectId/render?preset=draft|final&resolution=1920x1080|1280x720|1080x1920` triggers the pipeline
2. `pipeline/transcribe.py` runs WhisperX forced alignment (reference-text mode) and caches to `.vc/`
3. `pipeline/clip_render.py` pre-renders each foreground clip (motion, transitions) into `.vc/clips/`
4. `pipeline/subtitles.py` generates `subtitles.srt` from alignment data at the project root
5. `pipeline/filtergraph.py` builds the ffmpeg complex filter chain (background → foreground → PiP → subtitles → watermark)
6. `pipeline/render.py` invokes ffmpeg and streams progress via WebSocket (`/ws`)
7. Result written to `render_history`, `render_artifacts`, and `render_events` in the app SQLite DB (`%APPDATA%/videocreator/app.db` on Windows, `~/.videocreator/app.db` on Unix)

**Layer model** (bottom to top): black fill → background (auto-distributed images/clips) → foreground (sentence-mapped clips) → PiP (picture-in-picture overlays) → subtitles → watermark.

**State management**: Zustand on the frontend; canonical project config stored in SQLite `project_configs` (`config_json` validated against the shared schema, content-hashed on save). Browser storage owns UI preferences (`theme`, `accent`, `density`, `language`) and incremental undo/redo operations. FastAPI reads/writes through SQLite — it is not a filesystem-based API.

**Forward-compatibility hooks**: `apps/server/server/adapters/ai/base.py` defines an abstract `AIProvider` interface for Phase 2 AI integration — keep it intact.

## Key Design Decisions

- **Next.js + FastAPI (not Electron/Tauri)**: chosen for Phase 3 SaaS migration path. The local-server model means no special desktop packaging is needed.
- **WhisperX reference-text mode**: alignment uses the user-supplied transcript, not transcription from scratch — faster and more accurate for voice-over work.
- **Content-addressed cache**: `.vc/` clips are invalidated by source hash, not timestamps. Changing a layer's in/out points or effects will invalidate only the affected clip.
- **Draft vs. Final presets**: Draft is 720p CRF 28 (fast feedback); Final is 1080p H.264 CRF 18 (YouTube-grade).

## Coding Style & Naming Conventions
@[Coding patterns](patterns.md)

## Testing Guidelines
Web tests use Vitest and Testing Library with `*.test.ts` / `*.test.tsx` files colocated under `app/`, `components/`, or `lib/`. Server tests use pytest with `test_*.py` files in `apps/server/tests`. Add focused tests for behavior changes, especially render pipeline, project schema, and UI state logic.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits such as `feat(server,web): wire configurable transitions`, `fix(server): preserve full render timeline`, and `docs(state): record Phase 1 acceptance`. Keep commits scoped and imperative. Do not add `Co-Authored-By`, co-author, or external attribution lines.

Pull requests should include a behavior summary, test/lint results, linked task context, and screenshots or recordings for UI changes. Call out schema changes and regenerated files.

## Security & Configuration Tips

Keep local media, renders, caches, `.vc/`, virtualenvs, and downloads out of source control unless documenting a fixture.

## Docs

`docs/designs/SPEC.md` is the single authoritative spec — read it before any change. It covers every feature, every UI/UX behavior, the data/persistence model, the API surface, edge cases, and success criteria. Other planning files (`tasks/plan.md`, `tasks/todo.md`) are derived views: they must never narrow, drop, or contradict anything in `SPEC.md`. If a plan/task and `SPEC.md` disagree, `SPEC.md` wins — fix the plan, not the spec.

## SPEC Compliance (MANDATORY)

- Implement **every** point in `docs/designs/SPEC.md`. Do not silently skip pages, controls, states, edge cases, or boundary rules. If something in the spec is genuinely out of scope or blocked, say so explicitly and get a decision — never just omit it.
- Before starting a task, re-read the relevant `SPEC.md` section(s) in full. Before marking a task done, walk its `SPEC.md` section line by line and confirm each requirement is met or explicitly deferred with a note.
- Keep `tasks/plan.md` and `tasks/todo.md` in sync with `SPEC.md`: when the spec changes, reconcile the plan; when you find a plan item missing a spec requirement, add it.

## UI/UX Parity Against Prototype (MANDATORY)

The prototype in `docs/prototype/v1/` is the visual/interaction reference for screen composition, layout, control placement, and behavior.
- **After any UI-affecting change you MUST verify it in a real browser.** Run the app (`pnpm dev`), open the affected screen, and open the same screen from the prototype (serve `docs/prototype/v1/` — e.g. it runs at `http://127.0.0.1:4173/app.html` directly). Compare them **side by side, visually**. Iterate until the implemented screen is a **100% replication** of the prototype's layout, structure, controls, states, and interactions.
- **`SPEC.md` is synced with the prototype, if they are conflict, stop and ask user.**.
- **Do not copy prototype CSS.** Rebuild the look with Tailwind and the existing design tokens/shared primitives (buttons, icon buttons, segmented controls, forms, tags, panels, modals, layer chips). Visual output should match; the implementation should not be a CSS paste.
- Use the browser-testing / DevTools tooling to check console errors and to capture before/after screenshots for PRs that touch UI. A UI task is not done until the browser comparison passes.
