# Conventions

> **Read once per session.** This is the authoritative style guide for the repo. Deviations require explicit user approval.

---

## 1. Code style

### 1.1 TypeScript / JavaScript
- **Formatter**: Prettier with default config except `"singleQuote": false` and `"semi": true`.
- **Linter**: ESLint with Next.js's recommended config plus `@typescript-eslint/recommended`.
- **Import order**: built-ins → external → internal-aliased → relative. Sorted alphabetically within each group.
- **Path aliases**: `@/` resolves to `apps/web/`. Configure in `tsconfig.json`.
- **Async**: prefer `async`/`await` over `.then()`.
- **Error handling**: throw `Error` subclasses, never strings. Define domain errors in `apps/web/lib/errors.ts`.
- **No `any`**. Use `unknown` and narrow.
- **No default exports** except for Next.js page/layout/route files.
- **Components**: PascalCase. One component per file. Filename matches component name.
- **Hooks**: prefix `use…`. One hook per file under `apps/web/lib/hooks/`.
- **Utility functions**: camelCase, named exports.

### 1.2 Python
- **Formatter**: `ruff format` (Black-compatible).
- **Linter**: `ruff check` with rules `E`, `F`, `I`, `N`, `B`, `UP`, `RUF`.
- **Type checker**: `mypy --strict` for `server/` package; tests excluded.
- **Imports**: stdlib → third-party → first-party → relative. Sorted alphabetically.
- **Async**: all I/O routes are `async def`. Use `asyncio.to_thread()` for blocking ffmpeg or WhisperX calls.
- **Errors**: define domain exceptions in `apps/server/server/errors.py`. FastAPI exception handlers translate to HTTP responses.
- **Naming**: `snake_case` for functions and variables, `PascalCase` for classes, `SCREAMING_SNAKE_CASE` for constants.
- **No bare `except:`**. Always specify exception type.
- **Docstrings**: only on public APIs and non-obvious internal functions. One-line where possible. No formal Sphinx markup unless generating docs.

### 1.3 Schema-driven types
The single source of truth for the project file format is `packages/shared-schemas/project.schema.json` (JSON Schema Draft 2020-12).

**Generation pipeline**:
- `pnpm gen:types` → produces `packages/shared-schemas/ts/index.ts` via `json-schema-to-typescript`.
- `pnpm gen:py` → produces `packages/shared-schemas/py/schemas.py` via `datamodel-code-generator`.

**Rule**: never edit the generated files. Edit the JSON Schema and regenerate.

---

## 2. File and directory naming

| Type | Convention | Example |
|---|---|---|
| Next.js pages/routes | lowercase, dash-separated | `apps/web/app/projects/new/page.tsx` |
| React components | PascalCase | `apps/web/components/timeline-strip/TimelineStrip.tsx` |
| Next.js component folders | dash-separated | `apps/web/components/timeline-strip/` |
| TypeScript modules | dash-separated | `apps/web/lib/api-client.ts` |
| Python modules | snake_case | `apps/server/server/pipeline/filtergraph.py` |
| Python packages | snake_case | `apps/server/server/pipeline/` |
| Test files | `*.test.ts` (TS), `test_*.py` (Py) | `chunker.test.ts`, `test_filtergraph.py` |
| Config files | as required by tool | `next.config.ts`, `pyproject.toml` |

---

## 3. Commit conventions

### 3.1 Format
```
<type>(<scope>): <subject>

<body>

Refs: T<milestone>.<task>
```

### 3.2 Types
- `feat` — new functionality (any user-visible change).
- `fix` — bug fix.
- `refactor` — internal change, no behavior change.
- `chore` — tooling, deps, configs.
- `docs` — documentation only.
- `test` — adding or fixing tests.
- `build` — build system, CI.

### 3.3 Scopes
- `web` — Next.js app.
- `server` — FastAPI app.
- `schema` — shared schemas.
- `repo` — workspace-level.
- `docs` — under `docs/`.

### 3.4 Subject rules
- Imperative mood: "add X" not "added X".
- Lowercase first letter (after the colon).
- No trailing period.
- Maximum 70 characters.

### 3.5 Body rules
- Optional. Use it to explain *why*, not *what*.
- Wrap at 100 characters.
- Each task's commit body must end with `Refs: T<milestone>.<task>`.

### 3.6 Examples
```
feat(server): add WhisperX align endpoint with cache

Reads voice.wav + transcript.txt, returns alignment.json. Caches result keyed
on sha256(voice + transcript). Falls back to CPU when CUDA is unavailable.

Refs: T3.3
```

```
chore(repo): scaffold pnpm workspace

Refs: T1.1
```

### 3.7 No co-author lines
Per user policy: **never** add `Co-Authored-By`, `Signed-off-by`, or any other attribution trailer to commits.

---

## 4. Branch and PR strategy (solo dev)

- Trunk-based. All work on `master`.
- One task = one commit, pushed directly. No PRs in Phase 1.
- A task that produces a working state but defers polish (e.g., "T3.3 done; T3.4 will improve error UI") is allowed; mark `[~]` in STATE.md and finish the deferred work in the next task.

---

## 5. Testing requirements

### 5.1 What must have tests
- **Pure logic** in `apps/server/server/pipeline/` (chunker, filtergraph generation, cache key hashing, SRT formatting).
- **Schema validation** of `project.json`.
- **Domain transformations** (sentence → time range resolution).

### 5.2 What does not require tests in Phase 1
- Next.js components (manual UI testing is sufficient for v1).
- ffmpeg invocation success (covered by milestone smoke tests, not unit tests).
- WhisperX correctness (relies on the model; verify by running the smoke project).

### 5.3 Test commands
- TS: `pnpm -F @vc/web test` (Vitest).
- Python: `pnpm -F @vc/server test` (runs `apps/server/.venv/Scripts/python -m pytest` via `scripts/run-server-test.mjs`).
- All: `pnpm test`.

### 5.4 Python venv rule
All Python execution — tests, linting, running the server, one-off scripts — **must** use the virtualenv Python at `apps/server/.venv/Scripts/python.exe` (Windows) or `apps/server/.venv/bin/python` (macOS/Linux). Never use a bare `python` or `python3` command in milestone steps, verification commands, or agent notes, because the system Python may differ from the venv Python and will be missing installed packages.

In PowerShell:
```powershell
# Correct:
& apps/server/.venv/Scripts/python -m pytest -q
& apps/server/.venv/Scripts/python -c "import whisperx; print('ok')"

# Wrong (do not use):
python -m pytest          # resolves to system Python
python3 -m pytest         # same problem
```

The `pnpm -F @vc/server dev/test/lint` commands are the preferred way to invoke Python operations because they use the venv path internally. Only use the explicit venv path for ad-hoc verification commands in milestone files.

### 5.4 Smoke project
Each milestone defines a smoke test in its file. The smoke project lives at `tests/fixtures/smoke-project/` and contains a 30-second audio clip + matching transcript + 3 images. Used by milestone verification scripts.

---

## 6. Logging

- **Server (Python)**: `structlog` with JSON output to stderr in dev, key=value to stderr in production-launcher mode.
- **Web (Next.js)**: `console.log` for dev. No production logging in Phase 1 (single user).
- **Render progress**: WebSocket only, not logs. Render *failures* do log a stack trace.
- **Levels**: `DEBUG` (gated on `VC_DEBUG=1`), `INFO`, `WARN`, `ERROR`. No `FATAL`.

---

## 7. Configuration

- **Server**: read from `server/settings.py`, which reads `.env` via Pydantic `BaseSettings`.
- **Web**: env vars prefixed `NEXT_PUBLIC_` for client-exposed; others server-only via `process.env`.
- **`.env.example`** is committed. Real `.env` is git-ignored.
- **No hardcoded ports**, paths to ffmpeg, or model names. Everything goes through settings.

---

## 8. Error response format (HTTP)

All FastAPI error responses use this shape:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Human-readable message.",
    "details": { "project_id": "..." }
  }
}
```

Status codes:
- `400` — validation error (bad input).
- `404` — resource missing.
- `409` — conflict (e.g., concurrent render).
- `422` — semantically invalid (e.g., orphaned transcript anchor).
- `500` — unexpected server error.
- `503` — dependency unavailable (e.g., ffmpeg not in PATH).

---

## 9. Rendering progress event format (WebSocket)

```json
{
  "type": "progress",
  "render_id": "r-2026-05-06-1530",
  "stage": "compose" | "cache_warm" | "muxing" | "done" | "error",
  "percent": 42.7,
  "eta_seconds": 480,
  "current_frame": 12345,
  "speed": "1.2x",
  "message": null
}
```

Final event always has `stage: "done"` (with `output_path`) or `stage: "error"` (with `message`).

---

## 10. Git ignore

The `.gitignore` (created in T1.1) must include at minimum:

```
# Node
node_modules/
.next/
out/
dist/
*.log

# Python
__pycache__/
*.pyc
*.pyo
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Project-local
.env
.env.local
.env.*.local

# Editor
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Per-project caches (when test fixtures are committed)
**/.vc/

# Build artifacts
*.egg-info/
build/
```

**Never** add `package-lock.json`, `pnpm-lock.yaml`, or `uv.lock` to gitignore. Lockfiles are committed.

---

## 11. Documentation rules

- **Code comments**: only when *why* is non-obvious. Never repeat what the code says.
- **README**: kept short. Links to `PHASE_1_DESIGN.md` and `00_OVERVIEW.md`.
- **No autogenerated docs in Phase 1.** No Sphinx, no Typedoc.
- **Update `STATE.md` after every task.** This is a hard rule.
- **Do not create new docs** unless a task instructs you to. Do not write a task summary doc, "decisions" doc, or "implementation notes" doc on your own initiative.

---

## 12. Dependency policy

- **No experimental deps.** Use stable releases.
- **Check the lockfile changed** as part of any task that adds a dep. If it didn't, the install didn't take.
- **Pin major versions** in `package.json` and `pyproject.toml` (`^1.2.3` for npm, `>=1.2,<2.0` for Python).
- **No deps without justification.** A task that adds a dep must name it explicitly.

Approved deps for Phase 1:

**Web (apps/web)**: `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `wavesurfer.js`, `zustand`, `zod`, `@radix-ui/*`, `lucide-react`, `clsx`, `tailwind-merge`, `vitest`, `@testing-library/react`, `prettier`, `eslint`, `eslint-config-next`.

**Server (apps/server)**: `fastapi`, `uvicorn[standard]`, `websockets`, `pydantic`, `pydantic-settings`, `structlog`, `python-multipart`, `ffmpeg-python`, `whisperx`, `torch`, `torchaudio`, `nltk`, `soundfile`, `numpy`, `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy`.

**Workspace root**: `concurrently`, `cross-env`, `tsx`, `json-schema-to-typescript`, `datamodel-code-generator` (Python tool, installed alongside server).

Anything not on this list requires the user's approval — add a `## Blocked` entry to STATE.md and ask.

---

## 13. Security

- **No `eval`**, no `Function(string)`, no shell=True except where ffmpeg-python wraps it safely.
- **All file paths from user input are validated**: must resolve under the project folder; no `..` escapes.
- **API key handling**: there are no API keys in Phase 1. Phase 2 adds them via `.env`. Never log key values.
- **Don't add CORS to FastAPI** in Phase 1 — same-origin only via the Next.js proxy.

---

## 14. Performance budgets (Phase 1)

| Operation | Budget |
|---|---|
| Cold start of `pnpm dev` | ≤ 8 sec |
| Project open (existing project, 30 media files) | ≤ 1 sec |
| Alignment of 15-min audio (CUDA) | ≤ 90 sec |
| Alignment of 15-min audio (CPU) | ≤ 5 min |
| Cache-hit Draft render of 15-min video | ≤ 2 min |
| Cache-cold Draft render of 15-min video | ≤ 5 min |
| Cache-hit Final render of 15-min video | ≤ 8 min |
| Cache-cold Final render of 15-min video | ≤ 25 min |
| In-browser preview seek | ≤ 100 ms |

If a task's verification reveals a budget breach, treat it as a failure and diagnose.

---

## 15. License and attribution

The repo is the user's private project. No license headers. No third-party attribution files unless required by a dependency's license.
