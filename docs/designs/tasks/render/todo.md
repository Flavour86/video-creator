# Render Todo

## Phase 1: Contracts And Public Surface

- [x] Task 1: Lock the SPEC_RENDER shared contract
  - Acceptance: generated types cover presets, resolutions, stages, page states, history rows, output metadata, artifacts/events, and backend capabilities.
  - Verify: `rtk pnpm gen:types`, `rtk pnpm gen:py`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`
- [x] Task 2: Replace the backend render API with the spec surface
  - Acceptance: start, cancel, history, history delete, and video playback use `SPEC_RENDER.md` project-scoped paths; old conflicting callers/tests are rewritten.
  - Verify: `rtk pnpm -F @vc/server test -- test_render_endpoint.py`, `rtk pnpm -F @vc/server test -- test_render_history.py`, `rtk pnpm -F @vc/server lint`
- [x] Task 3: Add project-scoped render persistence and queue semantics
  - Acceptance: multiple render starts queue; queued/running/done/cancelled/failed rows persist consistently; successful render updates config-hash gating.
  - Verify: `rtk pnpm -F @vc/server test -- test_render_history.py`, `rtk pnpm -F @vc/server test -- test_render_progress.py`, `rtk pnpm -F @vc/server lint`
- [x] Checkpoint: API And Persistence
  - Acceptance: public paths match `SPEC_RENDER.md`; queue/history/artifact/event state can be inspected for queued, done, cancelled, and failed renders.

## Phase 2: Render Execution And Recovery

- [x] Task 4: Implement the exact render stage pipeline
  - Acceptance: stages execute in spec order; 1080p, 720p, and 9:16 outputs are correct H.264 MP4s with `+faststart`; empty visual config renders over black fallback.
  - Verify: `rtk pnpm -F @vc/server test -- test_render_endpoint.py`, `rtk pnpm -F @vc/server test -- test_filtergraph.py`, `rtk pnpm -F @vc/server test -- test_clip_cache.py`
- [x] Task 5: Persist live progress, ffmpeg logs, and output probes
  - Acceptance: WS emits at least 1 event/sec; stage/log/error events persist; output metadata is probed from disk; refresh/reconnect recovers latest state.
  - Verify: `rtk pnpm -F @vc/server test -- test_render_progress.py`, `rtk pnpm -F @vc/server test -- test_render_history.py`, `rtk pnpm -F @vc/server lint`
- [x] Task 6: Complete cancellation and failure recovery
  - Acceptance: queued and active cancellation work; one cancel request is sent; `.partial` handling, cleanup/exclusion, ffmpeg failures, DB failure, missing output, sidecar death, disk issues, and large logs are covered.
  - Verify: `rtk pnpm -F @vc/server test -- test_render_endpoint.py`, `rtk pnpm -F @vc/server test -- test_render_history.py`, `rtk pnpm -F @vc/server test -- test_render_progress.py`
- [x] Checkpoint: Execution
  - Acceptance: draft/final/vertical outputs probe correctly and all terminal/error states persist.

## Phase 3: Render Routing, Gating, And UI

- [x] Task 7: Replace Render routing and editor gating
  - Acceptance: `/render/:projectId/:render_id` is primary; invalid/missing segments redirect to Launcher; new aligned projects render immediately; already-rendered projects require config hash changes.
  - Verify: `rtk pnpm -F @vc/web test -- editor/page.test.tsx`, `rtk pnpm -F @vc/web test -- render/page.test.tsx`, `rtk pnpm -F @vc/server test -- test_project_load.py`
- [x] Task 8: Build the live Render progress page
  - Acceptance: header, progress card, stats, stages, status visuals, and ffmpeg log match `SPEC_RENDER.md` and update live.
  - Verify: `rtk pnpm -F @vc/web test -- render/page.test.tsx`, `rtk pnpm -F @vc/web test -- RenderCard`, `rtk pnpm -F @vc/web test -- LogCard`
- [x] Task 9: Complete history, output panel, and after-render actions
  - Acceptance: current-project history only; output panel uses actual disk metadata; `Play locally` is present; `Reveal in Explorer` is capability-gated; non-spec upload action is removed.
  - Verify: `rtk pnpm -F @vc/web test -- render/page.test.tsx`, `rtk pnpm -F @vc/web test -- HistoryPanel`, `rtk pnpm -F @vc/web test -- OutputPanel`, `rtk pnpm -F @vc/web test -- AfterRenderPanel`
- [x] Task 10: Wire cancel UX end to end
  - Acceptance: queued/running cancellation works from UI; active cancel confirms partial removal; exactly one request is sent; cancelling/cancelled state and history update without refresh.
  - Verify: `rtk pnpm -F @vc/web test -- render/page.test.tsx`, `rtk pnpm -F @vc/web test -- useRenderCancel`, `rtk pnpm -F @vc/server test -- test_render_endpoint.py`
- [x] Checkpoint: UI
  - Acceptance: route, gating, progress, logs, output, history, actions, and cancel behavior match `SPEC_RENDER.md`.

## Phase 4: Quality Gates And Acceptance

- [x] Task 11: Add backend render edge-case and performance coverage
  - Acceptance: all render edge cases and performance targets from `SPEC_RENDER.md` are covered; long-running checks are isolated behind explicit commands.
  - Verify: `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/server lint`
- [x] Task 12: Add Render visual parity coverage
  - Acceptance: every Render screenshot and required state has exactly one dark/light parity owner.
  - Verify: `rtk pnpm -F @vc/web test:visual -- render`, `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`, `rtk pnpm -F @vc/web lint`
- [x] Task 13: Add frame-level render correctness E2E
  - Acceptance: `test01` draft output is probed with ffprobe; subtitles, foreground, PiP, background transitions, watermark, screenshots, routing guards, and gating are checked.
  - Verify: `rtk pnpm -F @vc/web test:e2e -- render-correctness`, `rtk pnpm -F @vc/server test -- test_setup_test01_fixture.py`, `rtk pnpm -F @vc/server test -- test_render_endpoint.py`
- [ ] Task 14: Run the Render acceptance gate
  - Acceptance: all `SPEC_RENDER.md` functional, recoverability, visual, E2E, and verification requirements pass or have explicit integration prerequisites.
  - Verify: `rtk pnpm test`, `rtk pnpm lint`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`
- [ ] Checkpoint: Complete
  - Acceptance: Render implementation is ready for human review and `SPEC_RENDER.md` conflicts have been removed or overridden.

## Coordination Notes

- [ ] Backend-global project/config persistence must be stable before Tasks 3 and 7 fully enforce config-hash render gating.
- [ ] Frontend-global visual harness and screenshot inventory must land before Task 12.
- [ ] Launcher/Setup `test01` fixture work can feed Task 13; otherwise Task 13 must create its own draft artifact.
- [ ] Editor render-button work must align with Task 7's `/render/:projectId/:render_id` route.

## Resolved Decisions

- [x] SPEC_RENDER.md wins over conflicting current code, tests, prototype behavior, and older docs.
- [x] Primary Render route is `/render/:projectId/:render_id`.
- [x] Primary history API is `/projects/:projectId/history`.
- [x] Primary cancel API is `DELETE /projects/:projectId/render/:renderId`.
- [x] Non-spec after-render actions, including the current upload shortcut, are removed from the Render page.
