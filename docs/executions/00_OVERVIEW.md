# Execution Guide — Overview

> **Purpose**: Step-by-step instructions for any AI coding agent (Claude Code, GPT-4/Codex, Claude Sonnet, DeepSeek, Cursor, etc.) to build the Video Creator project from a clean directory to a working Phase 1 release.
>
> **Audience**: AI agents. Read this entire file before starting work, then proceed to the milestone files in order.
>
> **Companion document**: `../designs/PHASE_1_DESIGN.md` — the *why* behind every decision. This file is the *how*.

---

## 0. How to use this guide

### 0.1 Reading order
1. **This file** (`00_OVERVIEW.md`) — operating model, conventions, agent protocol.
2. **`CONVENTIONS.md`** — code style, naming, commit style, file organization rules.
3. **`AGENT_HANDOFF.md`** — what to do when picking up mid-project.
4. **`STATE.md`** — current progress checklist. Read this to know what's done and what's next.
5. **`01_ENVIRONMENT.md`** — prerequisites verification + dependency installation.
6. **Milestone files** (`02_…` through `07_…`) — execute tasks in order.
7. **`docs/prototype/v1` is the prototype code, [SPEC.md](../prototype/v1/SPEC.md) is the specification of interactions**, if you are not able to browse the visual page in the browser, I have already run it at `http://192.168.31.48:8000/app.html`, using MCP tool to check the real interactions out 

### 0.2 Per-session protocol (every time an agent picks up work)

```
┌─ Agent session start ────────────────────────────────────────┐
│ 1. Read STATE.md → identify next unchecked task.            │
│ 2. Read CONVENTIONS.md (skim if previously read).           │
│ 3. Read the milestone file containing the next task.        │
│ 4. Read AGENT_HANDOFF.md if any prior task is partially     │
│    complete (marked "[~]" in STATE.md).                     │
│ 5. Run the "Skip-detection check" for the task — if it      │
│    passes, mark task complete in STATE.md and move on.      │
│ 6. Execute the task per its instructions.                   │
│ 7. Run the task's "Verification" section.                   │
│ 8. Update STATE.md: change [ ] to [x], add commit SHA.      │
│ 9. Commit with the convention in CONVENTIONS.md.            │
│ 10. Stop after one task unless instructed to continue.      │
└──────────────────────────────────────────────────────────────┘
```

### 0.3 Hard rules for agents (**Do not violate**)

1. **Never proceed past a failed verification.** Diagnose and fix. Do not modify the verification to make it pass.
2. **Never skip ahead.** Tasks have ordering for a reason. If T2.3 depends on T2.1, do not attempt T2.3 first.
3. **Never invent file paths or commands.** Every path and command in this guide is exact. Use them verbatim.
4. **Never silently delete or overwrite the user's files.** This includes `.gitignore`d files, project folders, and existing code. If something is in the way, ask via a clarifying note in `STATE.md`'s "Blocked" section and stop.
5. **Never commit secrets** (API keys, tokens, `.env` files). The repo's `.gitignore` blocks `.env*` — do not weaken it.
6. **Always run all verification commands** for the task, not just the first one.
7. **One task per commit.** Atomic, revertable history.
8. Highly replicate the fidelity of the visual effect presented by the prototype `docs/prototype/v1`
9. **Stop and ask** if a task's instructions conflict with what you find on disk. Add a `## Blocked` entry to `STATE.md` and stop.
10. **When you are in the development, invoke the `test-driven-development` skill, [frontend](../../apps/web) related code also should invoke `next-best-practices` skill, [backend](../../apps/server) related code also should invoke `fastapi-python` skill** 

### 0.4 Task ID grammar

```
T<milestone>.<task>           e.g., T3.2 = Milestone 3, Task 2
T<milestone>.<task>.<step>    e.g., T3.2.1 = Step 1 of T3.2 (rare; only used inline)
```

### 0.5 Status markers in STATE.md

| Marker | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress / partially done — read the agent's notes below the line |
| `[x]` | Done; commit SHA recorded |
| `[!]` | Blocked — read the agent's notes; user input required |
| `[s]` | Skipped intentionally (e.g., already done before the guide existed); commit SHA noted |

---

## 1. Project north star (summary)

A locally-run web app (Next.js + FastAPI sidecar) that takes a user's voice recording, written transcript, and a folder of images/clips, then composes a 1080p YouTube-ready MP4. The user assigns images or videos to ranges of sentences in the transcript, with optional time-pinned overrides. Phase 1 is fully local; no AI generation, no cloud calls. Phase 2 (out of scope here) adds AI image generation, image-to-video, and LoRA-trained character consistency, all routed through online serverless GPUs (Fal / Modal). Phase 3 (out of scope here) productizes as a SaaS.

The prototype(UI) at `docs/prototype/v1/app.html` is the **reference implementation** for all UI interactions, data shapes, and visual behavior. Run it at `http://192.168.31.48:8000/app.html` or serve locally. Consult `docs/prototype/v1/SPEC.md` for the full interaction specification before implementing any Editor or Preview milestone.

The UI is a 5-tab single-page app: **Launcher** (recent projects), **Setup** (voice/transcript/media), **Editor** (main editing surface), **Render** (render pipeline + history), and **Tokens** (live design-system reference), Tokens tab is for tailwind to extract the css tokens for global usage and theme changing, so don't show it in the app.

The Editor's core model is a **layers array** — Subtitles (always on top), one or more PiP layers, one or more Foreground layers, and an optional Background layer at the bottom. The user assigns images/videos to sentence ranges via the **Assign Media modal**, fine-tunes clips in the **Inspector**, and manages all layers via the **Layers popover**. 
The transcript is always the source of truth for timing; WhisperX forced-alignment turns sentence ranges into time ranges. The user can draft-render inline (stays in editor) or final-render on the Render screen.

---

## 2. What "done" means for Phase 1

Acceptance test (literal):

```
1. On a clean Windows 11 machine with Node 22, Python 3.11, and ffmpeg installed,
   run:
       npx @yourname/video-creator
2. A browser tab opens to http://localhost:3000.
3. Click "New Project". stuff test ingredients in:
     - voice.wav (5-30 minutes, ~50-300 sentences)
     - transcript.txt (matching script)
     - 5-80 images (jpg/png)
4. Wait for alignment to finish (≤ 90 sec on RTX 5070 Ti, ≤ 5 min on CPU).
5. Multi-select sentence range, drop image → it appears in timeline strip.
6. Repeat ~30 times.
7. Check "Render Draft" → preview MP4 in renders/ within 2 minutes.
8. Check "Render Final" → 1080p MP4 in renders/ with whole duration, this one start testing after the "Render Draft" test passed.
9. Check the resule of render whether matches our expectation, see  video checking steps below.
10. If any one is failed in the video checking steps, fix them and run again until everything runs same as we expected.
11. The UI and interactions replication should realize exactly basing on URL:http://192.168.31.48/app.html, which is the truth of visual scenes user want, the code is in the `docs/prototype/v1`, don't copy the css code from it, implement same effect with tailwind css, if you aren't able to know the effect visually, using chrome-devtool MCP interact with it. Stop and ask user when the URL is unable to access.
```

When all 11 steps pass on the user's machine, Phase 1 is done and then ask user checking

### video checking steps
- Run the app/render pipeline with provided transcript voice, and image scenes.
- Use ffprobe to verify codec, duration, resolution, audio/video streams, frame count, timestamps.
- Extract frames at key timestamps or every N seconds with ffmpeg.
- Open/view sampled frame images here and check whether the expected scene, PiP/FG/BG/subtitles/watermark/transitions appear.
- Detect obvious issues: black frames, missing overlays, wrong scene timing, bad opacity, wrong position, subtitle accuracy according transcript, subtitle burn-in, resolution mismatch, no audio, duration mismatch.
- Generate contact sheets from many frames so we can review the whole render visually in one or a few images.

---

## 3. Repository layout (target end-state)

```
video-creator/
├── PHASE_1_DESIGN.md                 # canonical design (already exists)
├── README.md
├── package.json                       # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .nvmrc                             # "22"
├── .python-version                    # "3.11"
├── .gitignore
├── .editorconfig
│
├── docs/
│   ├── designs/
│   │   └── PHASE_1_DESIGN.md          # (current)
│   └── executions/
│       ├── 00_OVERVIEW.md             # this file
│       ├── CONVENTIONS.md
│       ├── AGENT_HANDOFF.md
│       ├── STATE.md
│       ├── 01_ENVIRONMENT.md
│       ├── 02_MILESTONE_SKELETON.md
│       ├── 03_MILESTONE_PROJECT_IO.md
│       ├── 04_MILESTONE_ALIGNMENT.md
│       ├── 05_MILESTONE_PREVIEW.md
│       ├── 06_MILESTONE_FOREGROUND_RENDER.md
│       └── 07_MILESTONE_POLISH.md
│
├── apps/
│   ├── web/                           # Next.js frontend
│   └── server/                        # FastAPI backend (Python)
│
├── packages/
│   └── shared-schemas/                # JSON schema + codegen for TS + Pydantic
│
└── scripts/
    ├── setup-gpu.ps1                  # Windows + Blackwell CUDA install
    ├── setup-cpu.sh                   # Unix + CPU-only fallback
    ├── verify.ps1                     # full repo verification (Windows)
    └── verify.sh                      # full repo verification (Unix)
```

---

## 4. Milestones at a glance

| ID | File | Tasks | Estimated agent work |
|---|---|---|---|
| **M0** | `01_ENVIRONMENT.md` | 5 checks | 30 min |
| **M1** | `02_MILESTONE_SKELETON.md` | 7 tasks | 4–8 hours |
| **M2** | `03_MILESTONE_PROJECT_IO.md` | 5 tasks | 4–6 hours |
| **M3** | `04_MILESTONE_ALIGNMENT.md` | 5 tasks | 6–10 hours |
| **M4** | `05_MILESTONE_PREVIEW.md` | 5 tasks | 8–14 hours |
| **M5** | `06_MILESTONE_FOREGROUND_RENDER.md` | 6 tasks | 14–22 hours |
| **M6** | `07_MILESTONE_POLISH.md` | 9 tasks | 14–20 hours |
| | **Total** | **42 tasks** | **~50–80 agent-hours** |

Solo-dev wall time with one agent: **2–3 weeks** at a steady pace.

---

## 5. Verification philosophy

Every task must end with a **verifiable check** that an agent can run and an automated harness can interpret. The format is always:

```
Run: <exact command>
Expect: <exit code 0 AND substring match in stdout>
```

If the verification command fails:
1. Read the error.
2. Diagnose root cause.
3. Fix the underlying issue.
4. Re-run verification.
5. Do **not** modify the verification command itself to make it pass.

---

## 6. Cross-platform support

The project is supported on **two host platforms**:

| Platform | Shell | Package manager (system tools) |
|---|---|---|
| **Windows 11** | PowerShell 5.1 / 7 | `winget` |
| **macOS 13+** (Intel or Apple Silicon) | Bash / Zsh | `brew` (Homebrew) |

Linux is unsupported in Phase 1 but most commands work identically to macOS via Bash; tasks should also succeed there.

The user's primary machine is Windows; their secondary is a MacBook. Tasks must work on both. Code is cross-platform by design — Node scripts use `process.platform` checks, Python is portable, ffmpeg behaves identically.

### 6.1 Shell command equivalents

This guide writes shell commands primarily in **PowerShell** form (the user's primary machine). Where commands differ on macOS, the Bash equivalent appears in a callout. When only one form is shown, the command works on both platforms.

| Operation | PowerShell (Windows) | Bash (macOS / Linux) |
|---|---|---|
| Path separator | `\` (also accepts `/`) | `/` |
| Read env var | `$env:NAME` | `$NAME` |
| Set env var | `$env:NAME = "value"` | `export NAME=value` |
| Null device | `$null` | `/dev/null` |
| Line continuation | `` ` `` (backtick) | `\` (backslash) |
| Run B if A succeeded | `A; if ($?) { B }` | `A && B` |
| Test path exists | `Test-Path <path>` | `test -e <path>` or `[[ -e <path> ]]` |
| Create directory recursively | `New-Item -ItemType Directory -Force -Path <p>` | `mkdir -p <p>` |
| Activate Python venv | `.\.venv\Scripts\Activate.ps1` | `source .venv/bin/activate` |
| venv Python executable | `apps/server/.venv/Scripts/python.exe` | `apps/server/.venv/bin/python` |
| Read file | `Get-Content <path>` | `cat <path>` |
| Get current dir | `(Get-Location).Path` | `pwd` |

### 6.2 Platform-conditional tasks

Some tasks (e.g., GPU detection in T0.5) behave differently between platforms:

- **Windows + NVIDIA GPU**: full CUDA path with `nvidia-smi` detection.
- **Apple Silicon (M1/M2/M3/M4)**: PyTorch MPS backend is *technically* available, but **WhisperX is configured to run on CPU on macOS** in Phase 1. Apple Silicon CPU is fast enough (≈2 min for a 15-min audio align), and `mps` adds correctness risks WhisperX hasn't fully validated.
- **Intel Mac**: CPU only.

Each task that has platform-conditional behavior calls it out explicitly in its **Steps** section.

---

## 7. Definitions (glossary)

- **Project**: a self-contained folder on disk holding `project.json`, `voice.wav`, `transcript.txt`, `media/`, `renders/`, and `.vc/` cache.
- **Foreground item**: an entry in `project.layers.foreground[]` that pins a media file to a transcript range or time range.
- **Auto-distribute layer**: Layer 1 — the "default visual" track that fills time when no foreground item is active.
- **Forced alignment**: WhisperX `align()` mode, which timestamps a *known* reference text against an audio file. Distinct from ASR (`transcribe()`), which we never use.
- **Asset cache**: pre-rendered short MP4s under `.vc/clips/<hash>.mp4`, one per `(media, duration, motion, transitions, output_resolution)` tuple.
- **Render preset**: `draft` (720p, ultrafast) or `final` (1080p, CRF 18, x264 `slow`).
- **Sidecar**: the FastAPI Python process spawned by the Next.js launcher.

---

## 8. When to escalate to the human

Add a `## Blocked` section to `STATE.md` and stop work if any of the following occur:

- A task's instructions conflict with what you find on disk and the conflict is non-trivial.
- A dependency install fails on the user's specific OS/hardware after 3 different documented fix attempts.
- A verification command fails for a reason not covered in the task's "Common failures" section, and your best-effort fix attempt also fails.
- The user's existing files appear to contain manual edits that would be overwritten if you proceed.
- You discover a security or data-loss risk not anticipated by the design doc.

**Format for `## Blocked`:**
```markdown
## Blocked

**Date**: 2026-05-06T10:30Z
**Task**: T3.4
**Issue**: [precise description, including error output]
**Attempted**: [what you tried]
**Need from human**: [specific question]
```

---

## 9. Now do this

1. Read `CONVENTIONS.md`.
2. Read `STATE.md` (initialize from `STATE.template.md` if STATE.md does not yet exist).
3. Read `01_ENVIRONMENT.md` and run the environment checks.
4. Proceed to the next unchecked milestone file.

Good luck. Be precise. One task at a time.
