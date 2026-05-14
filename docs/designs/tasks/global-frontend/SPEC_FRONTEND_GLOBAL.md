# Video Creator Spec - Frontend Global

Parent spec index: [SPEC.md](../../SPEC.md).

Global frontend concerns include shell layout, theme/language i18n controls, browser-storage-owned UI preferences, shared UI primitives, and keyboard shortcut boundaries.

## Frontend Global Ownership

- Frontend stack: Next.js 15, React 19, TypeScript, App Router.
- UI state: Zustand and focused hooks under `apps/web/lib`.
- Client persistence: browser storage for UI preferences, draft editing state, and incremental undo/redo operations.
- Styling: Tailwind CSS using existing design tokens and shared primitives. Do not copy prototype CSS directly.
- UI copy lives in i18n files.
- Use shared primitives for buttons, icon buttons, segmented controls, forms, tags, panels, modals, and layer chips.
- Browser storage owns global UI preferences: `theme` and `language`.

## App Shell Components

### Topbar
### Visual Truth
![dark](../../visuals/shell-dark.png)
![light](../../visuals/shell-light.png)

#### Left: Logo and Application title
Intereaction:
 - click the `logo and Application title` locate to `Launcher`(home) Page

#### Right: Theme And Language

- Theme toggle: dark/light.
- Language toggle: English/Chinese.

Browser storage owns UI preferences:

- `theme`
- `language`

### Bottom
#### left command pill
#### right prototype/version badge

## Keyboard Shortcuts

Shortcut boundary:

- Shortcuts must not fire while typing in input, textarea, select, or contenteditable unless the shortcut is explicitly for that control.


## Testing Strategy

Testing pyramid: frontend unit/component tests are fast and broad, backend module tests are deterministic, browser/render journeys are slow but authoritative, and visual parity tests guard prototype regressions.

Shared fixtures:

- `test01` ([../../projects/test01](../../projects/test01)) is the canonical E2E/integration fixture with voice, transcript, mixed media, and a project config that exercises every layer type.
- A minimal in-repo fixture (short voice + <=3-sentence transcript) is used for unit-level pipeline tests.

Visual similarity:

- SSIM is the visual parity metric, scale 0-1.
- Pass threshold is **>= 0.98**, intended to be indistinguishable to a viewer while allowing sub-pixel rendering noise across machines.

### Frontend unit/component tests (Vitest + Testing Library)

- App shell:
  - Topbar omits prototype nav buttons and the `phase 1 - local` suffix.
  - Bottom bar omits the center live-status segment; keeps left command pill + right version badge.
  - Theme toggle dark/light persists to browser storage and re-applies on reload.
  - Language toggle EN/CN persists to browser storage and re-applies on reload.
  - Shortcut boundaries hold: shortcuts do not fire while typing in input, textarea, select, or contenteditable unless explicitly scoped to that control.

Coverage rule:

- Every interaction described anywhere in the split specs must be exercised by at least one frontend unit/component test or E2E journey.
- A documented interaction with no test is a frontend failure.

### E2E / browser tests (Playwright + ffmpeg)

- Browser journeys run against a real FastAPI + Next.js process pair (`pnpm dev`).
- Module-specific journeys live with Launcher, Editor, and Render specs.

### Visual parity tests (regression guard)

For every visual screenshot embedded in these split specs from App Shell through Render, the implementation must produce a matching screenshot from the running app. Coverage rule: every embedded spec screenshot has exactly one parity test; a missing parity test is a frontend failure.

For each screen and interaction state (default, each modal open, each render state, error states):

- Capture a screenshot from the running app at a fixed viewport size.
- Compare with the corresponding prototype reference in `docs/prototype/v1/` rendered to the same viewport.
- Pass when SSIM >= 0.98.
- No prototype CSS may be copied; implementation must use Tailwind + shared primitives.

### Verification commands

```bash
pnpm test
pnpm lint
pnpm build
pnpm -F @vc/web test
```

## Success Criteria

Phase 1 frontend-global work is accepted when all items below hold.

### Functional Acceptance

- The app has no visible top navigation bar with Launcher/Setup/Editor/Render/Tokens buttons.
- Launcher is always reachable as home.
- Browser storage holds UI preferences `theme` and `language`.
- Browser storage re-applies persisted theme and language on reload.
- Browser storage also supports module-owned recovery state where specified, including Editor undo/redo operation history.
- Shortcut boundaries are enforced globally: app shortcuts do not fire while typing in input, textarea, select, or contenteditable unless explicitly scoped to that control.
- Topbar renders logo/application title plus theme and language controls.
- Bottom bar keeps the left command pill and right prototype/version badge.

### Quality Gates

- Every documented frontend interaction in the split specs is exercised by at least one frontend test or E2E journey.
- A documented interaction with no frontend test or E2E journey is a Phase 1 failure.
- Every visual screenshot embedded in the split specs from App Shell through Render has a matching implementation screenshot with SSIM >= 0.98.
- Every screen, modal, and interaction state present in `docs/prototype/v1/` has a parity test.
- Missing parity coverage for any embedded spec screenshot or prototype screen is a frontend failure.
- No prototype CSS is copied; implementation uses Tailwind + shared primitives.
