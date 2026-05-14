# Frontend Global Todo

## Phase 1: Shell Behavior

- [ ] Task 1: Make the topbar match the frontend-global shell contract
  - Acceptance: brand/title routes to `/`; no visible global nav or phase suffix; theme and language controls appear on the right; bottom bar remains command pill plus version badge.
  - Verify: `rtk pnpm -F @vc/web test -- components/app-shell/AppShell.test.tsx`
- [ ] Task 2: Prove theme and language persistence through the shell controls
  - Acceptance: `vc.theme` and `vc.language` persist to browser storage; DOM theme/lang re-apply on reload; `ThemeInitScript` remains before `AppShell`.
  - Verify: `rtk pnpm -F @vc/web test -- lib/theme/theme-store.test.ts lib/i18n/language-store.test.ts components/app-shell/AppShell.test.tsx components/app-shell/ThemeInitScript.test.tsx`
- [ ] Checkpoint: Shell
  - Acceptance: shell tests pass; topbar/right controls match the spec; current tests no longer assert hidden theme/language controls.

## Phase 2: Storage And Shortcut Boundaries

- [ ] Task 3: Centralize shortcut-boundary detection
  - Acceptance: shared helper guards input, textarea, select, contenteditable, and contenteditable descendants; editor and render shortcuts consume it.
  - Verify: `rtk pnpm -F @vc/web test -- lib/shortcuts`, `rtk pnpm -F @vc/web test -- app/editor/page.test.tsx app/render/page.test.tsx lib/render/useRenderHotkeys.test.ts`
- [ ] Task 4: Lock the browser-storage ownership contract
  - Acceptance: tests cover global preference keys and editor undo/redo recovery key; malformed operation logs are discarded; no server persistence is introduced for UI prefs.
  - Verify: `rtk pnpm -F @vc/web test -- lib/theme lib/i18n lib/editor-operation-log`, `rtk pnpm -F @vc/web lint`
- [ ] Checkpoint: Storage And Shortcuts
  - Acceptance: browser-storage ownership and shortcut boundaries are covered by tests.

## Phase 3: Visual Parity Foundation

- [ ] Task 5: Add the frontend visual parity harness
  - Acceptance: web visual test command exists; captures fixed-viewport screenshots; compares SSIM with threshold `0.98`; artifacts are gitignored.
  - Verify: `rtk pnpm -F @vc/web test:visual -- --help`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/web lint`
- [ ] Task 6: Cover shell dark/light visual parity
  - Acceptance: exactly one parity test covers `shell-dark.png`; exactly one covers `shell-light.png`; both pass with SSIM >= 0.98.
  - Verify: `rtk pnpm -F @vc/web test:visual -- shell`
- [ ] Task 7: Enforce split-spec screenshot coverage inventory
  - Acceptance: all split-spec `docs/designs/visuals/*.png` references have exactly one declared parity owner; frontend-global owns shell screenshots only.
  - Verify: `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`, `rtk pnpm -F @vc/web test:visual -- shell`
- [ ] Checkpoint: Visual Foundation
  - Acceptance: shell parity passes and missing module-specific parity ownership is explicit.

## Phase 4: Acceptance Gate

- [ ] Task 8: Run the frontend-global acceptance gate
  - Acceptance: functional shell/storage/shortcut requirements pass; shell visual parity passes; screenshot inventory coverage is enforced.
  - Verify: `rtk pnpm test`, `rtk pnpm lint`, `rtk pnpm build`, `rtk pnpm -F @vc/web test`, `rtk pnpm -F @vc/web test:visual -- shell`
- [ ] Checkpoint: Complete
  - Acceptance: frontend-global shell contract is covered by unit/component tests and shell visual parity; module-specific parity owners are declared for Launcher, Editor, and Render screenshots.

## Open Decisions

- [ ] Decide whether full Launcher/Editor/Render parity cases are implemented under this global plan or under their module-specific plans.
- [ ] Decide whether brand/home should be a semantic link or a router-backed button.
