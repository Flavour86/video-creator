# Backend Global Todo

## Phase 1: Contract And Storage Foundation

- [x] Task 1: Lock the Phase 1 project schema contract
  - Acceptance: canonical media/output/layer fields validate; `ai` and `characters` are removed; generated TS/Python are regenerated; AI/character fields cannot slip in without spec revision.
  - Verify: `rtk pnpm -F @vc/shared-schemas gen:ts`, `rtk pnpm -F @vc/shared-schemas gen:py`, `rtk pnpm -F @vc/server test`
- [x] Task 2: Add the Phase 2-safe AI provider boundary
  - Acceptance: importable `AIProvider` abstraction exists; no concrete provider/secrets/cloud behavior; regression import test exists.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Task 3: Harden app DB initialization, PRAGMAs, and recovery
  - Acceptance: required PRAGMAs enabled; corrupted DB backup/recreate path works; raw SQLite errors are not user-facing.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Checkpoint: Foundation
  - Acceptance: Tasks 1-3 pass; generated outputs current; missing/rebuilt/corrupted DB startup paths work.

## Phase 2: Project And Config Persistence

- [x] Task 4: Make `projects` the canonical project index
  - Acceptance: spec project fields stored; launcher sorting uses `last_render_at`; `last_opened_at`/`recent_projects` dependencies are removed; conflicting DB data may be dropped.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Task 5: Make `project_configs` the canonical single-row config store
  - Acceptance: invalid config rejects without partial write; deterministic hash behavior; project dirty state updates transactionally.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Task 6: Enforce project filesystem and subtitles layout
  - Acceptance: required project files/directories exist; partial folders complete idempotently; `subtitles.srt` is user-visible.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Task 7: Add the `/uploads` media ingestion API
  - Acceptance: upload route returns `mediaId`; assets are sanitized and stored under `{root}/uploads/`; project config connects returned media IDs through `PUT /projects/:projectId/config`; conflicting current media routes are removed or rewritten.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Checkpoint: Project Persistence
  - Acceptance: create/save/upload-to-root-uploads/relaunch flow works from SQLite-backed config.

## Phase 3: Render Persistence And Events

- [x] Task 8: Align render history with project and config state
  - Acceptance: spec render history fields persist; vertical output is resolution/width/height, not a preset; successful render clears dirty state.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Task 9: Persist render artifacts and events for recovery
  - Acceptance: generated artifacts only; ordered progress events persist; refresh/reconnect can recover state.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Task 10: Scope `/ws` events by project ID
  - Acceptance: mismatched project/render pairs are rejected; no cross-project event leak; clients remain compatible or are updated.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Checkpoint: Render Persistence
  - Acceptance: history, artifact, and event rows are consistent for done/cancelled/failed renders.

## Phase 4: Acceptance Gates

- [x] Task 11: Add backend-global acceptance and drift gates
  - Acceptance: schema drift check fails on stale generated outputs; boundary tests cover SQL/settings/errors/generated files; full verification passes.
  - Verify: `rtk pnpm -F @vc/shared-schemas gen:ts`, `rtk pnpm -F @vc/shared-schemas gen:py`, `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Checkpoint: Complete
  - Acceptance: backend-global functional acceptance, performance targets, security gates, migration gates, and recovery gates are covered and passing.

## Resolved Decisions

- [x] Use `projects.last_render_at`; do not keep `projects.last_opened_at`.
- [x] Allow destructive rebuild/drop of conflicting current DB schema/data.
- [x] Treat `/uploads` as the API route and `{root}/uploads/` as the physical asset directory.
- [x] Keep `app_settings.default_output_preset` as the app setting key whose value defaults to `{root}/projects`, it holds all output files distinguished <project_name>
- [x] Remove existing `ai` and `characters` schema fields now.
- [x] Remove or override any current implementation that conflicts with these requirements.
