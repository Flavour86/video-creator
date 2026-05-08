# UI Global Implementation Task List

Source requirements: [UI_GLOBAL_REQUIREMENTS.md](./UI_GLOBAL_REQUIREMENTS.md)

Execute these tasks in order. Each task lists the implementation surface:

- `[FE]`: frontend code in `apps/web`
- `[BE]`: backend code in `apps/server`
- `[SHARED]`: shared schemas/types in `packages/shared-schemas`
- `[DOC]`: documentation or implementation notes
- `[QA]`: tests, screenshots, manual verification

The prototype at `http://192.168.31.48/app.html` remains the visual source of
truth. When a detail is unclear, inspect the prototype with Chrome DevTools MCP
at `1440x1000` first, then again near `950px` width.

## 0. Baseline And Guardrails

1. `[QA]` Capture the current rejected implementation at `localhost:3000` for
   comparison before UI work starts.
   - Use at least `1440x1000`.
   - Save screenshots outside committed source or in a documented visual audit
     folder if the repo later adopts one.

2. `[QA]` Capture the prototype global shell at `http://192.168.31.48/app.html`.
   - Capture dark Launcher, light Launcher, Tokens, and Editor shell.
   - Repeat one capture around `950px` width to verify the minimum desktop
     layout.

3. `[DOC]` Record in the implementation notes that the current simple Next nav
   in `apps/web/app/layout.tsx` is not the target shell.

4. `[FE]` Identify all frontend files that currently hardcode visual primitives.
   - Start with `apps/web/styles/globals.css`, `apps/web/app/layout.tsx`, and
     page-level Tailwind classes in `apps/web/app/**/page.tsx`.
   - Do not refactor screen content yet. Only list the files and plan the
     global migration path.

5. `[BE]` Identify backend data already available for runtime and workspace
   status.
   - Existing `/health` only returns `status` and `version`.
   - Existing recent-project metadata has path, name, last opened, sentence
     count, media count, and voice duration placeholders.
   - Mark missing runtime fields before adding frontend status UI.

## 1. Token Foundation

6. [x] `[FE]` Replace the minimal HSL globals in `apps/web/styles/globals.css` with
   prototype-compatible CSS custom properties.
   - Include `--bg-0` through `--bg-5`.
   - Include `--text` through `--text-4`.
   - Include `--line` and `--line-soft`.
   - Include accent tokens for amber, blue, green, red, and violet.
   - Include font, radius, and shadow tokens.

7. [x] `[FE]` Add dark theme values as the default token set on `:root`.
   - Match the observed OKLCH dark values from `UI_GLOBAL_REQUIREMENTS.md`.
   - Body background must use `--bg-0`.
   - Body text must use `--text`.

8. [x] `[FE]` Add light theme values under `:root[data-theme="light"]`.
   - Use the prototype light OKLCH ramp.
   - Keep semantic token names identical between themes.

9. [x] `[FE]` Add typography tokens.
   - `--font-sans`: Inter Tight with system sans fallback.
   - `--font-mono`: JetBrains Mono with system mono fallback.
   - Add named CSS utility classes or component classes for display, H2, section
     title, body, caption, eyebrow, mono timecode, and mono metadata.

10. [x] `[FE]` Load or declare the font strategy.
    - Prefer Next font loading if bundled fonts are available.
    - Otherwise use CSS font stacks without network dependence.
    - Verify Windows fallback still resembles the prototype.

11. [x] `[FE]` Add spacing tokens.
    - `space-1` through `space-12` must map to the requirement values.
    - Use these tokens in new shared components instead of arbitrary Tailwind
      spacing values.

12. [x] `[FE]` Add radius tokens.
    - `--r-sm: 4px`
    - `--r: 6px`
    - `--r-md: 10px`
    - `--r-lg: 14px`
    - Add a pill convention for status tags and circular controls.

13. [x] `[FE]` Add elevation tokens.
    - `--shadow-1` for subtle inline elevation.
    - `--shadow-2` for modal and popover elevation.
    - Keep inline cards mostly flat with borders.

14. [x] `[FE]` Add cinema tokens.
    - Aspect constants for `16:9` and `9:16`.
    - Final canvas constants for `1920x1080`, `30fps`, SDR, BT.709.
    - Draft canvas constants for `1280x720`, `30fps`.
    - Preview fit, subtitle safe area, watermark safe area, PiP bounds, timeline
      track heights, playhead width, and clip radius.

15. [x] `[QA]` Add a token audit check.
    - Search changed frontend files for raw `oklch`, `hsl`, hex colors, one-off
      pixel radii, and one-off font sizes.
    - Raw values are allowed only inside token declarations.

## 2. Shared Frontend Primitives

16. [x] `[FE]` Create a design-system component folder in `apps/web/components`.
    - Suggested path: `apps/web/components/ui`.
    - Keep components small and reusable.

17. [x] `[FE]` Implement `Button`.
    - Variants: primary, render/accent, default, ghost, danger, small, extra-small,
      and icon-only.
    - Use tokenized height, padding, radius, border, hover, active, disabled, and
      focus states.

18. [x] `[FE]` Implement `IconButton`.
    - Use `lucide-react` icons where available.
    - Require an accessible label.
    - Support tooltip/title text for unfamiliar icons.

19. [x] `[FE]` Implement `SegmentedControl`.
    - Use it for the top nav, language selector, resolution selector, preview
      scale, and mode controls.
    - Active item uses active surface or accent where specified.

20. [x] `[FE]` Implement `StatusTag`.
    - Variants: idle, cached, aligned, composing, missing asset, ready, warning,
      info, error.
    - Map variants to green, amber, blue, red, violet, or neutral tokens.

21. [x] `[FE]` Implement `Kbd`.
    - Support command chips such as `Ctrl+K`, `Cmd+K`, `Ctrl+F`, and `Space`.
    - Use mono or compact caption treatment.

22. [x] `[FE]` Implement `Panel`, `Surface`, or equivalent layout primitive.
    - Must use tokenized background, border, radius, and padding.
    - Must not encourage card nesting.

23. [x] `[FE]` Implement form primitives.
    - Text input, search input, select, spinbutton-like numeric input, checkbox or
      toggle where needed.
    - Labels use eyebrow/caption tokens.

24. [x] `[FE]` Implement `LayerChip`.
    - Variants: subtitles, PiP, foreground, background.
    - Preserve layer semantics and z-order language.

25. [x] `[QA]` Add focused component tests for shared primitives.
    - Verify class variants render.
    - Verify accessible names on icon buttons.
    - Verify disabled and active states.

## 3. App Shell

26. [x] `[FE]` Replace the simple `apps/web/app/layout.tsx` nav with a global app
    shell.
    - Root layout can stay server-rendered, but interactive shell controls should
      live in a client component.
    - Suggested component: `apps/web/components/app-shell/AppShell.tsx`.

27. [x] `[FE]` Implement the compact header.
    - Height about `44px`.
    - Full viewport width.
    - Surface uses `--bg-1`.
    - No floating card styling.

28. [x] `[FE]` Implement the left brand cluster.
    - Square `VC` mark.
    - Product name `Video Creator`.
    - Phase label `phase 1 - local` or the exact localized equivalent selected
      during copy review.
    - Use tokenized typography and spacing.

29. [x] `[FE]` Implement centered navigation.
    - Items: Launcher, Setup, Editor, Render, Tokens.
    - Use `SegmentedControl`.
    - Active item must follow the current route.
    - Inactive item text uses `--text-2`.
    - Active item uses `--bg-4` or `--bg-5` according to prototype inspection.

30. [x] `[FE]` Add route for `/tokens`.
    - The prototype has Tokens in the nav.
    - Keep it visible while implementing UI fidelity.
    - If production later hides it, keep the route accessible to developers.

31. [x] `[FE]` Implement right-side theme toggle.
    - Icon-only button.
    - Accessible name: `Toggle theme`.
    - Dark mode shows sun icon; light mode shows moon icon, matching prototype.

32. [x] `[FE]` Implement right-side language selector.
    - Segmented control with `EN` and `中文`.
    - Selected language uses active pill.
    - It must not shift header layout when switching languages.

33. `[FE]` Implement global status bar.
    - Fixed or sticky bottom treatment matching prototype behavior.
    - Left command segment.
    - Center runtime/status segments.
    - Right version segment.
    - Allow screen-specific status content.

34. `[FE]` Add page chrome wrappers.
    - All pages should render inside the app shell.
    - Remove max-width marketing container assumptions from existing pages.
    - Ensure page top padding aligns with the prototype below the header.

35. `[QA]` Verify header geometry with Chrome DevTools.
    - At `1440x1000`, header height should be close to `44px`.
    - Navigation should remain centered.
    - Right controls should remain aligned to the right.

## 4. Theme State

36. `[FE]` Add global theme state.
    - Default: dark.
    - Persist in `localStorage`.
    - Apply by setting `document.documentElement.dataset.theme`.

37. `[FE]` Prevent theme flash where practical.
    - Use a small pre-hydration script if needed.
    - Initial server output should not visibly flash white before dark mode.

38. `[FE]` Wire every shared primitive to theme tokens.
    - No component-level dark-mode color branches unless they assign token names.

39. `[QA]` Verify dark and light modes on Launcher, Editor, Render, and Tokens.
    - Check surfaces, text, borders, tags, buttons, fields, timeline, and preview
      surfaces.

## 5. Language State And Localization

40. `[FE]` Add global language state.
    - Supported values: `en`, `zh`.
    - Persist in `localStorage`.
    - Apply `lang` attribute to the `<html>` element.

41. `[FE]` Add frontend dictionaries.
    - Suggested path: `apps/web/lib/i18n`.
    - Include app shell, global controls, status labels, buttons, tooltips,
      validation messages, empty states, and page-level labels as screens are
      migrated.

42. `[FE]` Replace hardcoded global shell copy with dictionary lookups.
    - Navigation labels.
    - Theme tooltip.
    - Language control label.
    - Footer/status labels.

43. `[FE]` Preserve technical metadata as language-neutral.
    - Paths, timecodes, codec names, version strings, GPU names, and cache counts
      should remain stable.

44. `[QA]` Test language switching at `1440px` and near `950px`.
    - No clipping.
    - No header shift.
    - No overlapping controls.

## 6. Runtime And Workspace Status Data

45. `[BE]` Expand backend runtime health data.
    - Add a runtime endpoint or expand `/health`.
    - Include sidecar status, Python version, ffmpeg version, CUDA availability,
      GPU label when available, WhisperX model/status when available, and server
      version.
    - Return unknown/unavailable states explicitly instead of omitting fields.

46. `[BE]` Add active render count.
    - Derive from render DB rows or active render manager.
    - Expose count for Launcher and status bar.

47. `[BE]` Add cached project count if not already derivable.
    - Count recent projects with cache metadata, or return a conservative count.
    - Document exact definition in the endpoint schema.

48. `[BE]` Improve recent project metadata.
    - Voice duration should be populated when audio metadata exists.
    - Sentence count should reflect transcript/alignment data.
    - Media count should include media folder assets.
    - Alignment state should be derivable as `aligned`, `pending`, or `missing`.

49. `[SHARED]` Add shared schemas for runtime status and enriched recent project
    metadata.
    - Keep frontend and backend response types aligned.

50. `[FE]` Add frontend data hooks for runtime status.
    - Suggested hook: `useRuntimeStatus`.
    - Use polling or SWR-like refresh only if needed.
    - Avoid noisy UI updates.

51. `[FE]` Wire Launcher and status bar to runtime data.
    - Use green for ready/healthy.
    - Use amber for pending/in-progress.
    - Use red for missing/failed.

52. `[QA]` Add backend tests for runtime status responses.
    - Mock unavailable ffmpeg/CUDA/WhisperX states.
    - Verify stable JSON schema.

53. `[QA]` Add frontend tests for runtime status rendering.
    - Verify healthy, warning, and error states.

## 7. Tokens Interface

54. `[FE]` Implement `/tokens` page using real shared components.
    - The page must not be a static mock disconnected from the app components.
    - It should render the same `Button`, `SegmentedControl`, `StatusTag`,
      `Kbd`, form fields, and `LayerChip` used elsewhere.

55. `[FE]` Add Colors section.
    - Show surfaces, text ramp, lines, and accents.
    - Include token names and semantic descriptions.

56. `[FE]` Add Type section.
    - Show the two font families.
    - Show all type roles from the requirements.
    - Use mono examples for timecodes and paths.

57. `[FE]` Add Spacing section.
    - Show `space-1` through `space-12`.
    - Include numeric pixel values.

58. `[FE]` Add Radii section.
    - Show `--r-sm`, `--r`, `--r-md`, `--r-lg`, and pill convention.

59. `[FE]` Add Shadows section.
    - Show inline elevation and modal/popover elevation.

60. `[FE]` Add Cinema section.
    - The currently inspected prototype Tokens page does not show a Cinema
      section, but the global requirements require it.
    - Include canvas, preview, safe area, PiP, timeline, playhead, and clip
      tokens.

61. `[FE]` Add Components section.
    - Buttons.
    - Tags/status.
    - Form fields.
    - Keyboard chips.
    - Layer chips.

62. `[DOC]` Add a short note in the Tokens page or adjacent docs that components
    must reference tokens and shared primitives, never raw values.

63. `[QA]` Verify Tokens page in dark and light themes.
    - It must update through tokens with no special-case color branches.

## 8. Global Layout And Responsive Rules

64. `[FE]` Remove marketing-style max-width assumptions from global page wrappers.
    - Use workstation-style wide surfaces.
    - Keep content aligned with prototype margins.

65. `[FE]` Define desktop breakpoint behavior.
    - `950px` is the minimum required desktop fidelity width.
    - Header nav, theme control, and language control must remain visible.

66. `[FE]` Define stable dimensions for fixed-format elements.
    - Header controls.
    - Status bar segments.
    - Preview stages.
    - Timeline tracks.
    - Layer chips.
    - Icon buttons.

67. `[FE]` Audit all text containers.
    - Buttons, tags, cards, panels, and status segments must avoid clipping and
      overlap in English and Chinese.

68. `[QA]` Screenshot compare global shell at `1440x1000` and around `950px`.
    - Compare prototype vs implementation.
    - Record differences before moving to screen-specific redesign.

## 9. Interaction And Accessibility

69. `[FE]` Add focus-visible treatment to shared controls.
    - Use tokens.
    - Keep it visible but restrained.

70. `[FE]` Add hover and active treatment to shared controls.
    - Hover uses `--bg-4`.
    - Active/selected uses `--bg-5` or the relevant accent token.

71. `[FE]` Add accessible names to icon-only controls.
    - Theme toggle.
    - Header icon controls.
    - Timeline/transport icon controls as those screens are migrated.

72. `[FE]` Add local workspace interaction language.
    - Folder and file actions should read as local operations.
    - Avoid cloud upload language unless a later phase explicitly adds it.

73. `[FE]` Add drag/drop visual states where global surfaces support them.
    - Project folder drop.
    - Media assignment drop zones.
    - Timeline clip assignment zones.
    - Screen-specific behavior can be implemented later, but shared visual states
      should exist now.

74. `[QA]` Keyboard test the global shell.
    - Tab order reaches nav, theme toggle, language buttons, primary page actions,
      and footer command affordance.
    - Enter/Space activates buttons.
    - Focus remains visible in both themes.

## 10. Page Integration Pass

75. `[FE]` Update Launcher to use the new shell and primitives only for global
    chrome compatibility.
    - Do not fully redesign Launcher screen content until its screen-specific
      spec is written.
    - Ensure old simple list styling no longer defines the global look.

76. `[FE]` Update Setup to use the new shell and primitives only for global chrome
    compatibility.

77. `[FE]` Update Editor to use the new shell and primitives only for global
    chrome compatibility.
    - Ensure existing timeline/preview components do not break under the new
      token system.

78. `[FE]` Update Render to use the new shell and primitives only for global
    chrome compatibility.

79. `[QA]` Run the frontend test suite after the global integration pass.
    - `pnpm -F @vc/web test`
    - `pnpm -F @vc/web build`

80. `[QA]` Run backend tests after runtime endpoint changes.
    - `pnpm -F @vc/server test` if available, otherwise the repo's existing
      Python test command.

## 11. Acceptance Gate Before Screen-Specific Work

81. `[QA]` Open implementation in Chrome DevTools MCP at `1440x1000`.
    - Check Launcher, Setup, Editor, Render, and Tokens.
    - Verify the same header, theme switch, language switch, tokenized surfaces,
      and footer/status treatment on every route.

82. `[QA]` Repeat the visual pass near `950px` width.
    - No header collapse unless a future mobile spec defines it.
    - No text overlap.
    - No clipped language controls.

83. `[QA]` Toggle dark/light on every route.
    - All colors must change by token.
    - No stale Tailwind neutral colors should remain in visible global chrome.

84. `[QA]` Toggle English/Chinese on every route.
    - Header and footer remain stable.
    - Global labels switch.
    - Technical metadata remains stable.

85. `[QA]` Audit source for raw style values.
    - Raw visual constants are allowed in token declarations only.
    - Component styles should reference semantic classes, tokens, or shared
      primitives.

86. `[DOC]` Update the task status after implementation.
    - Mark completed tasks.
    - Link screenshots or visual audit notes.
    - List any remaining prototype differences explicitly.

87. `[QA]` Do not proceed to detailed Launcher, Setup, Editor, or Render redesign
    until this global acceptance gate passes.

## 12. Known Ambiguities To Resolve With Prototype MCP

88. `[QA]` Confirm whether the production app should expose `Tokens` in the main
    nav or keep it as a development-only route.
    - The prototype exposes it.
    - The requirements keep it mandatory as an implementation reference.

89. `[QA]` Confirm exact active tab surface between `--bg-4` and `--bg-5`.
    - Prototype inspection should decide the final token.

90. `[QA]` Confirm final footer positioning.
    - Prototype shows a persistent status bar.
    - Implementation must decide fixed, sticky, or layout-bottom behavior after
      checking each screen at `950px` and `1440px`.

91. `[QA]` Confirm cinema token naming.
    - The requirement adds cinema tokens.
    - The inspected Tokens page currently lacks a Cinema section, so naming must
      be derived from actual preview/timeline needs and then documented in
      `/tokens`.
