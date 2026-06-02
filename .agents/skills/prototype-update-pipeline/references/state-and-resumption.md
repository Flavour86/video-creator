# State & Resumption

The pipeline must survive `/clear`, crashes, and context compaction. It does this by keeping
all progress on disk and reading it at the start of every invocation. Nothing about "where we
are" should ever live only in the conversation.

## Source of truth

Two files, with a clear precedence:

1. `docs/designs/tasks/<ver>/todo.md` — checkboxes are **authoritative** for task completion.
2. `docs/designs/tasks/<ver>/state.json` — phase, approved gates, and the task cursor.

If they ever disagree, trust what is on disk (which files exist, which checkboxes are ticked)
and rewrite `state.json` to match. `state.json` is a fast index, not the truth.

## state.json schema

```json
{
  "version": "v1.1",
  "branch": "feature/v1.1-prototype-update",
  "phase": "execute",
  "gates_approved": ["prototype", "spec", "plan"],
  "current_task": "task-07",
  "references_captured": true,
  "updated_at": "2026-06-01T12:00:00Z"
}
```

- `phase` ∈ `intake | prototype | spec | plan | execute | testplan | wrap | done`.
- `gates_approved` ⊆ `prototype | spec | plan | wrap`.
- `current_task` is the cursor into `todo.md`; `null` outside Phase 4.

Write it after every state change (a gate approved, a task ticked, a phase advanced).

## Read-first protocol — run at the very start, every time

1. Resolve `<ver>`.
2. **Missing `state.json`** ⇒ first run: create `tasks/<ver>/`, init `state.json` at
   `phase=intake`, start Phase 0.
3. **Present** ⇒ reconcile from artifacts before trusting it:
   - `spec.md` exists ⇒ Phase 2 done.
   - `plan.md` + `todo.md` exist ⇒ Phase 3 done.
   - In Phase 4, set `current_task` = the **first unchecked** task in `todo.md` (re-derive;
     don't trust the stored cursor blindly).
   - `test-plan.md` exists ⇒ Phase 5 done.
4. **Report position** to the user in one line, then advance to the next gate.

## Gate names and meaning

`gates_approved` records what the user has signed off:

- `prototype` — GATE 1: the Phase-1 references look right.
- `spec` — GATE 2: `spec.md` approved and its Open Questions resolved.
- `plan` — GATE 3: `todo.md` approved.
- `wrap` — GATE 4: ready to merge (the pipeline still never merges on its own).

Never advance past a gate whose name is not yet in `gates_approved`.

## Why one segment per invocation

Running a single gate-bounded segment, then stopping, is what lets the user `/clear` between
phases. After `/clear` your context is empty but the disk is intact, so you rebuild position by
reading a few files instead of carrying the whole history. That is the mechanism that keeps a
long pipeline inside the context budget — actively encourage the user to `/clear` at gates.

## Crash / compaction safety

Phase 4 writes each task's result to disk immediately (checkbox + evidence + commit) before the
next task starts. So the worst case after an interruption is redoing the single in-flight task;
everything already checked in `todo.md` stays done.
