# Sweep Protocol

The full loop, and the exact conditions that make something fail. Read this before you start and
again before you call a sweep clean.

## The loop

1. Read `docs/designs/tasks/<ver>/test-plan.md`. Each section is one item to verify; its
   `Pass criteria` is the behavioral oracle, its `Steps` are what to do.
2. Prepare `docs/designs/bugs/<ver>/evidence/`.
3. For **each item**, for **each resolution** (1920×1080, 1280×720, 1080×1920 — see
   resolution-matrix.md):
   a. Open the item's route/state in a real browser (Chrome DevTools MCP via
      browser-testing-with-devtools, or Playwright). Set the viewport to the exact resolution.
   b. Perform the `Steps` and observe the actual result against each step's Expected.
   c. Capture `docs/designs/bugs/<ver>/evidence/<feature>-<resolution>.png`.
   d. Compute SSIM against the aspect-matching reference **on the static/masked regions (style,
      not content)** and record the score (or `n/a` per the matrix rule). See
      visual-parity-rules.md for what counts as static vs dynamic.
4. Record the per-resolution outcome for the item.
5. After all items: write the report (bug-report-template.md) and state the verdict.

## Fail conditions — absolute

A test-plan item is **PASS** only if, at all three resolutions, every one of these holds. If any
fails for any resolution, the item is a **FAIL**:

- The feature was exercised in a **real browser**. Running the unit/integration suite instead is
  an automatic FAIL — the suite tells you the logic ran, not that the user sees the right thing.
- A **screenshot exists** at `evidence/<feature>-<resolution>.png`. No screenshot = FAIL.
- **Behavior matches** every Expected in the item's Steps / Pass criteria.
- **Style matches** the reference — SSIM ≥ 0.9 on the static/masked regions, or an explicit
  style judgment (see visual-parity-rules.md). A difference only in dynamic data (transcript
  text, waveform, thumbnail, preview frame, names, timecodes) is **not** a failure. Where no
  aspect-matching reference exists, SSIM is `n/a` and not counted — the screenshot and
  behavioral checks still apply.

## Verdict

- **Clean** — every item passed at all three resolutions. The pipeline may proceed toward GATE 4.
- **Failing** — at least one item failed. The report lists every failure with enough detail to
  reproduce and fix. The pipeline turns each into a fix task (back to its Phase 4) and re-sweeps.

## Why so strict about the browser

This product is almost entirely about what ends up on screen — transcript timing, the preview
compositor, watermark/subtitle styling, the final render at different aspect ratios. Logic tests
pass routinely while the rendered result is wrong. The browser screenshot at each real
resolution is the cheapest honest check that the visible result is correct. Don't shortcut it,
and never record a screenshot or SSIM you didn't actually produce.

## Honesty

If you can't open the browser, can't reach a route, or a resolution won't render, that is itself
a finding — record it as a FAIL with the reason. A sweep that quietly skips the hard cases is
worse than useless because it hides exactly the bugs worth finding.
