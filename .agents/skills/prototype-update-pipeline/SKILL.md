---
name: prototype-update-pipeline
description: >-
  Drives the full prototype-to-feature pipeline for the video-creator repo: turns a
  docs/prototype/<ver>/records.md change order (plus its annotation screenshots) into a
  shipped, browser-verified feature set. It updates the v1 prototype in place, writes
  spec.md (as-spec), breaks it into tasks (as-plan), builds each task in its own subagent
  with mandatory real-browser verification and screenshot evidence, generates test-plan.md,
  and runs the bug-inspection sweep before stopping for merge. It is a RESUMABLE state
  machine: every run reads docs/designs/tasks/<ver>/state.json + todo.md and advances exactly
  one approval gate, so a long pipeline survives /clear and context limits. Use this whenever
  the user points at a new prototype records file, says "run/continue the prototype update
  pipeline", "implement the v1.x records", "process the prototype change order", or wants the
  end-to-end iteration workflow for this repo — even if they don't name the skill.
---

# Prototype Update Pipeline

Turn a prototype change order into shipped, browser-verified features — one approval gate at
a time, resumable across sessions.

the `references/` files hold the detailed templates.

## Core principle: a resumable state machine

A full run (prototype → spec → plan → build N tasks → test plan → QA) is far too long for one
session. If progress lived in the conversation, hitting the context limit or running `/clear`
would lose it. So **progress lives on disk, never in your memory**:

- `docs/designs/tasks/<ver>/todo.md` checkboxes = authoritative record of which tasks are done.
- `docs/designs/tasks/<ver>/state.json` = current phase, which gates are approved, task cursor.

Because of this, you do **one gate-bounded segment per invocation, then stop**. After the user
approves a gate, they may `/clear` and re-invoke you; you reconstruct exactly where you were
from disk. This is what keeps context bounded and the work loss-proof. See
`references/state-and-resumption.md`.

## Start here — every single invocation

Do this before anything else, even mid-pipeline:

1. **Resolve `<ver>`** — from the user's argument, or the folder of the target
   `docs/prototype/<ver>/records.md` (e.g. `v1.1`).
2. **Load state** — read `docs/designs/tasks/<ver>/state.json` (create it on first run).
   Reconcile it against reality: do `spec.md` / `plan.md` / `todo.md` exist? which checkboxes
   are ticked? which `visuals/` and `evidences/` are present? **If state.json disagrees with
   the artifacts, the artifacts win** — re-derive the cursor from them.
3. **Report position** — tell the user plainly, e.g. "v1.1: Phase 4 (Execute), task 7/12;
   gates approved: prototype, spec, plan." Never silently resume.
4. **Advance one segment** — run from the current phase up to the next gate, then stop.

## Phases and gates

```
Phase 0  Intake     parse records.md + PNGs; create tasks/<ver>/ + state.json; set up branch
Phase 1  Prototype   edit docs/prototype/v1 in place; snapshot references          ── GATE 1
Phase 2  Spec        invoke as-spec → tasks/<ver>/spec.md                           ── GATE 2
Phase 3  Plan        invoke as-plan → tasks/<ver>/{plan.md, todo.md}                ── GATE 3
Phase 4  Execute     one subagent per task (auto-run, no per-task gate)
Phase 5  Test plan   generate tasks/<ver>/test-plan.md
Phase 6  Wrap        full gates + invoke bug-inspection; loop fixes                 ── GATE 4
```

### Phase 0 — Intake
Read `records.md` and every screenshot it references. Create `docs/designs/tasks/<ver>/` and an
initial `state.json`. Create/switch the version branch (see Git, below). Layout details:
`references/folder-layout.md`.

### Phase 1 — Prototype (→ GATE 1)
Apply each change item to the prototype **in place** under `docs/prototype/v1`. Run it, and
snapshot the changed screens into `docs/designs/tasks/<ver>/visuals/` as the canonical visual
references (capture 16:9, and 9:16 too when the change affects render output). These snapshots
are the SSIM target for later parity checks — get them faithful to the intended design.
**Stop at GATE 1.**

### Phase 2 — Spec (→ GATE 2)
Invoke the **as-spec** skill to write `docs/designs/tasks/<ver>/spec.md`. It must cover, per
change item: interactions, component states, frontend + backend behavior, acceptance criteria,
and a visual-parity map (which surface → which `visuals/` reference). Scan `records.md` for
natural-language design questions ("help me brainstorm…", "how to…") and list them as **Open
Questions** for the user to decide at this gate. Template: `references/spec-template.md`.
**Stop at GATE 2.**

### Phase 3 — Plan (→ GATE 3)
Invoke the **as-plan** skill to write `plan.md` + `todo.md`. Tasks must be small and ordered by
dependency; each task carries `Acceptance:`, `Verify:` (using the repo's `rtk pnpm …`
convention), and an `Evidence:` line naming the screens/states its subagent must screenshot.
Conventions: `references/plan-conventions.md`. **Stop at GATE 3.**

### Phase 4 — Execute (auto-run)
Walk `todo.md` in order. For each unchecked task, **dispatch one subagent with clean context**
(via the Agent tool / subagent-driven-development). Build its prompt from
`references/subagent-task-prompt.md`. The subagent runs **as-build** (TDD: RED→GREEN→commit),
uses **frontend-ui-engineering** for UI work, then **verifies in a real browser**
(browser-testing-with-devtools / playwright) and saves evidence before reporting done.

When a subagent returns, do this and nothing more before the next task:
1. Validate its report against the task's Acceptance.
2. Tick the task's checkbox in `todo.md`.
3. Write `evidences/<task-id>/evidence.md` (one line per screenshot — what it proves).
4. Update `state.json.current_task`.
5. **Drop the report from working memory** — it is now on disk. Hold at most one task's report
   at a time; this is how Phase 4 stays within context.

If a subagent reports `blocked`, stop and surface it to the user. This phase has no per-task
gate (the user chose phase-boundary gating), but report each task result as you go. Evidence
rules: `references/evidence-protocol.md`.

### Phase 5 — Test plan
Generate `docs/designs/tasks/<ver>/test-plan.md` — a step-by-step script an AI or human can
follow to test every change item. Template: `references/test-plan-template.md`.

### Phase 6 — Wrap (→ GATE 4)
Run the full gates: `rtk pnpm test`, `rtk pnpm lint`, `rtk pnpm build`, the web + server suites,
and the build-time visual-parity spec (SSIM ≥ 0.98 against `tasks/<ver>/visuals/`). Then invoke
the **bug-inspection** skill to QA-sweep `test-plan.md` across all three resolutions. If it
files bugs, turn them into fix tasks and **return to Phase 4**; re-sweep until clean.
**Stop at GATE 4** before any merge.

## Gate protocol

At each gate: stop, summarize what the phase produced (with file paths), and ask the user to
approve or request changes. On approval, append the gate name to `state.json.gates_approved`
and advance the phase. **Recommend the user `/clear` before continuing** — state on disk makes
that free, and it resets the context budget for the next phase. Never cross a gate without
explicit approval.

## Git

Work on `feature/<ver>-prototype-update` (recorded in `state.json.branch`); Phase 0 creates it
if absent and switches to it when resuming. Per-task commits come from as-build — **never add
co-author / attribution lines**. Stop at GATE 4 before merging; integrate via
`finishing-a-development-branch` only after the user approves. Full model:
design doc §11.

## Reference files

- `references/state-and-resumption.md` — state.json schema, read-first protocol, reconciliation.
- `references/folder-layout.md` — the `tasks/<ver>/` and `bugs/<ver>/` layout; the three
  screenshot sets (references vs evidences vs bug-sweep evidence).
- `references/spec-template.md` — the `spec.md` section template (Phase 2).
- `references/plan-conventions.md` — how to shape `todo.md` tasks (Phase 3).
- `references/subagent-task-prompt.md` — the per-task subagent prompt + report format (Phase 4).
- `references/evidence-protocol.md` — screenshot naming, location, and the browser-not-suite rule.
- `references/test-plan-template.md` — the `test-plan.md` structure (Phase 5).
