# Launcher and Setup Screen Spec

Source inspected: `http://192.168.31.48/app.html` via Chrome MCP (Launcher and
Setup tabs, dark theme, 1158px and 966px viewports).

This spec replaces the screen-content gap referenced from
[UI_GLOBAL_IMPLEMENTATION_TASKS.md](./UI_GLOBAL_IMPLEMENTATION_TASKS.md) §10
(75. Launcher / 76. Setup). Global shell, tokens, and primitives are owned by
[UI_GLOBAL_REQUIREMENTS.md](./UI_GLOBAL_REQUIREMENTS.md). Anything below assumes
those are already in place; this doc only specifies the per-screen layout, copy,
data, and interactions needed to replicate the prototype faithfully.

## 0. Conventions

These bind every component below. They mirror the project rules in
[`patterns.md`](../../patterns.md).

1. **Implementation language is Tailwind, not raw CSS.** The prototype's
   inline `.css` is reference material only — do not copy it. Express the same
   visual contract with Tailwind utility classes (or `tailwind-variants` /
   `cva` for component variants). Avoid arbitrary values when a token-backed
   utility exists; the linter must not surface `suggestCanonicalClasses`.
2. **Tokens are CSS custom properties** declared once on `:root` (see global
   spec). Tailwind consumes them through `bg-bg-2`, `text-text-2`, etc., wired
   in `tailwind.config.ts` (e.g. `colors.bg-2: 'var(--bg-2)'`). When this spec
   needs to reference a value the design system does not yet expose, it lists
   it under §0.2 below.
3. **All user-facing copy goes through `next-intl`.** Use
   `useTranslations(...)` with namespaces; never inline English strings in JSX.
   Both `apps/web/messages/en.json` and `apps/web/messages/zh.json` must carry
   the same keys. Technical metadata (paths, timecodes, codec strings, hashes)
   stays language-neutral and is *not* translated.
4. **Encapsulate every reused primitive.** Examples:
   - `formatDuration(seconds)` for `15:42`-style timecodes
   - `formatRelativeTime(iso)` for `2 hours ago` / `Yesterday`
   - `paletteForSeed(seed)` for the project-thumb palette map
   - `sha256OfFiles(paths)` and `truncateHash(hex, n)`
   - global `request()` wrapper around `fetch` for all FastAPI calls
   No screen-level component should re-implement these inline.
5. **Atomic globals live in `apps/web/components/ui/`** (`Button`,
   `IconButton`, `SegmentedControl`, `StatusTag`, `Kbd`, `Panel`,
   `LayerChip`, form primitives). Screens compose these — they do not restyle
   them.

### 0.1 Visual conventions reused from the prototype

- Header (`Titlebar`, height `44px` ≈ `h-11`) and footer (`Statusbar`, height
  `26px`) come from the global app shell. This document only describes what
  each screen contributes between them.
- The "raw CSS" the prototype emits resolves to a small, ergonomic Tailwind
  set: `bg-bg-2`, `border border-line`, `rounded-md`, `text-text-2`, `text-xs`,
  `font-mono`, etc. When this spec writes `bg-bg-2` it means "the panel
  background token surface", not a literal shorthand.
- Where the prototype uses an exotic value the design system has no token for
  (e.g. the four decorative thumb palettes in §1.3), this spec lists the raw
  `oklch()` so the implementation can encode them as a static palette map in
  TS, not as one-off Tailwind arbitrary values.

### 0.2 Tokens to confirm/add

The global doc declares accent semantics but does not name the variants used
by the prototype. Add these to the global token layer (single source) and
expose them in `tailwind.config.ts` so screens can write `bg-amber`,
`bg-amber/10`, `border-amber-line`, etc.:

| Token            | Inferred value (dark)            | Used by                          |
| ---------------- | -------------------------------- | -------------------------------- |
| `--amber`        | `oklch(0.78 0.13 70)`            | Run-alignment button, render emphasis |
| `--amber-2`      | `oklch(0.55 0.13 70)`            | Hover/active variant             |
| `--amber-bg`     | `oklch(0.78 0.13 70 / 0.12)`     | `StatusTag warn`, alerts         |
| `--amber-line`   | `oklch(0.78 0.13 70 / 0.32)`     | `StatusTag warn` border          |
| `--blue`         | (existing)                       | `StatusTag info`, path icon      |
| `--blue-2`       | `oklch(0.50 0.13 250)`           | Path icon variants               |
| `--blue-bg`      | `oklch(... / 0.12)`              | `StatusTag info` background      |
| `--green`        | `oklch(0.74 0.13 155)`           | Aligned, copied, parsed          |
| `--green-bg`     | `oklch(0.74 0.13 155 / 0.12)`    | `StatusTile done`, `StatusTag ok` |
| `--red`          | `oklch(0.70 0.16 25)`            | Errors                           |
| `--red-bg`       | `oklch(... / 0.12)`              | `StatusTag err`                  |
| `--violet`, `--violet-bg` | (existing)              | Reserved for PiP — not used here |

No new spacing, radius, font, or shadow tokens are required for these two
screens. Cinema tokens are unused here.

## 1. Launcher (`/launcher` or `/`)

### 1.1 Layout

Two-column workstation grid centered up to 1400px wide.

| Surface | Tailwind |
| --- | --- |
| Root grid | `mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_360px] gap-[18px] p-7` |
| Head row (spans both columns) | `col-span-full mb-[18px] flex items-end justify-between gap-4` |
| Right rail | `flex flex-col gap-[14px]` |

The right column stays at `360px` down to ~950px width; the left column
compresses but does not stack.

### 1.2 `LauncherHead`

- Left block:
  - `Eyebrow` `t('launcher.eyebrow')` → `Local workspace` / `本地工作区`
  - `H1` `t('launcher.title')` → `Recent projects` / `最近的项目`
  - Wrapper: `whitespace-nowrap`
- Right block: actions wrapper `flex gap-2`
  - `<Button variant="ghost" iconLeft={<FolderOpen />}>{t('launcher.openFolder')}</Button>`
  - `<Button variant="primary" iconLeft={<Plus />}>{t('launcher.newProject')}</Button>`

The global `Button` already encodes hover, focus-visible, disabled, and the
primary-vs-ghost contrast (primary uses the inverted swatch
`bg-text text-bg-1`, ghost uses `bg-bg-2 border-line`).

### 1.3 Project list

Vertical stack with a `mt-[10px]` rhythm between cards (encapsulate as a
`Stack gap` or use `space-y-[10px]` on the list element).

Each card is a `<button>` rendered via `ProjectCard.tsx`:

| Slot | Tailwind |
| --- | --- |
| Card root | `grid w-full grid-cols-[130px_1fr_auto] items-center gap-4 rounded-md border border-line bg-bg-2 p-[14px] text-left transition-[background,border,transform] duration-150 hover:-translate-y-px hover:border-bg-5 hover:bg-bg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber` |
| Thumb | `relative grid h-[78px] grid-cols-3 gap-0.5 overflow-hidden rounded` |
| Thumb stripe | `bg-bg-4` (default) overridden per palette via inline style or a class map |
| Info column | `min-w-0` (so path can ellipsize) |
| Title | `m-0 mb-[3px] text-base font-semibold tracking-[-0.01em]` |
| Path | `m-0 mb-2 font-mono text-[11.5px] text-text-3 truncate` |
| Meta row | `flex gap-[14px] text-[11.5px] text-text-3` |
| Meta strong | `font-medium text-text-2` |
| Status / chevron column | `flex items-center gap-2` |

Thumb palette (`paletteForSeed(seed)` returns one of these and the component
applies via `style={{ background: stripe }}`):

```ts
const PALETTES = {
  warm:  ['oklch(0.45 0.10 50)',  'oklch(0.55 0.12 60)',  'oklch(0.30 0.05 50)'],
  cool:  ['oklch(0.32 0.06 230)', 'oklch(0.45 0.10 250)', 'oklch(0.25 0.04 240)'],
  night: ['oklch(0.22 0.04 280)', 'oklch(0.30 0.06 290)', 'oklch(0.18 0.03 270)'],
  olive: ['oklch(0.40 0.08 130)', 'oklch(0.55 0.10 145)', 'oklch(0.30 0.05 130)'],
} as const;
```

Status pill is the global `StatusTag` (`<StatusTag tone="ok">aligned</StatusTag>`)
which renders the dot+label pill described in the global doc.

The four prototype rows in order:

| Name              | Path                                  | Voice | Sent. | Media | Last opened   | Status  | Thumb |
| ----------------- | ------------------------------------- | ----- | ----- | ----- | ------------- | ------- | ----- |
| Tokyo Essay       | `E:\video-projects\tokyo-essay`       | 15:42 | 164   | 38    | 2 hours ago   | aligned | night |
| Camera Test Script | `E:\video-projects\camera-test`      | 03:28 | 29    | 7     | Yesterday     | aligned | warm  |
| Lighting Notes    | `D:\renders\lighting-notes`           | 08:05 | 72    | 18    | 3 days ago    | aligned | cool  |
| Shibuya at Night  | `E:\video-projects\shibuya-night`     | 12:11 | 121   | 24    | Last week     | aligned | olive |

Empty-state card after the list — same `ProjectCard` component in
`variant="empty"`:

- `border-dashed text-text-3 justify-center items-center min-h-[64px]`
- centered `<Plus />` + `t('launcher.createAnother')` (`Create another project`)
- click opens the same flow as the head `New project` button

### 1.4 `LauncherSide` — right rail

Two stacked `Panel` instances (the global `Panel` already exposes
`bg-bg-2 border border-line rounded-md p-4`).

#### 1.4.1 `RuntimeCard`

Header row uses the global `SectionTitle` (eyebrow tokens) on the left and a
`StatusTag tone="ok"` on the right reading `t('launcher.runtime.ready')`.

Body is a `RuntimeRow` repeater:

| Slot | Tailwind |
| --- | --- |
| Row | `grid grid-cols-[16px_1fr_auto] items-center gap-[9px] border-t border-line-soft py-[7px] text-xs first:border-t-0` |
| Icon | `text-green` when healthy, `text-amber` degraded, `text-red` missing |
| Label | `text-text-2` |
| Value | `font-mono text-[11px] text-text-3` |

The five sample rows:

| Icon | Label    | Value             |
| ---- | -------- | ----------------- |
| ✔    | Node.js  | `22.4.1`          |
| ✔    | Python   | `3.11.7`          |
| ✔    | ffmpeg   | `6.1.1 · libx264` |
| ✔    | CUDA     | `12.8 · sm_120`   |
| ✔    | WhisperX | `large-v3`        |

`MetricGrid` below the rows: 2 cells with a hairline separator built via the
"1px gap on a `bg-line` track" trick:

| Slot | Tailwind |
| --- | --- |
| Grid | `mt-[14px] grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line` |
| Cell | `bg-bg-2 px-[14px] py-3` |
| Number | `block font-mono text-[22px] font-semibold tracking-[-0.02em]` |
| Caption | `text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-3` |

Cells: `0` `t('launcher.metrics.activeRenders')` and `4`
`t('launcher.metrics.cachedProjects')`.

#### 1.4.2 `TipsCard`

Same `Panel` chrome. Body is a `<ul class="m-0 list-disc pl-[14px] text-xs text-text-2 space-y-1.5">` with three i18n keys:

- `launcher.tips.folder` — `Drop a folder anywhere — same project.`
- `launcher.tips.rerecord` — `Re-record voice; keep your assignments.`
- `launcher.tips.phase2` — `Phase 2 hooks AI gen via Fal / Modal.`

### 1.5 Status bar contributions

Launcher fills the centre segment with (each row is an `<StatusSegment>` from
the global statusbar):

- `dot ok    sidecar 127.0.0.1:8787`
- `dot ok    ffmpeg 6.1`
- `dot ok    cuda 12.8 · rtx 5070 ti`
- `dot info  node 22.4 · python 3.11.7`

Right segment shows `--version` (currently `v0.1.0-prototype`). Left segment
is the global `⌘K command` chip.

### 1.6 Interactions

- `ProjectCard` is a `<button type="button">`. Click → open project in
  Editor (`router.push('/editor?project=' + path)`).
- Empty-state card and head `New project` route to `/setup` with a fresh
  draft.
- Head `Open folder…` invokes the OS folder picker, then calls
  `request('/projects/open', { method: 'POST', body: { path } })` and routes
  to `/setup` (if uninitialized) or `/editor` (if already a project folder).
- Hover/focus: card transforms `-translate-y-px` and the border lifts to
  `border-bg-5`. Focus ring stays token-driven and visible in both themes.
- Keyboard: tab order is `Open folder` → `New project` → each project card
  top-to-bottom → empty card. Runtime and tips have no interactive children.

## 2. Setup (`/setup`)

### 2.1 Layout

Three-region grid centered up to 1500px.

| Surface | Tailwind |
| --- | --- |
| Root grid | `mx-auto grid max-w-[1500px] grid-cols-[220px_minmax(0,1fr)_320px] gap-[18px] p-7` |
| Head row | `col-span-full mb-1.5 flex items-end justify-between` |

At ~950px width all three columns are preserved; the middle column compresses
and the inner field labels/path string wrap. Do not collapse to a single
column.

### 2.2 `SetupHead`

- Left:
  - `Eyebrow` `t('setup.eyebrow')` (`New project` / `新建项目`)
  - `H1` `t('setup.title')` (`Create project folder` / `创建项目文件夹`) —
    `m-0 text-2xl font-bold tracking-[-0.02em]`
- Right (`flex gap-2`):
  - `<Button variant="ghost">{t('common.cancel')}</Button>`
  - `<Button variant="primary" disabled={!canContinue}>{t('setup.continueToEditor')}</Button>`
    - Label includes the arrow glyph: `Continue → Editor` / `继续 → 编辑器`
    - **Gating rule (revised):** `canContinue = alignmentStatus === 'aligned'`.
      The button is disabled while folder/voice/transcript are still being
      detected, while alignment is `pending`/`running`, and on `failed`. It
      becomes enabled the moment the alignment job finishes successfully
      (cache hit or fresh run).

### 2.3 `Stepper`

Sticky vertical ordered list (`<ol>`).

| Slot | Tailwind |
| --- | --- |
| Root | `sticky top-0 m-0 flex list-none flex-col gap-1 p-0` |
| Item base | `grid grid-cols-[28px_1fr] items-center gap-2.5 rounded-[var(--r)] px-3 py-2.5 text-[12.5px] text-text-3 transition-[background,color] duration-150` |
| `done` item | `text-text-2` |
| `active` item | `bg-bg-2 text-text` |
| `Num` base | `grid h-6 w-6 place-items-center rounded-full border border-line bg-bg-3 font-mono text-[11px] font-semibold text-text-3` |
| `Num done` | `border-green bg-green text-bg-0` (digit replaced by `<Check />`) |
| `Num active` | `border-text bg-text text-bg-0` |
| Sub `<small>` | `block text-[10.5px] font-normal text-text-4` |

Steps are derived state — never a literal `[1,2,3]` array — by the page-level
`useSetupDraft()` hook:

| Step | Title key                        | Sub                                           | State derivation                       |
| ---- | -------------------------------- | --------------------------------------------- | -------------------------------------- |
| 1    | `setup.steps.folder`             | the chosen project path (mono)                | `done` once `path` exists              |
| 2    | `setup.steps.voiceTranscript`    | `setup.steps.voiceTranscriptSub` (`two required inputs`) | `done` when both files are detected; `active` while either is missing |
| 3    | `setup.steps.alignment`          | `setup.steps.alignmentSub` (`WhisperX forced align`) | `done` when alignment status is `aligned`; `active` while pending |

### 2.4 Main panel (`SetupCard`)

`<Panel>` with `p-[18px]`. Two rows separated by a hairline:

```
.row + .row → mt-[18px] pt-[18px] border-t border-line-soft
```

(implementation: a small `Row` component that conditionally adds those classes
on every sibling but the first.)

#### 2.4.1 Row 1 — Folder & preset

Two stacked sub-rows:

1. Field pair — `grid grid-cols-[1fr_200px] gap-[14px]`:
   - `<Field label={t('setup.fields.projectName')}>` wrapping `<Input value={draft.name} />`
   - `<Field label={t('setup.fields.outputPreset')}>` wrapping `<Select>`
     - Options come from `outputPresets` constant; the values are codec/preset
     identifiers and stay language-neutral. Localize *only* the human label
     prefix when one exists. Defaults: `Final · 1080p · CRF 18`,
     `Draft · 720p · ultrafast`, `Vertical · 9:16 · 1080w`.
   - `Field` renders the eyebrow label (`text-[11px] font-semibold uppercase tracking-[0.06em] text-text-3`) above an `Input`/`Select` styled `h-[33px] rounded-sm border border-line bg-bg-1 px-[10px] text-[12.5px] text-text`.

2. `PathCard` — read-only summary:
   - `flex items-center gap-3 rounded border border-line bg-bg-1 px-[14px] py-3`
   - `<Folder />` icon `h-[18px] w-[18px] text-blue`
   - body wrapper:
     - `strong`: `font-mono text-[12.5px] font-medium` — the project path
     - `span`: `block text-[11px] text-text-3` — `t('setup.path.willBeCreated')`
       (`project.json · media/ · renders/ · .vc/ will be created here`)
   - trailing `<Button variant="ghost" size="sm">{t('common.change')}</Button>`

#### 2.4.2 Row 2 — Detected inputs (auto-detected, not drag-drop)

**Behaviour change vs. the prototype shape.** Voice and transcript are *not*
drag-drop targets. The page polls / watches the project folder and
auto-detects two specific files:

- `<projectPath>/voice.wav`
- `<projectPath>/transcript.txt`

`useSetupDraft()` issues `GET /setup/inspect?path=<projectPath>` after the
folder is chosen. The backend returns a `DetectedInputs` payload (see §3) with
`voiceFile`/`transcriptFile` populated when found, or `null` when missing.

Header for the row:
- `h3` `t('setup.inputs.title')` (`Inputs`) using the row-eyebrow tokens
  (`text-[11px] font-semibold uppercase tracking-[0.08em] text-text-2 mb-1.5`)
- `p` `t('setup.inputs.body')` (`Voice and transcript are the only inputs
  needed up front. Add media later from the Editor — assets are imported the
  moment you assign them to a sentence.`) — `text-xs text-text-3 leading-[1.5] mb-3`

Two-up grid: `grid grid-cols-2 gap-2.5`. Each cell is a `StatusTile`:

| Slot | Tailwind |
| --- | --- |
| Tile root | `flex flex-col items-center gap-2 rounded border px-[14px] py-[18px] text-center transition-[border-color,background] duration-150` |
| Tile `pending` (file not yet detected) | `border-dashed border-bg-5 bg-bg-1 text-text-3` |
| Tile `detected` (file found) | `border-solid border-green/40 bg-green-bg` |
| Tile `error` (file present but invalid) | `border-solid border-red/40 bg-red-bg` |
| Icon | `h-5 w-5 text-text-3` (pending), `text-green` (detected), `text-red` (error) |
| Strong (filename) | `text-sm font-semibold` |
| Meta line | `font-mono text-[11px] text-text-3` |
| Status pill | global `<StatusTag>` |

States and copy:

| Tile      | pending icon                  | pending strong                       | pending meta                          | detected meta                       | detected pill |
| --------- | ----------------------------- | ------------------------------------ | ------------------------------------- | ----------------------------------- | -------------- |
| voice     | `<AudioWaveform />`           | `voice.wav`                          | `t('setup.inputs.voicePending')` (`Place voice.wav in the project folder`) | `15:42 · 48kHz · stereo` (from probe) | `t('setup.inputs.copied')` (`copied`) |
| transcript | `<Type />`                    | `transcript.txt`                     | `t('setup.inputs.transcriptPending')` (`Place transcript.txt in the project folder`) | `164 sentences detected`             | `t('setup.inputs.parsed')` (`parsed`) |

The filename strings (`voice.wav`, `transcript.txt`) are language-neutral and
not translated. The pill labels and pending meta are translated.

There is **no drop handler, no file picker** on these tiles. Replacement is
done by overwriting the file on disk; the page sees the new mtime via the
folder watcher and re-runs `inspect`. (The `Change…` button on `PathCard` is
the only way to point at a different folder.)

The error state surfaces actionable copy:

- voice missing audio stream → `t('setup.inputs.voiceInvalid')` plus
  `<StatusTag tone="err">invalid</StatusTag>`
- transcript empty → `t('setup.inputs.transcriptEmpty')`
- file present but mid-copy / locked → `<StatusTag tone="warn">copying</StatusTag>`
  with the meta line `t('setup.inputs.locked')`

### 2.5 Right panel (`AlignmentCard`)

`<Panel>` with `p-4`. Children:

1. `<PanelHead>`:
   - `h3` `t('setup.alignment.title')` (`Alignment`)
   - status `<StatusTag>` whose tone tracks the job state:
     - `pending`  → `tone="warn"`,  label `t('setup.alignment.statePending')`
     - `running`  → `tone="info"`,  label `t('setup.alignment.stateRunning')`
     - `aligned`  → `tone="ok"`,    label `t('setup.alignment.stateAligned')`
     - `failed`   → `tone="err"`,   label `t('setup.alignment.stateFailed')`

2. `<p>` body copy with inline mono span:
   `t.rich('setup.alignment.intro', { mono: chunks => <span class="font-mono">{chunks}</span> })`
   resolving to `WhisperX timestamps the provided transcript against
   <mono>voice.wav</mono>. The text is the reference; ASR never runs.`

3. `<Job>` block — `mt-3 flex flex-col gap-2.5 rounded border border-line bg-bg-1 p-3`:
   - top row: `<strong>{t('setup.alignment.forced')}</strong>` (`Forced
     alignment`) + small `<StatusTag>` mirroring the cache state
     (`cache miss` / `cache hit` / `running`).
   - hash line: `font-mono text-[10.5px] text-text-4 break-all`. Render via
     `truncateHash(hash, 8)` → `sha256(voice.wav + transcript.txt) = 8a3f2c1d…`.
     Hash itself is language-neutral.
   - 2×2 `KV` block (`grid grid-cols-2 gap-x-4`):

     | k        | v                  |
     | -------- | ------------------ |
     | device   | `cuda · fp16` (mono) |
     | model    | `large-v3` (mono)   |
     | est. time | `~52s`             |
     | audio dur | `15:42` (mono via `formatDuration`) |

     `KV` row classes: `flex justify-between py-1 text-[11.5px]`,
     `.k text-text-3`, `.v font-mono text-text-2`.
   - Primary action `<Button variant="accent" iconLeft={<Play />}>{t('setup.alignment.run')}</Button>`:
     - accent variant: `bg-amber text-[oklch(0.18_0.04_70)] border-amber font-semibold`
     - disabled while inputs are not both detected; label switches to
       `t('setup.alignment.running', { eta })` while a job is in flight, with
       the icon swapped to a spinner.

4. `<Checks>` — preflight list. `mt-[14px] m-0 flex list-none flex-col gap-2 p-0`,
   each `li` is `flex items-center gap-[9px] text-xs text-text-2`. Items are
   driven by the `DetectedInputs` payload, not hard-coded:

   - `dot ok` → `t('setup.checks.transcriptReadable', { count: sentenceCount })`
     (`Transcript readable · 164 sentences`)
   - `dot ok` → `t('setup.checks.audioValid', { codec, sampleRate })`
     (`Audio stream valid · pcm_s16le · 48kHz`)
   - `dot info` → `t('setup.checks.mediaLater')`
     (`Media is added later from the Editor`)
   - `dot info` → `t.rich('setup.checks.cacheTarget', { mono })`
     (`Cache will write to <mono>.vc/alignment.json</mono>`)
   - On failure, the matching `dot.ok` becomes `dot.warn`/`dot.err` with the
     localized failure reason.

### 2.6 Status bar contributions (Setup only)

- `dot ok    sidecar`
- `dot warn  alignment pending` → `dot info running` → `dot ok cached` —
  driven by the same alignment status used in §2.5.
- `dot ok    disk 412 GB free` (from `request('/system/disk?path=...')`)
- `dot info  E:\video-projects\tokyo-essay`

Right: shell version. Left: `⌘K command`.

### 2.7 Interactions

- `Cancel` discards the unsaved draft and routes back to `/launcher`.
- `Continue → Editor` is gated **only** on `alignmentStatus === 'aligned'`
  (see §2.2). Steps 1 and 2 reaching `done` is necessary for alignment to
  start, but the button itself does not unlock until the alignment job
  completes.
- `Change…` on `PathCard` reopens the folder picker; selecting a different
  folder resets the draft and re-runs `inspect`.
- `Run alignment` posts to `request('/align', { method: 'POST', body: { project } })`
  and subscribes to the existing render WS for progress events. On `aligned`,
  the page re-renders with the button enabled and the stepper marking step 3
  done.
- The `Stepper`'s `Folder` row is keyboard/mouse activatable to step back; the
  `Voice + transcript` row scrolls to the inputs section (`scrollIntoView({
  behavior: 'smooth' })`).

## 3. Implementation Task List Slice

Append these to the bottom of
[`UI_GLOBAL_IMPLEMENTATION_TASKS.md`](./UI_GLOBAL_IMPLEMENTATION_TASKS.md)
under new sections `## 13. Launcher Screen` and `## 14. Setup Screen`. Tasks
follow the same `[FE] [BE] [SHARED] [DOC] [QA]` legend.

### 3.1 Launcher tasks

92. `[SHARED]` Add `RecentProject` schema fields: `name`, `path`,
    `voiceDuration`, `sentenceCount`, `mediaCount`, `lastOpenedISO`,
    `alignmentState` (`aligned|pending|missing`), `paletteSeed`.
93. `[BE]` Implement `GET /projects/recent`. Persist in
    `~/.video-creator/recent.json` (or platform equivalent).
94. `[BE]` Implement `POST /projects/open` and `POST /projects/new` (folder
    picker is owned by the frontend; backend validates and initializes the
    folder layout from `instruction.md`).
95. `[FE]` Implement `apps/web/components/launcher/ProjectCard.tsx` per §1.3
    using only Tailwind utilities.
96. `[FE]` Implement `apps/web/components/launcher/ProjectThumb.tsx` with the
    palette map encapsulated in `apps/web/lib/launcher/palettes.ts` and a
    `paletteForSeed(seed)` helper.
97. `[FE]` Implement `apps/web/components/launcher/RuntimeCard.tsx` and
    `MetricGrid.tsx` per §1.4.1, fed by the global `useRuntimeStatus` hook.
98. `[FE]` Implement `apps/web/components/launcher/TipsCard.tsx` per §1.4.2
    with i18n entries in `messages/en.json` and `messages/zh.json`.
99. `[FE]` Compose `apps/web/app/[locale]/launcher/page.tsx` (or matching
    next-intl layout) with the layout in §1.1. Wire `Open folder…` and
    `New project` through the global `request()` wrapper.
100. `[FE]` Wire the Launcher status-bar segment from §1.5 to
     `useRuntimeStatus`. Segments register on mount and unregister on unmount.
101. `[QA]` Vitest: `ProjectCard` renders all four metadata cells, switches
     `aligned/pending/missing` tag variants, is keyboard-activatable, and has
     no inline English strings (all copy resolved via `useTranslations`).
102. `[QA]` Visual diff against the prototype at `1440x1000` and `966x900`,
     dark and light themes, EN and 中文.

### 3.2 Setup tasks

103. `[SHARED]` Add `SetupDraft` and `DetectedInputs` schemas:
     - `SetupDraft`: `path`, `name`, `outputPreset`, `voice` (DetectedInputs
       file shape or null), `transcript` (same), `alignment` (`status`,
       `hash`, `device`, `model`, `audioDuration`, `error?`).
     - `DetectedInputs.voice`: `path`, `duration`, `sampleRate`, `channels`,
       `codec`, `state` (`copied|copying|invalid`).
     - `DetectedInputs.transcript`: `path`, `sentenceCount`, `state`
       (`parsed|empty|invalid`).
104. `[BE]` `POST /setup/scaffold` — given a folder, create
     `project.json`, `media/`, `renders/`, `.vc/`. Reject if non-empty unless
     `--force`.
105. `[BE]` `GET /setup/inspect?path=<...>` — auto-detect `voice.wav` and
     `transcript.txt` in the folder, probe metadata, return `DetectedInputs`.
     Return 200 even when files are missing (with `state: null`) so the page
     can render pending tiles.
106. `[BE]` Folder watcher: stream `setup/inspect` results over the existing
     WS so the Setup page reacts when the user drops files into the folder
     out-of-band.
107. `[BE]` Compute and return the alignment hash
     `sha256(voice.wav bytes + transcript.txt bytes)`. Cache lookup against
     `.vc/alignment.json`.
108. `[FE]` Implement `apps/web/lib/setup/useSetupDraft.ts` — hook that owns
     the draft, runs `inspect`, subscribes to the WS, and exposes
     `canContinue` (`alignmentStatus === 'aligned'`).
109. `[FE]` Implement `apps/web/components/setup/Stepper.tsx` per §2.3 with
     state derived from the hook (no literal step array).
110. `[FE]` Implement `apps/web/components/setup/PathCard.tsx` per §2.4.1.
111. `[FE]` Implement `apps/web/components/setup/StatusTile.tsx` covering
     `pending|copying|detected|invalid` per §2.4.2. **No drop handler** —
     read-only status tile.
112. `[FE]` Implement `apps/web/components/setup/AlignmentCard.tsx` per §2.5
     including the `Job`, `KV`, and `Checks` sub-blocks, all driven from the
     hook.
113. `[FE]` Compose `apps/web/app/[locale]/setup/page.tsx` per §2.1 and wire
     the Cancel / Continue gating from §2.7.
114. `[FE]` Wire the Setup-specific status-bar segment from §2.6.
115. `[QA]` Vitest: stepper renders all three states; `StatusTile` cycles
     `pending → copying → detected → invalid` correctly; `AlignmentCard`
     switches tag variants on job state transitions; `canContinue` is
     `false` until alignment is `aligned` and `true` after.
116. `[QA]` Backend pytest: scaffold rejects non-empty folder, inspect
     populates metadata correctly, watcher emits on file changes, alignment
     hash is deterministic and cache-hit short-circuits.
117. `[QA]` Visual diff against the prototype at `1440x1000` and `966x900`,
     dark and light themes, EN and 中文.

## 4. Acceptance For This Slice

Before declaring Launcher and Setup matched to the prototype:

- All copy in §1 and §2 routes through `useTranslations`. `en.json` and
  `zh.json` contain the same key set; technical metadata stays
  language-neutral.
- Source contains zero raw `oklch()`/`hsl()`/hex values inside component
  JSX/CSS. The only exceptions are the four decorative thumb palettes in
  `apps/web/lib/launcher/palettes.ts`.
- No inline `<style>` and no `globals.css` rules are added beyond token
  declarations. All component styling is Tailwind utilities.
- Tailwind linter does not surface `suggestCanonicalClasses` for any new
  component.
- Helpers `formatDuration`, `formatRelativeTime`, `truncateHash`,
  `paletteForSeed`, and the global `request()` wrapper exist and are used
  exclusively (no inline `fetch()` or hand-rolled timecode formatting).
- `canContinue` is `true` if and only if `alignmentStatus === 'aligned'`.
- Status-bar contributions appear only on the matching route and unregister
  on navigation away.
- Hover, focus-visible, active, and disabled states for every button, card,
  status tile, and stepper item exist and use tokens.
- Screenshot diff at 1440 and 966 px shows no structural drift; minor
  sub-pixel/font hinting differences are acceptable.
