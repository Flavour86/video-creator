# Plan Conventions (Phase 3)

Invoke the **as-plan** skill to break `spec.md` into `plan.md` (narrative) and `todo.md` (the
executable task list). `todo.md` is what Phase 4 walks and what the checkboxes track, so its
shape matters. Mirror the repo's existing `todo.md` style (Phases → Tasks → Checkpoints) and add
two things every task needs: a stable id and an evidence line.

## Task sizing

Each task should be small enough for one subagent to finish, verify in a browser, and commit in
one focused pass — roughly one component or one slice of behavior. If a task can't be browser-
verified on its own, it's too big or too abstract; split it. Order tasks by dependency
(schema/contract first, then backend, then UI, then parity), and add a Checkpoint after each
coherent group.

## Task shape

```
## Phase <n>: <group title>

- [ ] Task <N> (task-<NN>): <title>
  - Acceptance: <objectively checkable statement(s), lifted from spec.md>
  - Verify: `rtk pnpm -F @vc/web test -- <paths>` `rtk pnpm -F @vc/server test -- <paths>`
  - Evidence: <the screens/states the subagent must screenshot, e.g.
    "subtitle modal: closed, open, color applied; preview reflecting the color">

- [ ] Checkpoint: <group title>
  - Acceptance: <the group works together end to end>
```

## Stable task ids

Give every task a zero-padded id `task-<NN>` alongside its human title. That id is the folder
name under `evidences/` and the value of `state.json.current_task`, so it must be stable — don't
renumber tasks after Phase 4 starts. If you must insert a task late, append it (`task-13`)
rather than shifting existing ids.

## The Evidence line is mandatory

Every implementing task carries an `Evidence:` line. It's the contract the subagent (and the
later bug sweep) must satisfy: name the concrete screens and states, not "test the feature." If
a change affects render output, the evidence should include the relevant aspect (16:9, and 9:16
where applicable) so the references and the bug sweep line up.

## Verify commands

Use the repo's `rtk pnpm …` convention. Include the narrowest test paths that cover the task.
These commands are necessary but not the finish line — the browser check + evidence (see
evidence-protocol.md) is what closes a task.
