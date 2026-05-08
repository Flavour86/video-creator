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
├── project.json        # canonical state (matches shared schema)
├── voice.wav
├── transcript.txt
├── media/              # user images/clips
├── renders/            # MP4 outputs
└── .vc/                # cache: alignment JSON, pre-rendered clips, thumbnails
```

**Render pipeline** (server-side):

1. POST `/render?preset=draft|final` triggers the pipeline
2. `pipeline/transcribe.py` runs WhisperX forced alignment (reference-text mode) and caches to `.vc/`
3. `pipeline/clip_render.py` pre-renders each foreground clip (motion, transitions) into `.vc/clips/`
4. `pipeline/filtergraph.py` builds the ffmpeg complex filter chain (background → foreground overlay → subtitles → watermark)
5. `pipeline/render.py` invokes ffmpeg and streams progress via WebSocket (`/ws`)
6. Result logged to SQLite (`db/app.db`)

**Layer model** (bottom to top): black fill → background (auto-distributed images/clips) → foreground (sentence-mapped clips) → subtitles → watermark.

**State management**: Zustand on the frontend; `project.json` on disk is the durable store. FastAPI reads/writes `project.json` directly — it is not a database-backed API.

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

`docs/designs/PHASE_1_DESIGN.md` is the authoritative spec — read it before making architectural decisions. It covers the full layer model, render tiers, cache invalidation rules, and the three-phase roadmap.
