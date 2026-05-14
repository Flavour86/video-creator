# Implementation Plan: Backend Global Spec

## Overview

Implement `docs/designs/SPEC_BACKEND_GLOBAL.md` as the Phase 1 backend-global contract. The work makes SQLite the canonical project/config/render store, keeps user-visible project files in the project folder, adds the required upload and event surfaces, and locks safety gates around migrations, generated schemas, and SQL handling.

## Planning Assumptions

- `docs/designs/SPEC_BACKEND_GLOBAL.md` is the source of truth for this plan.
- Existing implementation that conflicts with the backend-global requirements should be removed or overridden, not preserved for compatibility.
- The current SQLite schema/data can be rebuilt destructively during this Phase 1 backend-global implementation when it conflicts with the target schema.
- `/uploads` is a public API route, and every uploaded asset is stored in the physical root-level `{root}/uploads/` directory.
- Generated schema outputs are regenerated from `packages/shared-schemas/project.schema.json`; they are never edited by hand.
- Existing uncommitted repository changes are outside this plan except for recreating `tasks/plan.md` and `tasks/todo.md`.

## Architecture Decisions

- Keep the existing Python 3.11 FastAPI sidecar and synchronous `sqlite3` stack. SQLite writes are local and short-lived; changing DB drivers is not required by the spec.
- Put raw SQL behind `apps/server/server/db/*` helpers. Routes should call repositories/services rather than build SQL.
- Rebuild the SQLite schema to match the spec when current tables conflict. Legacy DB data does not need to be preserved during this implementation.
- Treat `projects` as the canonical launcher project table. Do not keep `projects.last_opened_at` or `recent_projects`; launcher sorting uses `projects.last_render_at`.
- Store all uploaded assets under `{root}/uploads/`. Project configs reference uploaded assets by `mediaId`.
- Compute `project_configs.config_hash` from a normalized shared-schema model dump, not caller-supplied JSON order.
- Persist render lifecycle state before emitting WebSocket progress so reconnect/refresh can recover from SQLite.

## Dependency Graph

```text
Shared schema contract
  -> project config validation and hashing
  -> project/config SQLite migrations and repositories
  -> project filesystem setup and uploads
  -> render lifecycle persistence
  -> render artifacts/events persistence
  -> project-scoped WebSocket event delivery
  -> global acceptance, drift, lint, and test gates
```

## Task List

### Phase 1: Contract And Storage Foundation

## Task 1: Lock the Phase 1 project schema contract

**Description:** Align the shared project schema with the backend-global canonical config before changing persistence. This covers canonical `media[]`, multi-asset background support, PiP `posX`/`posY`, full output settings, and removal of Phase 2 `ai`/`characters` fields from the Phase 1 schema.

**Acceptance criteria:**

- [ ] `Project` validation accepts the Phase 1 canonical config required by the backend spec.
- [ ] `ai` and `characters` are removed from the source schema and generated outputs.
- [ ] Generated TS and Python schema outputs match the source schema after running generators.
- [ ] Tests fail if future AI/character fields are reintroduced without a spec revision.

**Verification:**

- [ ] `rtk pnpm -F @vc/shared-schemas gen:ts`
- [ ] `rtk pnpm -F @vc/shared-schemas gen:py`
- [ ] `rtk pnpm -F @vc/server test`

**Dependencies:** None

**Files likely touched:**

- `packages/shared-schemas/project.schema.json`
- `packages/shared-schemas/ts/index.ts`
- `packages/shared-schemas/py/schemas.py`
- `packages/shared-schemas/package.json`
- `apps/server/tests/test_project_schema.py`

**Estimated scope:** Medium

## Task 2: Add the Phase 2-safe AI provider boundary

**Description:** Add the required abstract AI-provider surface without adding any concrete AI integration, secrets, schema fields, or cloud behavior.

**Acceptance criteria:**

- [ ] `apps/server/server/adapters/ai/base.py` defines an importable `AIProvider` abstraction.
- [ ] No concrete provider, API key handling, cloud call, or config field is introduced.
- [ ] A regression test proves the import path remains stable.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** None

**Files likely touched:**

- `apps/server/server/adapters/__init__.py`
- `apps/server/server/adapters/ai/__init__.py`
- `apps/server/server/adapters/ai/base.py`
- `apps/server/tests/test_ai_provider_adapter.py`

**Estimated scope:** Small

## Task 3: Harden app DB initialization, PRAGMAs, and recovery

**Description:** Make app DB startup match the SQLite security and migration rules before further schema work: PRAGMAs, transactional migrations, missing DB recreation, corrupted DB backup/recreate, and clear recoverable errors.

**Acceptance criteria:**

- [ ] New connections enable `foreign_keys`, WAL, `synchronous=NORMAL`, `busy_timeout=5000`, and `temp_store=MEMORY`.
- [ ] A corrupted DB is renamed/backed up and a fresh migrated DB is created with a warning path visible to callers/logs.
- [ ] Migration checksum mismatch and raw SQLite errors are not exposed as user-facing route messages.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** None

**Files likely touched:**

- `apps/server/server/db/app_db.py`
- `apps/server/server/db/migrations.py`
- `apps/server/server/settings.py`
- `apps/server/tests/test_app_db.py`
- `apps/server/tests/test_health.py`

**Estimated scope:** Medium

### Checkpoint: Foundation

- [ ] Task 1 through Task 3 tests pass.
- [ ] Generated schema outputs are current.
- [ ] DB initialization works for missing, migrated, and corrupted DB files.
- [ ] Previously open backend-global questions are resolved in the spec and plan.

### Phase 2: Project And Config Persistence

## Task 4: Make `projects` the canonical project index

**Description:** Replace the current project/recent-project persistence with the spec `projects` table. Launcher sorting uses `last_render_at`; legacy `last_opened_at` and `recent_projects` behavior is removed.

**Acceptance criteria:**

- [ ] `projects` stores the spec-required project identity, metadata, hash, render, thumbnail, palette, and error fields.
- [ ] Existing recent/open/list/delete project routes are removed, redirected, or rewritten so they do not depend on `last_opened_at` or `recent_projects`.
- [ ] Existing conflicting DB schema/data is dropped or rebuilt instead of preserved.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 3

**Files likely touched:**

- `apps/server/server/db/migrations/006_projects_canonical.sql`
- `apps/server/server/db/projects.py`
- `apps/server/server/routes/projects.py`
- `apps/server/tests/test_app_db.py`
- `apps/server/tests/test_projects_route.py`

**Estimated scope:** Medium

## Task 5: Make `project_configs` the canonical single-row config store

**Description:** Replace append-only config snapshots with the spec table shape and save semantics: one canonical row per project, schema version, validated JSON, deterministic hash, and project dirty-state updates in one transaction.

**Acceptance criteria:**

- [ ] Saving invalid JSON or schema-invalid config rejects the request with no partial DB write.
- [ ] Equivalent config saves produce the same `config_hash`; any persisted property change changes the hash.
- [ ] Saving config updates `projects.current_config_hash` and `has_unrendered_changes` consistently.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 1, Task 4

**Files likely touched:**

- `apps/server/server/db/migrations/007_project_configs_canonical.sql`
- `apps/server/server/db/project_configs.py`
- `apps/server/server/routes/projects.py`
- `apps/server/tests/test_project_load.py`
- `apps/server/tests/test_project_schema.py`

**Estimated scope:** Medium

## Task 6: Enforce project filesystem and subtitles layout

**Description:** Ensure project creation/open/setup maintains the required user-visible files and internal `.vc` artifact folders without importing unrelated folder contents.

**Acceptance criteria:**

- [ ] Project setup creates or preserves `voice.wav`, `transcript.txt`, `subtitles.srt`, `media/`, `renders/`, `.vc/alignment.json`, `.vc/clips/`, `.vc/drafts/`, `.vc/thumbs/`, and `.vc/logs/` as appropriate.
- [ ] Existing partial folder layouts are completed idempotently and do not overwrite user media.
- [ ] Generated subtitles are written to `<project>/subtitles.srt`, not only under `.vc`.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 4, Task 5

**Files likely touched:**

- `apps/server/server/routes/projects.py`
- `apps/server/server/domain/project.py`
- `apps/server/server/pipeline/srt.py`
- `apps/server/tests/test_setup_route.py`
- `apps/server/tests/test_alignment_subtitles.py`

**Estimated scope:** Medium

## Task 7: Add the `/uploads` media ingestion API

**Description:** Add the spec-level upload surface that accepts render assets, returns stable `mediaId` values, and stores all uploaded files under `{root}/uploads/`. `POST /uploads` does not mutate project config directly; callers connect returned media IDs through `PUT /projects/:projectId/config`.

**Acceptance criteria:**

- [ ] `POST /uploads` accepts supported render assets, sanitizes filenames, prevents traversal, and returns `mediaId` plus metadata.
- [ ] Uploaded bytes are written under `{root}/uploads/`, not `<project>/media/`.
- [ ] Uploaded assets return schema-valid metadata and stable `mediaId` values that callers can persist in canonical `config.media[]` through `PUT /projects/:projectId/config`.
- [ ] Existing `/projects/media` behavior is removed, redirected, or rewritten if it conflicts with root-level upload storage.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 1, Task 5, Task 6

**Files likely touched:**

- `apps/server/server/routes/uploads.py`
- `apps/server/server/routes/media.py`
- `apps/server/server/main.py`
- `apps/server/server/db/project_configs.py`
- `apps/server/tests/test_media_upload.py`

**Estimated scope:** Medium

### Checkpoint: Project Persistence

- [ ] Task 4 through Task 7 tests pass.
- [ ] A project can be created, saved to SQLite, upload media to `{root}/uploads/`, and relaunch with the same canonical config.
- [ ] `subtitles.srt` is user-visible and `.vc` contains only internal artifacts.
- [ ] SQL-like payloads in paths/settings do not break tables.

### Phase 3: Render Persistence And Events

## Task 8: Align render history with project and config state

**Description:** Bring render lifecycle persistence to the spec table shape and make render completion update project dirty/rendered state.

**Acceptance criteria:**

- [ ] `render_history` rows include project ID, output path, preset, resolution, width/height, status, timestamps, codec fields, size/frame stats, config hash, message, and exclusion state.
- [ ] Draft/final are presets; vertical output is represented by `resolution`, `width`, and `height`, not a `vertical` preset.
- [ ] Successful render updates `projects.last_rendered_config_hash` and clears `has_unrendered_changes`; failed/cancelled renders do not.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 5

**Files likely touched:**

- `apps/server/server/db/migrations/008_render_history_canonical.sql`
- `apps/server/server/db/renders.py`
- `apps/server/server/pipeline/render.py`
- `apps/server/server/routes/render.py`
- `apps/server/tests/test_render_history.py`

**Estimated scope:** Medium

## Task 9: Persist render artifacts and events for recovery

**Description:** Align generated artifact/event persistence with the spec and make render progress recoverable after refresh or reconnect.

**Acceptance criteria:**

- [ ] `render_artifacts` stores only generated outputs, partials, logs, graphs, subtitles, and thumbnails with spec names and `size_bytes`.
- [ ] `render_events` stores ordered `phase`, `progress`, `message`, and `detail_json` records for each render.
- [ ] Render progress APIs can return the latest persisted state after page refresh or WebSocket reconnect.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 8

**Files likely touched:**

- `apps/server/server/db/renders.py`
- `apps/server/server/pipeline/render_progress.py`
- `apps/server/server/routes/render.py`
- `apps/server/tests/test_render_history.py`
- `apps/server/tests/test_render_progress.py`

**Estimated scope:** Medium

## Task 10: Scope `/ws` events by project ID

**Description:** Update the global WebSocket event surface so events are scoped by `project_id` and cannot leak between projects.

**Acceptance criteria:**

- [ ] `/ws` requires or derives `project_id` and rejects mismatched `project_id`/`render_id` pairs.
- [ ] Two simultaneous projects cannot receive each other's render events.
- [ ] Existing render progress clients either continue through a compatibility path or are updated in the same slice.

**Verification:**

- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 9

**Files likely touched:**

- `apps/server/server/routes/ws.py`
- `apps/server/server/pipeline/render_progress.py`
- `apps/server/server/db/renders.py`
- `apps/server/tests/test_render_progress.py`
- `apps/server/tests/test_render_endpoint.py`

**Estimated scope:** Medium

### Checkpoint: Render Persistence

- [ ] Task 8 through Task 10 tests pass.
- [ ] Every render creates consistent history, artifact, and event rows.
- [ ] Refresh/reconnect can recover current render progress from SQLite.
- [ ] Cross-project event leakage is covered by tests.

### Phase 4: Acceptance Gates

## Task 11: Add backend-global acceptance and drift gates

**Description:** Add final regression coverage and package scripts so the backend-global success criteria are enforced in normal verification.

**Acceptance criteria:**

- [ ] Generated schema drift is detected by a script or test that fails when generated TS/Python files differ from `project.schema.json`.
- [ ] Boundary tests cover parameterized SQL, app-settings whitelist, no UI preferences in SQLite, no raw SQLite error exposure, and no hand-edited generated schemas.
- [ ] The backend-global verification command set passes from a clean checkout.

**Verification:**

- [ ] `rtk pnpm -F @vc/shared-schemas gen:ts`
- [ ] `rtk pnpm -F @vc/shared-schemas gen:py`
- [ ] `rtk pnpm -F @vc/server test`
- [ ] `rtk pnpm -F @vc/server lint`

**Dependencies:** Task 1 through Task 10

**Files likely touched:**

- `scripts/check-generated-schemas.mjs`
- `package.json`
- `packages/shared-schemas/package.json`
- `apps/server/tests/test_backend_global_acceptance.py`
- `apps/server/tests/test_shared_api_schemas.py`

**Estimated scope:** Medium

### Checkpoint: Complete

- [ ] All backend-global functional acceptance criteria pass.
- [ ] All performance, security, migration, and recovery quality gates have tests.
- [ ] `rtk pnpm -F @vc/server test` passes.
- [ ] `rtk pnpm -F @vc/server lint` passes.
- [ ] Generated schema drift check passes.
- [ ] Human review approves any compatibility choices and open-question resolutions.

## Parallelization Opportunities

- Task 2 can run in parallel with Task 3.
- Task 6 can be implemented after Task 4 while Task 5 is finishing, but final integration depends on Task 5.
- Task 7 can run in parallel with Task 8 only after the shared schema and config repository contracts are stable.
- Task 11 can start as a test-only branch after Task 1, but final acceptance depends on all tasks.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Existing DB schema uses legacy column names and append-only config snapshots. | High | Rebuild/drop conflicting schema and data to match the backend-global spec. |
| Current shared schema includes undecided `ai` and `characters` fields. | Medium | Remove them in Task 1 before config persistence relies on the schema. |
| Existing routes may depend on per-project media storage or recent-project data. | Medium | Remove, redirect, or rewrite conflicting behavior instead of preserving it. |
| DB corruption recovery could hide a real migration bug. | High | Backup the bad DB, log/return a warning, and test checksum mismatch separately from corruption. |
| WebSocket scoping can regress existing render clients. | Medium | Keep compatibility endpoint or update frontend hook in the same task if required. |

## Resolved Decisions

- `projects.last_opened_at` is not needed. Launcher sorting uses `projects.last_render_at`.
- The current DB can be rebuilt destructively. Conflicting current data/schema may be dropped or overridden.
- `/uploads` is the API route, and all uploaded assets are stored in physical `{root}/uploads/`.
- `app_settings.default_output_preset` is the `app_settings` key whose value defaults to `{root}/projects`, it holds all output files distinguished <project_name>
- Existing `ai` and `characters` schema fields are removed now.
- Any current implementation against these requirements should be removed or overridden.
