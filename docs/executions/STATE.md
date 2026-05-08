# Execution State

> **Maintained by**: AI agents.
> **Read first** at the start of every session.
> **Update after** every task.

---

## Current focus

**Next task**: UI global task 10 - declare or load the font strategy
**Last commit**: 816a193
**Last updated**: 2026-05-08T09:15Z

---

## Progress

### M0 — Environment (`01_ENVIRONMENT.md`)
- [s] T0.1 Verify Node.js 22+ — environment verified (no commit)
- [s] T0.2 Verify Python 3.11 — environment verified (no commit)
- [s] T0.3 Verify ffmpeg ≥ 6.0 — environment verified (no commit)
- [s] T0.4 Verify Git — environment verified (no commit)
- [s] T0.5 Detect GPU and install correct PyTorch — environment verified (no commit)

### M1 — Skeleton (`02_MILESTONE_SKELETON.md`)
- [x] T1.1 Initialize pnpm monorepo — commit 2239157
- [x] T1.2 Bootstrap Next.js app (apps/web) — commit b0546a3
- [x] T1.3 Bootstrap FastAPI app (apps/server) — commit 2791241
- [x] T1.4 Create shared-schemas package — commit d39510c
- [x] T1.5 Concurrent dev script (`pnpm dev`) — commit d94b477
- [x] T1.6 npx launcher (bin script) — commit 081f9c0
- [x] T1.7 Browser auto-open and graceful shutdown — commit ff4ee2f

### M2 — Project I/O (`03_MILESTONE_PROJECT_IO.md`)
- [x] T2.1 Global app DB (SQLite) — commit 0c895e5
- [x] T2.2 Full `project.json` schema + JSON Schema validation — commit 6da0195
- [x] T2.3 New project flow — commit d5036d7
- [x] T2.4 Open project + Recent projects UI — commit 6392935
- [x] T2.5 Media ingest (ingest project) — commit 8851d4f

### M3 — Alignment (`04_MILESTONE_ALIGNMENT.md`)
- [x] T3.1 Sentence segmentation — commit 01b9e81
- [x] T3.2 WhisperX wrapper — commit f1a269a
- [x] T3.3 Forced alignment endpoint — commit 4a1b5a6
- [x] T3.4 Alignment cache — commit 4a1b5a6
- [x] T3.5 Transcript display in UI — commit 315e4c5

### M4 — Preview (`05_MILESTONE_PREVIEW.md`)
- [x] T4.1 WaveSurfer integration — commit a08fd30
- [x] T4.2 Transcript panel with sentence selection — commit d2ac49c
- [x] T4.3 Layer 1 auto-distribute (single image) preview — commit b86fb2b
- [x] T4.4 In-browser preview player (image swap on timestamp) — commit 6431256
- [x] T4.5 Timeline strip with thumbnails — commit 3673495

### M5 — Foreground & Render (`06_MILESTONE_FOREGROUND_RENDER.md`)
- [x] T5.1 Drop image onto sentence range (foreground item creation) — commit ed98508
- [x] T5.2 Asset cache (per-clip pre-render) 鈥?commit 5e7c61e
- [x] T5.3 Filtergraph builder 鈥?commit c6e4a9d
- [x] T5.4 Compose endpoint (single ffmpeg invocation) 鈥?commit 718d3db
- [x] T5.5 WebSocket render progress 鈥?commit 1b32990
- [x] T5.6 Render history UI 鈥?commit c4685bb

### M6 — Polish (`07_MILESTONE_POLISH.md`)
- [x] T6.1 Final render preset 鈥?commit 9c0e19f
- [x] T6.2 Subtitle SRT generation 閳?commit de2c829
- [x] T6.3 Subtitle burn-in toggle 閳?commit 89f1bc4
- [x] T6.4 Auto-distribute multi-image 閳?commit b77b21d
- [x] T6.5 Auto-distribute clips with black-tail fallback 閳?commit 58fd6ca
- [x] T6.6 Watermark layer 閳?commit e51a751
- [x] T6.7 Time-pinned override (anchor:"time") 閳?commit 3bb6608
- [x] T6.8 PiP compositing mode 闁?commit f4fd756
- [x] T6.9 Configurable transitions (cut / fade / slide) 闁?commit 770fc5e

---

## Blocked

(none)

---

## Notes log

2026-05-08T09:15Z [agent: codex] UI global task 9:
- What I changed: added failing-first coverage for named typography utilities, then added
  Tailwind `@apply` component utilities for display, H2, section, body, caption, eyebrow,
  mono timecode, and mono metadata text roles.
- What works: `pnpm -F @vc/web test -- styles/globals.test.ts`, `pnpm -F @vc/web build`, and
  `pnpm -F @vc/web lint` completed successfully.
- What is incomplete: existing unrelated warnings remain from `<img>` usage and `next lint`
  deprecation. The typography utilities include a regression guard that bans non-canonical
  Tailwind variable forms such as `text-[var(--text)]`; use `text-(--text)` or canonical
  utilities instead.
- Next agent should: continue with UI global task 10 via TDD.

2026-05-08T09:03Z [agent: codex] UI global task 8:
- What I changed: added a failing-first assertion for the light theme selector and prototype
  light color ramp, then added `:root[data-theme="light"]` token overrides.
- What works: `pnpm -F @vc/web test -- styles/globals.test.ts`, `pnpm -F @vc/web build`, and
  `pnpm -F @vc/web lint` completed successfully.
- What is incomplete: existing unrelated warnings remain from Radix dialog descriptions,
  `<img>` usage, and `next lint` deprecation.
- Next agent should: continue with UI global task 9 via TDD.

2026-05-08T09:00Z [agent: codex] UI global task 7:
- What I changed: added a failing-first assertion that the document defaults to the dark
  token theme, then added `color-scheme: dark` to the root token block.
- What works: `pnpm -F @vc/web test -- styles/globals.test.ts`, `pnpm -F @vc/web build`, and
  `pnpm -F @vc/web lint` completed successfully.
- What is incomplete: existing unrelated warnings remain from Radix dialog descriptions,
  `<img>` usage, and `next lint` deprecation.
- Next agent should: continue with UI global task 8 via TDD.

2026-05-08T08:35Z [agent: codex] UI global task 6:
- What I changed: added a failing-first Vitest check for required global design token names,
  then replaced the old HSL globals in `apps/web/styles/globals.css` with prototype-compatible
  surface, text, line, accent, font, radius, and shadow CSS custom properties.
- What works: `pnpm -F @vc/web test -- styles/globals.test.ts`, `pnpm -F @vc/web build`, and
  `pnpm -F @vc/web lint` completed successfully.
- What is incomplete: existing unrelated warnings remain from Radix dialog descriptions,
  `<img>` usage, and `next lint` deprecation. Localization work is blocked until the
  `next-intl` dependency is approved/installed because `patterns.md` requires
  `useTranslations()` from `next-intl`.
- Next agent should: continue with UI global task 7 via TDD, or resolve the `next-intl`
  dependency before app shell/localization tasks.

2026-05-08T05:00Z [agent: codex] Phase 1 acceptance:
- What I changed: fixed render compose duration and clip timestamp offsets,
  cleared server lint/type failures, and built `projects/test01/project.json`
  with cleaned transcript/media for acceptance rendering.
- What works: `pnpm test`, `pnpm build`, and `pnpm -F @vc/server lint`
  pass. Production launcher returned HTTP 200 on `http://localhost:3000`.
  Draft render completed in 33.77s and Final render completed in 65.47s
  for `projects/test01`; Final output is 1920x1080 H.264 + AAC, 300.304s,
  no black segments, visible BG/FG/PiP/watermark/subtitles.
- What is incomplete: user visual approval is still needed.
- Next agent should: show the user `projects/test01/renders/r-2026-05-08-0454-bf036f.mp4`
  and the contact sheets under `projects/test01/.vc/inspection/`.

2026-05-07T06:56Z [agent: codex] M1:
- What I changed: completed T1.3 through T1.7, including FastAPI sidecar scaffolding, CUDA PyTorch wheel correction from `.downloads`, shared schema codegen, concurrent dev runner, production launcher, readiness polling, and browser auto-open.
- What works: Milestone 1 verification commands passed; `pnpm launch` starts production server/web, returns 200 for both root and `/health`, and browser shows `Sidecar: ok`.
- What is incomplete: real terminal Ctrl+C cannot be delivered by the MCP process session; external Windows signal probes are not equivalent and required manual cleanup. Launcher/dev scripts include Windows cleanup safeguards.
- Next agent should: start T2.1 in `03_MILESTONE_PROJECT_IO.md`.

2026-05-06T09:38Z [agent: codex] T1.1:
- What I changed: created root scaffold files, ran `pnpm install`, created `scripts/.env-detect`, and updated execution docs to use `master` as the trunk branch per user instruction.
- What works: Milestone 0 verification passed; `python --version` resolves to Python 3.11.9 from this repo; root `pnpm install` completed and produced `pnpm-lock.yaml`.
- What is incomplete: T1.1 verification and commit have not been run because the user asked to stop after scaffolding before prototype work.
- Next agent should: after prototype work, resume T1.1 by running verification, committing the scaffold, and marking T1.1 complete.

---

## How to update this file (for agents)

After completing a task:

1. Change `[ ]` → `[x]` for that task's line.
2. Append `— commit <SHORT_SHA>` to the line.
3. Update the **Current focus** block at the top.
4. If the task is partial: change `[ ]` → `[~]` and add a brief note in **Notes log** explaining what's done and what isn't.
5. If blocked: change `[ ]` → `[!]` and add a `## Blocked` entry per the format in `00_OVERVIEW.md`.

Example after completing T1.1:

```markdown
- [x] T1.1 Initialize pnpm monorepo — commit a3f29b1
```

Do **not** edit any other section of this file (e.g., do not rewrite the task list itself; only flip checkboxes and append SHAs).
