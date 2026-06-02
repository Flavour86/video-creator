# bug-<date>.md Template

Write the report to `docs/designs/bugs/<ver>/bug-<YYYY-MM-DD>.md` (today's date). One section per
test-plan item, a per-resolution line under each, and a verdict at the end. The goal is that a
reader can fix a bug from the report alone — so failures carry expected vs actual and repro
steps, not just "broken."

## Structure

```
# Bug Report — <ver> — <YYYY-MM-DD>

Tested against: docs/designs/tasks/<ver>/test-plan.md
Resolutions: 1920x1080 | 1280x720 | 1080x1920
Summary: <X>/<N> items clean

## <item N> — <title>
- 1920x1080 : PASS  SSIM 0.97  evidence/<feature>-1920x1080.png
- 1280x720  : FAIL  SSIM 0.81  evidence/<feature>-1280x720.png
              expected: <what the test-plan said should happen>
              actual:   <what you observed>
- 1080x1920 : FAIL  missing screenshot
Severity: blocker | major | minor
Repro:
  1. <step>
  2. <step>
Notes: <e.g. "SSIM n/a at 1080x1920 — no 9:16 reference">

## <item N+1> — <title>
- 1920x1080 : PASS  SSIM 0.99  evidence/...
- 1280x720  : PASS  SSIM 0.98  evidence/...
- 1080x1920 : PASS  n/a        evidence/...   (no 9:16 reference; behavior + screenshot OK)

## Verdict
CLEAN — all items passed at all three resolutions.
-- or --
FAILING — <K> failure(s) above. Routed to fix tasks: <task-ids or "to be planned">.
```

## Field meanings

- **Per-resolution line:** `<resolution> : <PASS|FAIL>  <SSIM or n/a>  <evidence path>`. On FAIL,
  add indented `expected:` / `actual:` lines (for behavioral) and/or the reason (missing
  screenshot, SSIM below 0.9).
- **Severity:**
  - `blocker` — feature unusable or crashes; or a required screenshot/resolution is missing.
  - `major` — wrong behavior or a clear visual defect, but the feature is still usable.
  - `minor` — cosmetic or a small parity miss just under threshold.
- **Repro:** the shortest sequence that reproduces the failure, drawn from the test-plan steps.
- **Notes:** anything contextual — e.g. an `n/a` SSIM with its reason, or a flaky observation.

## Verdict rule

State **CLEAN** only when every item passed at all three resolutions. Otherwise **FAILING** —
and when invoked by the pipeline, that routes each failure back into a Phase-4 fix task before
the sweep runs again. Be specific enough that those fix tasks can be written straight from this
report.
