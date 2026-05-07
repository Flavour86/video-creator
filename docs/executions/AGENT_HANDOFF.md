# Agent Handoff Protocol

> **When to read this**: when starting a new session and `STATE.md` shows any task as `[~]` (in progress) or `[!]` (blocked).

---

## 1. Resuming a `[~]` (in-progress) task

A previous agent left this task partially complete. Your job is to finish it, not redo it.

### Steps

1. **Read the task spec** (in the relevant milestone file) end-to-end.
2. **Read the latest entries in `STATE.md` → Notes log**. Look for `T<id>` mentions and the most recent date. The previous agent should have noted:
   - What was completed.
   - What was deferred or blocked.
   - Any new files written.
   - Any new dependencies installed.
3. **Run `git log --oneline -20`**. Identify commits from the prior agent. Read their diffs (`git show <sha>`).
4. **Run the task's "Verification"** section. If it passes, the task is actually done — update `STATE.md` to `[x]` with the most recent relevant commit SHA.
5. If verification fails, identify which sub-step failed and resume from there. Do not redo work that was already committed.
6. Commit any new work as a new commit (do **not** amend the prior agent's commits).

### Example

```
STATE.md says:
  - [~] T3.3 Forced alignment endpoint — commit f00ba12

Notes log says:
  2026-05-06 14:30Z: T3.3 partially done. /align endpoint
  works for the happy path but does not handle missing
  voice.wav (returns 500 instead of 404). Needs error path.
```

→ Read commit `f00ba12`, write a fix for the missing-file case, add a test, commit, update STATE.md to `[x]` with the new SHA.

---

## 2. Resuming a `[!]` (blocked) task

The previous agent could not proceed. Read carefully before acting.

### Steps

1. **Read the `## Blocked` section** in `STATE.md`. It should describe:
   - The exact issue.
   - What the previous agent attempted.
   - The specific question for the human.
2. **Check whether the human has resolved the block.** Look for:
   - A more recent commit by the human that addresses the issue.
   - A note from the human in the Notes log.
   - An updated task spec in the milestone file.
3. If the block is **still active**: do nothing. Add a note saying you observed the block but did not act, and stop.
4. If the block is **resolved**: clear the `## Blocked` entry, change `[!]` → `[ ]`, and proceed with the task normally.

### Do not "unstuck" yourself by changing the task

If the spec says "use WhisperX" and the previous agent blocked because WhisperX wouldn't install, do not switch to a different library on your own. The block exists for a reason. Wait for the human's call.

---

## 3. Discovering inconsistencies between the docs and the repo

If you find that:
- A file the spec says should exist, doesn't.
- A file exists with content the spec doesn't describe.
- The repo is on a branch other than `master`.
- A previous agent added a dependency not on the approved list in `CONVENTIONS.md`.

…**stop and add a `## Blocked` entry** describing what you found. Do not "fix" the inconsistency unilaterally.

---

## 4. Resuming after a long gap

If `STATE.md`'s "Last updated" timestamp is more than ~7 days old, before resuming:

1. Run `git log --oneline -20` and check whether commits exist that aren't reflected in STATE.md (the human may have done work directly).
2. Run `pnpm install` and `uv sync` (or equivalent for the repo's Python tooling) — dependencies may have shifted.
3. Run the most recent milestone's smoke test to confirm the codebase still works as expected.
4. Update STATE.md if you find drift.

---

## 5. Cross-agent compatibility notes

This guide is designed to work across multiple agent platforms. Some platform-specific gotchas:

### Claude Code
- Has the `Edit` tool. Prefer it over rewriting whole files.
- Can run interactive commands; long-running processes go in `run_in_background=true`.
- Respects pre-commit hooks; do not bypass with `--no-verify`.

### GPT-4 / Codex CLI
- May not have a direct `Edit` tool — may use `Bash` to write files via heredoc. That is acceptable; the result is identical.
- May be more prone to hallucinated paths. Always verify a file exists before editing (`ls` or `Test-Path`).

### Cursor
- Composer mode can edit multiple files. Ensure each file aligns with the spec, not Cursor's own guesses.
- Disable auto-commit settings if any. One commit per task is enforced.

### DeepSeek (via API or web UI)
- May not have native tool calls. The user may need to copy-paste commands and outputs.
- Be extra explicit about file paths and full file contents. The user is the agent's hands.

**Universal**: always end a session by writing a clear note to `STATE.md` describing exactly where you stopped, so the next agent (which may be a different model) can resume.

---

## 6. Format for end-of-session notes

Append to `STATE.md` → Notes log. Format:

```
YYYY-MM-DDTHH:MMZ [agent: <model name>] T<id>: <one-line summary>
- What I changed: <files / commands>
- What works: <verified behaviors>
- What is incomplete: <if any>
- Next agent should: <specific guidance>
```

Example:

```
2026-05-06T14:30Z [agent: claude-opus-4-7] T3.3:
- What I changed: apps/server/server/routes/alignment.py (created),
  apps/server/server/pipeline/transcribe.py (added WhisperX wrapper),
  apps/server/tests/test_alignment.py (3 happy-path tests).
- What works: POST /align returns 200 with valid alignment.json for
  voice.wav + transcript.txt; CUDA detected; cache hit on second call.
- What is incomplete: Missing error path for absent voice file
  (returns 500, should be 404). Test for cache invalidation on
  transcript edit not yet written.
- Next agent should: Add 404 handler in alignment.py and the cache-
  invalidation test, then mark T3.3 complete.
```

---

## 7. The one rule above all others

**Read before you write.** A task that takes 30 minutes of careful reading and 5 minutes of correct edits beats one that takes 5 minutes of skimming and 60 minutes of debugging undone work.
