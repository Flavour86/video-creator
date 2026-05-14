# Implementation Plan: Frontend Global Spec

## Overview

Implement `docs/designs/SPEC_FRONTEND_GLOBAL.md` as the Phase 1 frontend-global contract. The work makes the shared app shell match the spec, exposes persistent theme/language controls, centralizes shortcut boundaries, documents browser-storage ownership for global preferences and editor recovery state, and adds the visual-parity foundation needed for shell screenshots and later module-specific parity suites.

## Planning Assumptions

- `docs/designs/SPEC_FRONTEND_GLOBAL.md` is the source of truth for this plan.
- Existing `apps/web` implementation should be extended rather than replaced: `AppShell`, `PageChrome`, theme/language Zustand stores, i18n dictionaries, and shared UI primitives already exist.
- Root `tasks/plan.md` and `tasks/todo.md` were deleted in the current worktree; this plan recreates them for frontend-global work.
- Module-specific parity journeys for Launcher, Editor, and Render remain owned by their split specs, but frontend-global work must provide the common parity harness and coverage gate.
- No prototype CSS is copied. UI must use Tailwind classes, existing design tokens, and shared primitives.
- Verification commands should use the repo convention from `RTK.md`, for example `rtk pnpm -F @vc/web test`.

## Current Codebase Notes

- `apps/web/components/app-shell/AppShell.tsx` already owns global shell chrome, hydrates language/theme stores, and wraps pages in `NextIntlClientProvider`.
- `apps/web/lib/theme/theme-store.ts` persists `vc.theme` and applies `document.documentElement.dataset.theme`.
- `apps/web/lib/i18n/language-store.ts` persists `vc.language` and applies `document.documentElement.lang`.
- Current `AppShell.test.tsx` asserts theme/language controls are hidden, which conflicts with `SPEC_FRONTEND_GLOBAL.md`.
- `apps/web/lib/editor-operation-log/operation-log.ts` already contains editor undo/redo persistence and a typing-target guard, but render hotkeys still have their own narrower guard.
- There is no committed Playwright/SSIM visual parity harness yet.

## Architecture Decisions

- Keep `RootLayout` server-rendered and delegate interactive shell behavior to the existing client `AppShell`.
- Keep `ThemeInitScript` before `AppShell` so stored theme can apply before hydration; add language preload behavior only if implementation needs it to satisfy reload tests.
- Use existing storage keys: `vc.theme`, `vc.language`, and `vc.editor.operations.<projectId>`.
- Add the topbar controls inside `AppShellChrome` using existing shared primitives (`Button`, `IconButton`, `SegmentedControl`) and lucide icons where icon-only controls are used.
- Keep the topbar free of product navigation and phase labels; Launcher remains reachable through the brand/home affordance.
- Move shortcut-boundary detection into a shared frontend helper and consume it from editor and render shortcut code.
- Add visual parity as a web-owned test harness, with the shell dark/light screenshots implemented first and module-specific specs filling in their own state coverage.

## Dependency Graph

```text
i18n dictionaries and storage stores
  -> topbar controls and brand home affordance
  -> AppShell component tests
  -> reload and persistence tests

shared shortcut guard
  -> editor shortcut handlers
  -> render shortcut handlers
  -> shortcut-boundary tests

visual parity tooling
  -> shell dark/light parity tests
  -> split-spec screenshot inventory gate
  -> module-specific parity suites

all frontend-global tasks
  -> lint/build/test acceptance gate
```

## Task List

### Phase 1: Shell Behavior

## Task 1: Make the topbar match the frontend-global shell contract

**Description:** Update the shared app shell so the topbar renders the brand/home affordance on the left and theme/language controls on the right, while continuing to omit prototype navigation buttons and the phase suffix.

**Acceptance criteria:**

- [ ] Clicking the logo/application title navigates to Launcher at `/`.
- [ ] The topbar shows no visible Launcher/Setup/Editor/Render/Tokens navigation group.
- [ ] The topbar omits the `phase 1 - local` suffix.
- [ ] Theme and language controls are present on the right with accessible labels.
- [ ] The bottom bar still contains only the left command pill and right prototype/version badge.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- components/app-shell/AppShell.test.tsx`
- [ ] Manual check: render `AppShell` and verify brand click routes home and no global nav appears.

**Dependencies:** None

**Files likely touched:**

- `apps/web/components/app-shell/AppShell.tsx`
- `apps/web/components/app-shell/AppShell.test.tsx`
- `apps/web/lib/i18n/messages/en.json`
- `apps/web/lib/i18n/messages/zh.json`

**Estimated scope:** Medium

## Task 2: Prove theme and language persistence through the shell controls

**Description:** Connect the topbar controls to the existing Zustand stores and add component tests that exercise browser-storage persistence, DOM application, and reload hydration behavior.

**Acceptance criteria:**

- [ ] Theme toggle persists `vc.theme` to browser storage.
- [ ] Light theme applies `document.documentElement.dataset.theme = "light"` and dark theme clears the marker.
- [ ] Stored theme is re-applied when the shell hydrates after reload.
- [ ] Language control persists `vc.language` to browser storage.
- [ ] Stored language updates `document.documentElement.lang` and re-renders i18n-backed shell copy after reload.
- [ ] `RootLayout` keeps `ThemeInitScript` before `AppShell`.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- lib/theme/theme-store.test.ts lib/i18n/language-store.test.ts components/app-shell/AppShell.test.tsx components/app-shell/ThemeInitScript.test.tsx`
- [ ] `rtk pnpm -F @vc/web test -- lib/i18n/messages.test.ts`

**Dependencies:** Task 1

**Files likely touched:**

- `apps/web/components/app-shell/AppShell.tsx`
- `apps/web/components/app-shell/AppShell.test.tsx`
- `apps/web/components/app-shell/ThemeInitScript.test.tsx`
- `apps/web/lib/i18n/language-store.test.ts`
- `apps/web/lib/theme/theme-store.test.ts`

**Estimated scope:** Medium

### Checkpoint: Shell

- [ ] Tasks 1-2 pass.
- [ ] The shell visibly matches the global spec in dark and light themes.
- [ ] App shell tests no longer assert hidden theme/language controls.

### Phase 2: Storage And Shortcut Boundaries

## Task 3: Centralize shortcut-boundary detection

**Description:** Move typing-target detection into a shared frontend helper and use it anywhere global or page-level shortcuts listen for keyboard events.

**Acceptance criteria:**

- [ ] A shared helper returns true for `input`, `textarea`, `select`, and `contenteditable` targets.
- [ ] The helper also protects descendants inside a contenteditable container.
- [ ] Editor keyboard handlers use the shared helper.
- [ ] Render hotkeys use the shared helper instead of their local `closest("input, textarea, select")` check.
- [ ] Tests prove shortcuts do not fire while typing in all guarded target types unless explicitly scoped to that control.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- lib/shortcuts`
- [ ] `rtk pnpm -F @vc/web test -- app/editor/page.test.tsx app/render/page.test.tsx lib/render/useRenderHotkeys.test.ts`

**Dependencies:** None

**Files likely touched:**

- `apps/web/lib/shortcuts/isTextEditingTarget.ts`
- `apps/web/lib/shortcuts/isTextEditingTarget.test.ts`
- `apps/web/lib/editor-operation-log/operation-log.ts`
- `apps/web/lib/render/useRenderHotkeys.ts`
- `apps/web/app/editor/page.tsx`

**Estimated scope:** Medium

## Task 4: Lock the browser-storage ownership contract

**Description:** Add focused tests and light documentation comments where useful so global UI preferences and module-owned recovery state remain browser-storage owned.

**Acceptance criteria:**

- [ ] Tests document `vc.theme` and `vc.language` as the only global UI preference keys.
- [ ] Tests document `vc.editor.operations.<projectId>` as editor-owned undo/redo recovery state.
- [ ] Malformed editor operation logs are safely discarded from browser storage.
- [ ] No server API, shared schema, or SQLite persistence is introduced for global UI preferences.
- [ ] Existing editor operation replay tests still prove undo/redo recovery behavior.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- lib/theme lib/i18n lib/editor-operation-log`
- [ ] `rtk pnpm -F @vc/web lint`

**Dependencies:** Task 3

**Files likely touched:**

- `apps/web/lib/theme/theme-store.test.ts`
- `apps/web/lib/i18n/language-store.test.ts`
- `apps/web/lib/editor-operation-log/operation-log.test.ts`
- `apps/web/lib/editor-operation-log/operation-log.ts`

**Estimated scope:** Small

### Checkpoint: Storage And Shortcuts

- [ ] Tasks 3-4 pass.
- [ ] Global shortcuts are inert in typing targets.
- [ ] Browser storage ownership is covered by tests.

### Phase 3: Visual Parity Foundation

## Task 5: Add the frontend visual parity harness

**Description:** Add a web-owned visual parity test harness that can run the app, capture screenshots at fixed viewport sizes, and compare against `docs/designs/visuals` with SSIM >= 0.98.

**Acceptance criteria:**

- [ ] A visual test command exists for web parity checks.
- [ ] The harness can start or connect to the local Next.js app without interfering with `pnpm dev`.
- [ ] Screenshot comparison reports the reference path, actual path, and SSIM score on failure.
- [ ] The SSIM threshold defaults to `0.98`.
- [ ] Generated screenshot artifacts are ignored by git.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test:visual -- --help`
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/web lint`

**Dependencies:** Tasks 1-2

**Files likely touched:**

- `apps/web/package.json`
- `apps/web/playwright.config.ts`
- `apps/web/tests/visual/ssim.ts`
- `apps/web/tests/visual/visual-test-utils.ts`
- `.gitignore`

**Estimated scope:** Medium

## Task 6: Cover shell dark/light visual parity

**Description:** Use the visual parity harness to cover the two frontend-global shell screenshots: `shell-dark.png` and `shell-light.png`.

**Acceptance criteria:**

- [ ] One parity test covers `docs/designs/visuals/shell-dark.png`.
- [ ] One parity test covers `docs/designs/visuals/shell-light.png`.
- [ ] Each test sets the required browser storage before navigation.
- [ ] Each test captures the running implementation at a fixed viewport.
- [ ] Each comparison passes with SSIM >= 0.98.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test:visual -- shell`
- [ ] Manual check: inspect failure artifacts if SSIM is below threshold.

**Dependencies:** Task 5

**Files likely touched:**

- `apps/web/tests/visual/app-shell.visual.spec.ts`
- `apps/web/tests/visual/visual-test-utils.ts`
- `apps/web/components/app-shell/AppShell.tsx`
- `apps/web/styles/globals.css`

**Estimated scope:** Medium

## Task 7: Enforce split-spec screenshot coverage inventory

**Description:** Add a lightweight inventory gate that extracts embedded `docs/designs/visuals/*.png` references from split specs and verifies every screenshot has exactly one declared parity owner.

**Acceptance criteria:**

- [ ] The inventory includes screenshots from `SPEC_FRONTEND_GLOBAL.md`, `SPEC_LAUNCHER.md`, `SPEC_EDITOR.md`, and `SPEC_RENDER.md`.
- [ ] Duplicate parity ownership fails the inventory test.
- [ ] Missing parity ownership fails the inventory test.
- [ ] Frontend-global owns only the shell screenshots; module-specific screenshots are assigned to their corresponding split-spec parity suites.
- [ ] The gate is part of normal web tests or a documented visual verification command.

**Verification:**

- [ ] `rtk pnpm -F @vc/web test -- tests/visual/screenshot-inventory.test.ts`
- [ ] `rtk pnpm -F @vc/web test:visual -- shell`

**Dependencies:** Task 5

**Files likely touched:**

- `apps/web/tests/visual/screenshot-inventory.test.ts`
- `apps/web/tests/visual/visual-manifest.ts`
- `apps/web/tests/visual/visual-test-utils.ts`

**Estimated scope:** Medium

### Checkpoint: Visual Foundation

- [ ] Tasks 5-7 pass.
- [ ] Shell dark/light parity is covered.
- [ ] Missing module-specific parity coverage is visible through the inventory gate instead of being implicit.

### Phase 4: Acceptance Gate

## Task 8: Run the frontend-global acceptance gate

**Description:** Run and fix issues from the frontend-global verification set after shell behavior, storage, shortcuts, and shell visual parity are implemented.

**Acceptance criteria:**

- [ ] No visible top navigation bar exists in the app shell.
- [ ] Launcher is reachable from the shell brand/home affordance.
- [ ] `theme` and `language` UI preferences persist and re-apply on reload.
- [ ] Editor undo/redo recovery remains browser-storage backed.
- [ ] Shortcut boundaries are enforced globally.
- [ ] Topbar and bottom bar match the frontend-global spec.
- [ ] Shell visual parity tests pass at SSIM >= 0.98.
- [ ] The screenshot inventory gate identifies every split-spec screenshot owner.

**Verification:**

- [ ] `rtk pnpm test`
- [ ] `rtk pnpm lint`
- [ ] `rtk pnpm build`
- [ ] `rtk pnpm -F @vc/web test`
- [ ] `rtk pnpm -F @vc/web test:visual -- shell`

**Dependencies:** Tasks 1-7

**Files likely touched:**

- No new feature files expected; this is a fix-forward verification task.

**Estimated scope:** Small

### Checkpoint: Complete

- [ ] All frontend-global tasks pass.
- [ ] The shell contract is covered by unit/component tests and visual parity tests.
- [ ] Remaining Launcher, Editor, and Render visual parity work is assigned to module-specific suites through the inventory manifest.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Current tests assert hidden theme/language controls | Medium | Update tests first to match the approved spec, then implement shell controls. |
| Language reload may briefly render English before hydration | Medium | Add a language init script or hydration guard only if tests expose a visible mismatch. |
| Shortcut guards remain duplicated | Medium | Centralize the helper and import it from all keyboard listeners. |
| Visual parity harness adds slow tests to normal development | Medium | Keep screenshot comparison behind `test:visual`; keep inventory as the fast normal-test gate. |
| Module-specific screenshots lack parity owners | High | Add the inventory manifest now so missing ownership fails clearly before final Phase 1 acceptance. |

## Open Questions

- Should the final Phase 1 visual parity gate be implemented in this global plan, or should Launcher, Editor, and Render plans each add their own parity cases against the shared manifest?
- Should the brand/home affordance be implemented as a semantic link or a button that calls `router.push("/")`? Either can satisfy the spec, but a link is preferable if styling and App Router constraints allow it.
