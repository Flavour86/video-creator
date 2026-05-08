# UI Global Requirements

Source inspected: `http://192.168.31.48/app.html` with Chrome DevTools MCP at a
1440px wide viewport. This file defines global interface requirements before the
screen-by-screen specs for Launcher, Setup, Editor, and Render.

## 1. Source Of Truth

- The prototype at `http://192.168.31.48/app.html` is the visual and interaction
  source of truth for Phase 1 UI work.
- The implementation must match the prototype shell before feature work resumes.
- The current localhost implementation that shows a simple dark list is not an
  acceptable visual baseline.
- The app is a dense local production tool, not a landing page. It should feel
  like a quiet video editing workstation: compact, precise, dark-first, and built
  for repeated use.
- The Tokens interface is the design-system reference. Components must consume
  tokens and shared primitives instead of hardcoded raw colors, spacing, font
  sizes, borders, or radii.

## 2. Global App Shell

- The app is a single browser-tab local workspace over the local sidecar.
- Header height is compact, about `44px` on desktop.
- Header layout is three-part:
  - Left: square `VC` mark, product name `Video Creator`, and phase label
    `phase 1 · local`.
  - Center: segmented navigation with `Launcher`, `Setup`, `Editor`, `Render`,
    and `Tokens` in the prototype.
  - Right: icon-only theme toggle, then language segmented control with `EN` and
    `中文`.
- The header spans the full viewport width. It uses the first raised surface
  token, not a floating card.
- The tab rail is horizontally centered, has a subtle border, `3px` internal
  padding, `2px` item gap, and compact active-pill treatment.
- Active tabs use the active surface token. Inactive tabs remain transparent with
  secondary text.
- Header controls must keep their positions stable across dark mode, light mode,
  English, and Chinese.
- Footer/status rail stays available globally. It shows command affordance,
  runtime/status chips, path or environment metadata, and prototype/version text.

## 3. Viewport And Layout

- Desktop fidelity must be checked at a minimum viewport width of `950px`.
- Primary desktop comparison should use `1440px` wide or wider, because the
  prototype is built as a wide workstation UI.
- Pages use a full-canvas layout, not centered marketing containers.
- Page content starts below the compact header with consistent top padding.
- Wide pages can use asymmetric work areas: main work surface on the left and
  operational panels on the right.
- Cards, panels, and tool surfaces should be flat with subtle borders. Do not
  nest cards inside cards.
- Fixed-format UI such as preview stages, timelines, status blocks, and icon
  buttons must have stable dimensions so hover, labels, or dynamic data do not
  shift the layout.
- Text must never overlap or overflow controls at 1000px desktop width.

## 4. Themes

- Dark theme is the default target and must match the prototype first.
- Light theme is required and must be available from the global icon-only theme
  button.
- Theme changes must update all surfaces, text, borders, badges, buttons, form
  fields, timelines, and preview areas through tokens.
- Do not implement dark/light mode with separate one-off class overrides per
  component. Theme values must come from global custom properties.
- The theme toggle must be accessible as `Toggle theme` and should not add visible
  explanatory copy to the header.

## 5. Language

- The global language control is a segmented control with `EN` and `中文`.
- All user-facing interface text must be localizable, including navigation,
  buttons, labels, placeholders, tooltips, status chips, empty states, validation
  messages, and footer metadata.
- The selected language has the active pill treatment. The inactive language
  remains transparent with secondary text.
- Layout must be tested in both English and Chinese. Chinese labels must not
  force wrapping, clipping, or header shifts.
- Technical metadata such as file paths, version strings, timecodes, codec names,
  and command hints may remain language-neutral.

## 6. Color Tokens

The prototype uses OKLCH color tokens. The implementation must preserve this
token model.

| Token | Dark value observed | Meaning |
|---|---:|---|
| `--bg-0` | `oklch(0.16 0.005 60)` | App canvas |
| `--bg-1` | `oklch(0.19 0.005 60)` | Default panel surface |
| `--bg-2` | `oklch(0.22 0.005 60)` | Raised panel/card surface |
| `--bg-3` | `oklch(0.26 0.006 60)` | Inputs and inset fills |
| `--bg-4` | `oklch(0.31 0.007 60)` | Hover surface |
| `--bg-5` | `oklch(0.38 0.008 60)` | Active surface |
| `--text` | `oklch(0.97 0.005 80)` | Primary text |
| `--text-2` | `oklch(0.78 0.008 70)` | Secondary text |
| `--text-3` | `oklch(0.58 0.008 70)` | Labels and tertiary text |
| `--text-4` | `oklch(0.45 0.008 70)` | Disabled text and hints |
| `--line` | `oklch(0.28 0.005 60)` | Default border |
| `--line-soft` | `oklch(0.24 0.004 60)` | Inner dividers |

Accent semantics:

- `--amber`: primary accent, brand, current time, playhead, selected clip, render
  emphasis.
- `--blue`: info state.
- `--green`: ready, aligned, cached, healthy runtime.
- `--red`: error, missing asset, destructive action.
- `--violet`: picture-in-picture layer semantics.
- Each accent must expose solid, tint, and line variants where relevant. The
  prototype uses 12% tints for backgrounds and 32% lines for accent borders.
- Do not mix amber with other accent hues in the same local surface unless the
  prototype does so.

## 7. Typography Tokens

- UI/prose font: `Inter Tight`, falling back to system sans.
- Mono font: `JetBrains Mono`, falling back to system monospace.
- Use mono for timecodes, paths, codec/version metadata, cache counts, frame
  rates, technical numbers, and aligned numeric columns.
- Use only the prototype type scale:

| Role | Size | Weight | Letter spacing | Font |
|---|---:|---:|---:|---|
| Display / screen title | `32px` | `700` | `-0.02em` | sans |
| H2 / modal title | `24px` | `700` | `-0.02em` | sans |
| Section/control title | `16px` | `600` | `-0.01em` | sans |
| Body | `13px` | `400` | `0` | sans |
| Caption | `11px` | `500` | `0` | sans |
| Eyebrow / label | `11px` | `600` | `0.06em` | sans |
| Mono timecode | `13px` | `500` | `0` | mono |
| Mono metadata | `10.5px` | `400` | `0` | mono |

- Uppercase labels use the eyebrow token and must stay short.
- Do not scale font size by viewport width.

## 8. Spacing, Radius, And Elevation

- Spacing uses a fixed 4px-based token scale. Freestyle spacing is not allowed.

| Token | Value |
|---|---:|
| `space-1` | `4px` |
| `space-2` | `6px` |
| `space-3` | `8px` |
| `space-4` | `10px` |
| `space-5` | `12px` |
| `space-6` | `14px` |
| `space-7` | `16px` |
| `space-8` | `20px` |
| `space-9` | `24px` |
| `space-10` | `32px` |
| `space-11` | `40px` |
| `space-12` | `56px` |

- Radius tokens observed: `--r-sm: 4px`, `--r: 6px`, `--r-md: 10px`,
  `--r-lg: 14px`.
- Pills are reserved for tags, status badges, and round icon controls.
- Inline cards stay flat. Modals and popovers use the deeper elevation token.
- Borders are usually `1px` token lines with subtle contrast.

## 9. Cinema Tokens

The Tokens interface must include cinema/video constants so preview, timeline,
and render surfaces stay consistent.

- Canvas aspect tokens: `16:9`, `9:16`, and future square only when supported.
- Default final canvas: `1920x1080`, `30fps`, SDR, BT.709.
- Draft canvas: `1280x720`, `30fps`.
- Preview stage must preserve aspect ratio and support `Fit` and `Actual`.
- Timeline scale must expose duration, sentence markers, layer tracks, playhead,
  clip blocks, selected range, and cached state.
- Subtitle safe areas, watermark safe areas, picture-in-picture bounds, and
  foreground layer z-order must be tokenized instead of hardcoded per screen.
- Cinema tokens belong in the Tokens interface next to color, type, spacing,
  radii, shadows, and component samples.

## 10. Global Components

- Buttons: primary, render/emphasis, default, ghost, extra-small ghost, small, and
  icon-only variants.
- Segmented controls: navigation, language, resolution, preview scale, and mode
  selectors.
- Tags/status: idle, cached, aligned, composing, missing asset, ready.
- Form fields: text inputs, selects, spinbuttons, search fields, and file/folder
  actions.
- Keyboard chips: command palette, shortcuts, undo, navigation, and destructive
  actions.
- Layer chips: subtitles, PiP layers, foreground layers, background.
- Buttons with icons should use a real icon library where available. Icon-only
  buttons need accessible names and hover/focus states.

## 11. Global Interaction Rules

- The app must support pointer and keyboard use for all primary controls.
- Focus state must be visible but restrained, matching the token system.
- Hover state uses `--bg-4`; active/selected state uses `--bg-5` or the relevant
  accent token.
- Destructive actions use red semantics and should not share visual treatment
  with render or save actions.
- File and folder actions must read as local workspace actions, not cloud upload
  actions.
- Drag/drop behavior must be visible where supported, especially project folders
  and timeline/media assignment areas.
- Command hints such as `⌘K` and `⌘F` can appear as compact keyboard chips.

## 12. Runtime And Status Language

- Runtime health is a global concern. The UI must expose local dependency status
  without turning it into a diagnostics page.
- Status examples from the prototype include Node.js, Python, ffmpeg, CUDA,
  WhisperX, active renders, cached projects, sidecar address, ffmpeg version,
  CUDA/GPU metadata, Node/Python versions, cache warmth, alignment cached, and
  autosave age.
- Healthy states use green. In-progress states use amber. Missing or failed
  states use red.
- Paths and technical metadata use mono typography.

## 13. Tokens Interface Requirements

- The Tokens tab is mandatory in the prototype and development reference surface.
- It must document colors, type, spacing, radii, shadows, cinema tokens, and live
  component samples.
- It must say that tokens are CSS custom properties on `:root` in `styles.css`.
- It must show live component samples that are the same components used elsewhere
  in the app.
- Production exposure of the Tokens tab can be decided later, but the token
  contract must remain available to developers and AI agents implementing UI.

## 14. Acceptance Checks

- Capture screenshots of prototype and implementation at `1440x1000` and at least
  one width near `950px`.
- Verify Launcher, Setup, Editor, Render, and Tokens all share the same header,
  theme switch, language switch, tokenized surfaces, and footer/status treatment.
- Verify dark and light modes both apply through tokens.
- Verify English and Chinese controls stay stable.
- Verify no component uses raw one-off color, spacing, radius, or font-size values
  when a token exists.
- Verify the implementation does not visually regress to the simple localhost
  list view shown in the rejected screenshot.

## task list