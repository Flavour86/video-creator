# Execution State

> **Maintained by**: AI agents.
> **Read first** at the start of every session.
> **Update after** every task.

---

## Current focus

**Next task**: T0.3 (`01_ENVIRONMENT.md`)
**Last commit**: (none yet)
**Last updated**: 2026-05-06T09:13Z

---

## Progress

### M0 — Environment (`01_ENVIRONMENT.md`)
- [x] T0.1 Verify Node.js 22+ — environment verified (no commit)
- [x] T0.2 Verify Python 3.11 — environment verified (no commit)
- [ ] T0.3 Verify ffmpeg ≥ 6.0
- [ ] T0.4 Verify Git
- [ ] T0.5 Detect GPU and install correct PyTorch

### M1 — Skeleton (`02_MILESTONE_SKELETON.md`)
- [ ] T1.1 Initialize pnpm monorepo
- [ ] T1.2 Bootstrap Next.js app (apps/web)
- [ ] T1.3 Bootstrap FastAPI app (apps/server)
- [ ] T1.4 Create shared-schemas package
- [ ] T1.5 Concurrent dev script (`pnpm dev`)
- [ ] T1.6 npx launcher (bin script)
- [ ] T1.7 Browser auto-open and graceful shutdown

### M2 — Project I/O (`03_MILESTONE_PROJECT_IO.md`)
- [ ] T2.1 Global app DB (SQLite)
- [ ] T2.2 New project flow
- [ ] T2.3 Open project flow
- [ ] T2.4 Recent projects UI
- [ ] T2.5 Media ingest (drag-drop into project)

### M3 — Alignment (`04_MILESTONE_ALIGNMENT.md`)
- [ ] T3.1 Sentence segmentation
- [ ] T3.2 WhisperX wrapper
- [ ] T3.3 Forced alignment endpoint
- [ ] T3.4 Alignment cache
- [ ] T3.5 Transcript display in UI

### M4 — Preview (`05_MILESTONE_PREVIEW.md`)
- [ ] T4.1 WaveSurfer integration
- [ ] T4.2 Transcript panel with sentence selection
- [ ] T4.3 Layer 1 auto-distribute (single image) preview
- [ ] T4.4 In-browser preview player (image swap on timestamp)
- [ ] T4.5 Timeline strip with thumbnails

### M5 — Foreground & Render (`06_MILESTONE_FOREGROUND_RENDER.md`)
- [ ] T5.1 Drop image onto sentence range (foreground item creation)
- [ ] T5.2 Asset cache (per-clip pre-render)
- [ ] T5.3 Filtergraph builder
- [ ] T5.4 Compose endpoint (single ffmpeg invocation)
- [ ] T5.5 WebSocket render progress
- [ ] T5.6 Render history UI

### M6 — Polish (`07_MILESTONE_POLISH.md`)
- [ ] T6.1 Final render preset
- [ ] T6.2 Subtitle SRT generation
- [ ] T6.3 Subtitle burn-in toggle
- [ ] T6.4 Auto-distribute multi-image
- [ ] T6.5 Auto-distribute clips with black-tail fallback
- [ ] T6.6 Watermark layer
- [ ] T6.7 Time-pinned override (anchor:"time")
- [ ] T6.8 PiP compositing mode
- [ ] T6.9 Configurable transitions (cut / fade / slide)

---

## Blocked

(none)

---

## Notes log

(empty — agents append timestamped notes here when relevant)

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
