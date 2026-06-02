# Per-Task Subagent Prompt

Phase 4 runs **one subagent per task**, each with clean context. This file is the template for
the prompt you give that subagent and the report you require back.

Why one subagent per task: the heavy work (reading code, TDD, browser checks, screenshots)
happens in the subagent's own context window; only a short report returns to you. That keeps the
orchestrator light and the pipeline resumable. Give the subagent everything it needs so it never
has to come back with questions.

## Prompt template

```
You are implementing ONE task from the v<ver> prototype-update plan. Work only on this task.

Task: <task-id> — <title>
Plan file: docs/designs/tasks/<ver>/todo.md

Acceptance:
<paste the task's Acceptance line(s) verbatim>

Relevant spec sections:
<paste or cite the spec.md sections this task implements — interactions, component states,
frontend + backend behavior, and the visual-parity reference(s) in tasks/<ver>/visuals/>

How to build:
- Use the as-build skill: write a failing test first (RED), make it pass (GREEN), then commit.
- For UI work, use the frontend-ui-engineering skill.
- Match existing code style. Touch only what this task needs; don't refactor unrelated code.

How to verify — ALL of these, a green unit test alone is NOT enough:
- Run: <paste the task's Verify: commands, e.g. rtk pnpm -F @vc/web test -- path/to.test.tsx>
- Then verify in a REAL browser (Chrome DevTools MCP via browser-testing-with-devtools, or
  Playwright): open the affected route/state and exercise the changed behavior end to end.

Evidence — required before you may report done:
- Capture the screens/states named here: <paste the task's Evidence: line>
- Save screenshots to docs/designs/tasks/<ver>/evidences/<task-id>/<screen-or-state>.png

Commit:
- Commit via as-build. Do NOT add co-author or attribution lines.

Report back EXACTLY this JSON and nothing else:
{
  "task_id": "<task-id>",
  "files_changed": ["..."],
  "verify_results": "<command -> pass/fail summary>",
  "evidence_paths": ["docs/designs/tasks/<ver>/evidences/<task-id>/..."],
  "parity_result": "<SSIM vs the reference, or n/a>",
  "commit_sha": "<sha>",
  "status": "done" | "blocked",
  "notes": "<anything the orchestrator should know; for blocked, the reason>"
}
```

## What you (the orchestrator) do with the report

**status = done:** validate `files_changed` + `verify_results` + `evidence_paths` against the
task's Acceptance. If it genuinely meets Acceptance:
1. Tick the task's checkbox in `todo.md`.
2. Write `evidences/<task-id>/evidence.md` (see evidence-protocol.md).
3. Set `state.json.current_task` to the next unchecked task.
4. Drop the report from memory.

If it does not meet Acceptance, send the subagent back with the **specific** gap (or spawn a
focused fix subagent). Don't tick the box on a partial.

**status = blocked:** stop Phase 4 and surface the blocker to the user with the subagent's
`notes`. Don't guess past a blocker.

Hold at most one task's report at a time — everything you need to continue is on disk.

## Independent tasks

Default to sequential (simplest, cleanest context). If `todo.md` marks tasks as independent and
the user wants speed, you may fan out with dispatching-parallel-agents — but the per-task
discipline above (validate → tick → evidence → commit) is unchanged, and only one writer should
touch `todo.md`/`state.json` at a time.
