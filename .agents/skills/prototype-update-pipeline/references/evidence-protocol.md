# Evidence Protocol

"Done" means someone can **see** it worked — not merely that a test went green. Every Phase-4
task leaves behind browser screenshots that prove the change. This protocol says what to
capture, where, and the one rule that is never waived.

## The rule that is never waived

A passing unit/integration test is necessary but **not sufficient**. A task is not done until
the changed behavior has been exercised in a real browser and a screenshot saved. If you can't
produce the screenshot, the task isn't done — say so plainly; never fabricate evidence or claim
a browser check you didn't run.

This exists because the whole product is visual (transcript editing, preview compositor, render
output). Logic-level tests routinely pass while the user sees the wrong thing on screen. The
screenshot is the cheapest honest proof that the gap isn't there.

## What to capture

Capture the screens/states named in the task's `todo.md` `Evidence:` line — and capture the
**meaningful states**, not a single frame. Examples:

- A modal change: closed → open → after-edit.
- A control (opacity, position, color): default, the control set to a value, and the resulting
  effect on the preview/render.
- A list/timeline change: before and after the interaction (add, drag, delete).

## Where it goes

```
docs/designs/tasks/<ver>/evidences/<task-id>/<screen-or-state>.png
```

Name each shot for the state it shows: `subtitle-modal-color-open.png`,
`watermark-opacity-applied.png`. A reader should know what it proves from the filename alone.

## evidence.md — one per task

After the subagent returns, write `docs/designs/tasks/<ver>/evidences/<task-id>/evidence.md`:

```
# <task-id> — <title> — evidence
- <screen-or-state>.png — <what it proves about the Acceptance>
- <screen-or-state>.png — <...>
Verify: <the commands run and their result>
```

This is what lets a later session — or the bug sweep, or the user — trust the task without
re-running it.

## Tooling

Chrome DevTools MCP (browser-testing-with-devtools) is the default for interactive checks and
screenshots. Playwright (playwright-best-practices) is for committed specs, including the
build-time visual-parity spec that asserts SSIM ≥ 0.98 against `tasks/<ver>/visuals/`. That
parity check compares **style, not content** — drive it with deterministic fixtures (or mask
dynamic regions) so transcript text, waveforms, thumbnails, names, and timecodes don't cause
false misses; a dynamic-data difference is not a parity failure. Use whichever tool fits the
task — but the real-browser check itself is mandatory either way.
