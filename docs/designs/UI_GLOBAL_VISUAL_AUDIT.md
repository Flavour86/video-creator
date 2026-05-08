# UI Global Visual Audit

Date: 2026-05-08

Targets:

- Prototype: `http://192.168.31.48/app.html` returned HTTP 200 and matches the checked-in mirror at `docs/prototype/v1`.
- Implementation: `http://localhost:3000` from `pnpm -F @vc/web dev`.

Screenshot folder:

- `docs/designs/audits/ui-global-2026-05-08/prototype-launcher-dark-1440.png`
- `docs/designs/audits/ui-global-2026-05-08/prototype-launcher-light-1440.png`
- `docs/designs/audits/ui-global-2026-05-08/prototype-tokens-1440.png`
- `docs/designs/audits/ui-global-2026-05-08/prototype-editor-1440.png`
- `docs/designs/audits/ui-global-2026-05-08/prototype-launcher-950.png`
- `docs/designs/audits/ui-global-2026-05-08/launcher-1440.png`
- `docs/designs/audits/ui-global-2026-05-08/launcher-950.png`
- `docs/designs/audits/ui-global-2026-05-08/tokens-1440.png`
- `docs/designs/audits/ui-global-2026-05-08/tokens-950.png`

## Baseline Note

The rejected pre-migration Next shell could not be recaptured without reverting
completed work. It is preserved as the rejected reference in
`UI_GLOBAL_REQUIREMENTS.md`; this audit captures the current implementation and
the prototype instead.

## Browser Pass

Chrome DevTools MCP was used at `1440x1000` and `950x900`.

- Routes checked: Launcher (`/`), Setup (`/setup`), Editor (`/editor`), Render
  (`/render`), and Tokens (`/tokens`).
- At `1440x1000`, all five routes kept a 44px header, 32px fixed footer, no
  header cluster overlap, and no horizontal overflow other than the expected
  scrollbar delta on Tokens.
- At `950x900`, all five routes kept nav, theme, language controls, and footer
  visible. Language pills measured 42px wide, with no clipped English or Chinese
  labels.
- Active global nav items use the `--bg-4` active surface, matching the prototype
  `.seg button.on` rule.
- The footer is fixed to the viewport bottom. Page chrome reserves
  `--space-10`, so screen content does not sit underneath the status bar.
- Dark/light toggle worked on every route. Visible global chrome changed through
  tokens.
- English/Chinese toggle worked on every route. Header/footer labels switched
  while technical metadata, including `v0.1.0-prototype`, stayed stable.
- Keyboard traversal at `950px` reached global nav, theme toggle, language
  buttons, Launcher's primary action, and the footer command affordance. Focus
  outline was visible (`solid 2px`).

## Ambiguity Resolutions

- Tokens remains visible in the main nav for this development reference. The
  prototype exposes it and `UI_GLOBAL_REQUIREMENTS.md` makes it mandatory.
- Active global tabs use `--bg-4`. The Launcher/Setup screen spec's `bg-bg-2`
  active item applies to the Setup stepper, not the global shell nav.
- Footer positioning is fixed. This matches the persistent prototype status bar
  and passed the `1440px` and `950px` route checks.
- Cinema token names use the `--cinema-*` namespace and are documented/rendered
  in `/tokens`: canvas, preview, safe area, PiP, timeline, playhead, clip, and
  subtitle constants.

## Remaining Prototype Differences

- Launcher, Setup, Editor, and Render screen bodies were not fully redesigned in
  this pass. They were tokenized only enough to coexist with the global shell and
  shared primitives. Detailed screen matching belongs to the screen-specific
  tasks in `UI_LAUNCHER_SETUP_SPEC.md` and later Editor/Render specs.
- The browser audit ran the frontend dev server without the Python sidecar, so
  runtime chips displayed the unavailable state. Unit and API tests cover ready,
  warning, error, and fallback runtime states.
