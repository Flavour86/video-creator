---
name: bug-inspection
description: >-
  Browser-mandatory QA sweep for the video-creator repo. Tests a version's features against
  docs/designs/tasks/<ver>/test-plan.md in a REAL browser (Chrome DevTools MCP or Playwright)
  at three resolutions — 1920x1080, 1280x720, and 1080x1920 — captures a screenshot per
  feature per resolution into docs/designs/bugs/<ver>/evidence/, checks visual parity at
  SSIM >= 0.9 against the version's canonical references, and writes
  docs/designs/bugs/<ver>/bug-<YYYY-MM-DD>.md. Running the unit/test suite alone is NOT
  acceptable and counts as a failure. Use this whenever the user asks to QA / bug-sweep /
  inspect / smoke-test / verify a version's features, validate against the test plan, check
  multiple screen resolutions in the browser, or file bugs for the current version — and it is
  invoked automatically by the prototype-update-pipeline skill at its wrap phase.
---

# Bug Inspection

QA a version's shipped features against its test plan, in a real browser, at every required
resolution — and write down what's broken.

The detailed rules live in `references/`. This file is the operating manual.

## Why this is strict

A green unit-test suite says the code's internal logic holds; it says nothing about whether a
user actually sees the right thing at 1080p, 720p, or on a 9:16 vertical canvas. This sweep
exists to catch exactly the gap between "tests pass" and "it looks and works right in the
browser." So the rules below are non-negotiable: if a feature wasn't exercised in a real
browser, at every resolution, with a screenshot to prove it, it has not been inspected.

## Inputs

1. Resolve `<ver>` (argument, or the version under test).
2. Read `docs/designs/tasks/<ver>/test-plan.md` — the list of features/items and their expected
   behavior. Each item is one thing to verify.
3. Know the canonical references in `docs/designs/tasks/<ver>/visuals/` — the SSIM targets.

## The sweep — what to do for every test-plan item

For each item, at **each of the three required resolutions** (1920x1080, 1280x720, 1080x1920):

1. Open the relevant route/state in a real browser via Chrome DevTools MCP
   (`browser-testing-with-devtools`) or Playwright (`playwright-best-practices`). Set the
   viewport to the exact resolution.
2. Perform the test-plan steps and observe the actual result.
3. **Capture a screenshot** to
   `docs/designs/bugs/<ver>/evidence/<feature>-<resolution>.png`
   (e.g. `subtitle-color-1920x1080.png`).
4. Compute visual parity against the aspect-matching reference in `visuals/` and record the
   score. **Parity means style, not content** — compare layout, color, typography, and the
   changed controls/states; dynamic data (transcript text, waveforms, thumbnails, the preview
   frame, names, timecodes) is expected to differ and must not fail the check. Compute SSIM on
   the static/masked regions. See `references/visual-parity-rules.md`; resolution → aspect
   mapping and the missing-9:16 case: `references/resolution-matrix.md`.

A test-plan item is **PASS** only if, at all three resolutions: it was browser-tested, a
screenshot exists, behavior matches the expected result, and its **style matches** the reference
(SSIM ≥ **0.9** on the static/masked regions, or an explicit style judgment) — a difference only
in dynamic data does not count against it. Any of these failing for any resolution is a **FAIL**.

These failure conditions are absolute — re-read them in `references/sweep-protocol.md` before
you start, and again before you call the sweep clean:

- A resolution was skipped → FAIL.
- A required screenshot is missing → FAIL.
- The feature was "verified" only by running the test suite → FAIL.
- The **style** diverges from the reference (SSIM < 0.9 on static/masked regions) → FAIL. A
  difference only in dynamic data — text, waveform, thumbnail, names, timecodes — is **not** a
  failure (see `references/visual-parity-rules.md`).
- Observed behavior diverges from the test-plan's expected result → FAIL.

## Output — the bug report

Write `docs/designs/bugs/<ver>/bug-<YYYY-MM-DD>.md` (today's date). One section per test-plan
item, with a per-resolution line carrying status, SSIM, evidence path, and — on failure —
expected vs actual plus repro steps. Exact structure: `references/bug-report-template.md`.

End with a verdict: the sweep is **clean** only if every item passed at all three resolutions;
otherwise it is **failing** and the report lists every failure.

## When invoked by the pipeline

`prototype-update-pipeline` calls this at its wrap phase. Return a clear clean/failing verdict
and the report path. A failing verdict means the pipeline turns each bug into a fix task and
re-runs the sweep — so make failures specific and reproducible, not vague.

## Reference files

- `references/resolution-matrix.md` — the three required resolutions, their aspect ratios, and
  how references map to them (including the 9:16 case).
- `references/visual-parity-rules.md` — style vs dynamic data: what must match the reference and
  what may differ, and how to score SSIM on the static regions.
- `references/sweep-protocol.md` — the full browser-mandatory loop and the exact fail conditions.
- `references/bug-report-template.md` — the `bug-<date>.md` structure.
