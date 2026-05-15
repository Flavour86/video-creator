# Launcher And Setup Todo

## Phase 1: Contracts And Setup Foundation

- [X] Task 1: Lock the Launcher and Setup shared contracts
  - Acceptance: generated schemas cover output presets, Launcher cards/pagination, Setup subtitle state, and render status tags; generated TS/Python compile without hand edits.
  - Verify: `rtk pnpm gen:types`, `rtk pnpm gen:py`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`
- [X] Task 2: Add the backend Setup draft boundary
  - Acceptance: staged voice/subtitle/transcript/watermark artifacts do not create the final project folder; cancelled drafts can be cleaned up safely.
  - Verify: `rtk pnpm -F @vc/server test -- test_setup_route.py`, `rtk pnpm -F @vc/server lint`
- [X] Checkpoint: Contracts
  - Acceptance: shared contracts are generated and backend tests prove Setup drafts are not canonical projects.

## Phase 2: Launcher Recents And Preview

- [X] Task 3: Make Launcher recents spec-compliant end to end
  - Acceptance: `GET /projects` paginates/sorts recents; `DELETE /projects/:projectId` removes cards; missing/corrupt config cleanup is covered; UI shows all card fields and no raw path.
  - Verify: `rtk pnpm -F @vc/server test -- test_projects_route.py`, `rtk pnpm -F @vc/web test -- page.test.tsx`, `rtk pnpm -F @vc/web lint`
- [X] Task 4: Implement Launcher thumbnails and video preview modal
  - Acceptance: fallback thumbnails are deterministic; latest successful render thumbnails are preferred; play icon opens an in-app modal video preview.
  - Verify: `rtk pnpm -F @vc/server test -- test_projects_route.py`, `rtk pnpm -F @vc/web test -- page.test.tsx`, `rtk pnpm -F @vc/web test -- ProjectCard`
- [X] Checkpoint: Launcher
  - Acceptance: empty, populated, missing/corrupt, paginated, thumbnail, and video-preview Launcher states work.

## Phase 3: Four-Step Setup Flow

- [X] Task 5: Build the four-step Setup state machine and layout
  - Acceptance: Project Name, Voice, Subtitle, and Alignment checks drive the UI; output preset segmented control has all three options; cancel does not persist partial Setup state.
  - Verify: `rtk pnpm -F @vc/web test -- setup/page.test.tsx`, `rtk pnpm -F @vc/web test -- useSetupDraft.test.ts`, `rtk pnpm -F @vc/web lint`
- [X] Task 6: Implement Subtitle Generate vertical slice
  - Acceptance: `POST /subtitle` generates `subtitles.srt`, reports cue count/duration/status/cache, and checks Subtitle only after success.
  - Verify: `rtk pnpm -F @vc/server test -- test_transcribe.py`, `rtk pnpm -F @vc/server test -- test_setup_route.py`, `rtk pnpm -F @vc/web test -- setup/page.test.tsx`
- [X] Task 7: Implement Subtitle Alignment vertical slice
  - Acceptance: `POST /subtitle/alignment` uses selected transcript plus generated subtitles, reports correction count, invalidates stale cache, and checks Alignment only after success.
  - Verify: `rtk pnpm -F @vc/server test -- test_alignment_subtitles.py`, `rtk pnpm -F @vc/server test -- test_alignment_integration.py`, `rtk pnpm -F @vc/web test -- setup/page.test.tsx`
- [X] Task 8: Create the final project and hand off to Editor
  - Acceptance: `POST /projects` materializes the final layout only after all four checks, persists preset/watermark/config/thumbnail, and routes to `/editor/:projectId`.
  - Verify: `rtk pnpm -F @vc/server test -- test_projects_route.py`, `rtk pnpm -F @vc/server test -- test_project_schema.py`, `rtk pnpm -F @vc/web test -- setup/page.test.tsx`
- [X] Checkpoint: Setup
  - Acceptance: Launcher -> Setup -> subtitle generation -> alignment -> create project -> Editor works without premature project persistence.

## Phase 4: Hardening, Visuals, And Acceptance

- [X] Task 9: Cover Launcher and Setup edge cases
  - Acceptance: all spec-listed Launcher, Setup, subtitle generation, alignment, CUDA/WhisperX, transcript, and voice error states have focused tests and recoverable UI errors.
  - Verify: `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`, `rtk pnpm lint`
- [ ] Task 10: Add Launcher and Setup visual parity coverage
  - Acceptance: every Launcher/Setup screenshot in `SPEC_LAUNCHER.md` has exactly one parity owner and meets the shared SSIM threshold.
  - Verify: `rtk pnpm -F @vc/web test:visual -- launcher`, `rtk pnpm -F @vc/web test:visual -- setup`, `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
- [ ] Task 11: Add operational Launcher and Setup E2E browser flows
  - Acceptance: six spec-defined Playwright flows are implemented and runnable (Flow 1 empty->setup->cancel, Flow 2 populated Launcher + modal + pagination + editor nav, Flow 3 Setup happy path, Flow 4 failure/retry recovery, Flow 5 dependency resets, Flow 6 dark/light smoke + checkpoint screenshots).
  - Verify: `rtk pnpm -F @vc/web test:e2e -- tests/e2e/launcher-setup-flows.spec.ts`, `rtk pnpm -F @vc/web test:e2e -- --grep "Flow 1|Flow 2|Flow 3|Flow 4|Flow 5|Flow 6"`
- [ ] Task 12: Run the Launcher and Setup acceptance gate
  - Acceptance: all Launcher/Setup functional, edge-case, visual, and E2E criteria are passing or documented behind explicit local integration flags.
  - Verify: `rtk pnpm test`, `rtk pnpm lint`, `rtk pnpm build`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/server test`, `rtk pnpm -F @vc/web test:visual -- launcher setup`
- [ ] Checkpoint: Complete
  - Acceptance: plan is ready for human review and implementation can proceed one task per commit.

## Coordination Notes

- [ ] Backend-global project/config persistence tasks must land before or with Tasks 3 and 8.
- [ ] Frontend-global visual harness and screenshot inventory must land before Task 10.
- [ ] Tasks 3-8 (Launcher+Setup contracts and behavior) should be stable before Task 11 to avoid brittle E2E rewrites.
