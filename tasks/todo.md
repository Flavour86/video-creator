# Refactor Todo

## Phase 1: Contracts And Persistence Foundation

- [x] Task 1: Extend shared schema for project config, media, layers, setup, render, and response models.
- [x] Task 2: Add SQLite migration runner with `schema_migrations`.
- [x] Task 3: Implement `projects` table and stable `project_id`.
- [x] Task 4: Implement `project_configs` canonical save snapshots and config hashes.
- [ ] Task 5: Implement `render_artifacts` and `render_events`.
- [ ] Checkpoint: shared schemas regenerate, server tests pass, DB schema reviewed.

## Phase 2: API Surface And Project Flow

- [ ] Task 6: Add project-id API routes required by the prototype.
- [ ] Task 7: Implement native folder picker boundary or approved backend fallback.
- [ ] Task 8: Refactor Setup inspect/alignment flow to prototype behavior.
- [ ] Task 9: Refactor Launcher recent projects UI and rendered-project playback.
- [ ] Checkpoint: Launcher -> New project -> Setup -> Alignment -> Editor works.

## Phase 3: App Shell And Routing Parity

- [x] Task 10: Remove product-visible global route nav, phase suffix, top theme/language controls, and center status segment.
- [ ] Task 11: Guard Editor/Render by project id and hide Tokens from product UI.
- [ ] Checkpoint: shell and route behavior match prototype/spec.

## Phase 4: Editor State, Save, And Recovery

- [ ] Task 12: Load/save Editor config through SQLite `project_configs`.
- [ ] Task 13: Add browser-local incremental operation log, recovery, undo, and redo.
- [ ] Task 14: Refactor Editor toolbar to prototype controls and render enablement.
- [ ] Task 15: Implement draft render strip states and cancellation.
- [ ] Checkpoint: save/load/recovery/toolbar/draft render foundation works.

## Phase 5: Editor Transcript, Preview, Timeline, And Layers

- [ ] Task 16: Complete Transcript pane interactions and states.
- [ ] Task 17: Match transcript context menu and remove Cancel row.
- [ ] Task 18: Match Preview surface and controls, including watermark state.
- [ ] Task 19: Implement Timeline seek/select/move/stretch/delete with sentence synchronization.
- [ ] Task 20: Match Layers popover and remove footer add action.
- [ ] Checkpoint: core editor interactions match prototype.

## Phase 6: Editor Modals And Inspector

- [ ] Task 21: Implement Assign Media modal upload/import and overlap rules.
- [ ] Task 22: Implement Background modal playlist semantics and visible multiple assets.
- [ ] Task 23: Implement Global Video Config panel backed by saved config.
- [ ] Task 24: Implement Watermark asset modal with image/video upload and video loop semantics.
- [ ] Task 25: Implement Subtitles modal without cue list or per-cue merge.
- [ ] Task 26: Complete Inspector controls for subtitle/background/foreground/PiP.
- [ ] Checkpoint: modals and inspector persist and reload correctly.

## Phase 7: Render Page And Pipeline Parity

- [ ] Task 27: Match Render page header/layout to current-project prototype.
- [ ] Task 28: Drive progress and ffmpeg log from render events.
- [ ] Task 29: Populate output panel and render history rows from artifacts.
- [ ] Task 30: Implement cancel/partial-file behavior.
- [ ] Task 31: Implement play/reveal actions for successful outputs and Launcher playback.
- [ ] Checkpoint: draft/final render, cancel, history, play, and reveal work.

## Phase 8: Rendering Semantics And Cache Correctness

- [ ] Task 32: Support full spec layer model in filtergraph/render pipeline.
- [ ] Task 33: Implement alignment/render artifact cache reuse and invalidation.
- [ ] Task 34: Generate Launcher thumbnails from latest render or deterministic placeholder.
- [ ] Checkpoint: rendering semantics and cache behavior are correct.

## Phase 9: Edge Cases, Accessibility, And Tests

- [ ] Task 35: Add edge case state matrix across Launcher, Setup, Editor, and Render.
- [ ] Task 36: Add keyboard shortcut coverage and focus boundaries.
- [ ] Task 37: Run accessibility and responsive visual audit against prototype.
- [ ] Task 38: Add end-to-end fixture flow for create/open/align/edit/save/render/play.
- [ ] Final checkpoint: `rtk pnpm lint`, `rtk pnpm test`, `rtk pnpm build`, and browser visual comparison all pass.
