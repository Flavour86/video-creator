# test-plan.md Template (Phase 5)

`test-plan.md` is a script someone — an AI or a human — can follow top to bottom to test every
change this version made, without having to read the code. The **bug-inspection** skill consumes
it directly and runs each item at three resolutions, so write each item so it can be executed in
a browser and judged objectively.

One section per change item / feature. Keep steps concrete (routes, exact clicks/inputs,
observable results) — vague steps produce vague bug reports.

## Structure

```
# Test Plan — <ver>

Preconditions (global): <how to start the app, which project/fixture to open, any seed data>
Resolutions: every item is run at 1920x1080, 1280x720, and 1080x1920 (the bug sweep enforces this).

## <item N> — <title>
Preconditions: <route, project state, fixtures specific to this item>
Steps:
  1. <action> → Expected: <observable result>
  2. <action> → Expected: <observable result>
  3. ...
Evidence: docs/designs/bugs/<ver>/evidence/<feature>-<resolution>.png   (one per resolution)
Visual parity: compare against docs/designs/tasks/<ver>/visuals/<surface>-<theme>[-<aspect>].png  (SSIM ≥ 0.9)
Pass criteria:
  - [ ] <acceptance restated as a checkable line>
  - [ ] <...>
```

## Writing good steps

- Start from a known state ("open project X on /editor/:id, subtitles toggled on").
- One action per step, each with an expected, observable result — something a screenshot can
  confirm.
- Cover the states that matter, including the empty/error path where the change touches it.
- If a feature behaves differently per resolution (e.g. 9:16 framing), say what's expected at
  each one so the sweep can judge 1080×1920 fairly rather than flagging an expected difference.

## Relationship to the sweep

The bug sweep treats each item's `Pass criteria` as the behavioral oracle, the `Evidence` line
as the required screenshots (one per resolution), and the `Visual parity` line as the SSIM check
(≥ 0.9). Anything you leave vague here, the sweep can't judge — so be specific.
