---
id: BUG-023
severity: low
area: editor
spec_ref: SPEC_EDITOR.md draft strip / test-plan EDIT-08
status: fixed
discovered: 2026-05-25
---

## Summary
Draft progress text in the editor toolbar displayed floating-point precision (e.g. `32.9745%`) instead of a clean integer percentage.

## Steps to Reproduce
1. Start "Render Draft" in editor.
2. Observe toolbar progress status text while job is running.

## Expected
Toolbar shows integer percent only (e.g. `Drafting · 32%`).

## Actual
Toolbar showed long decimal percentage values.

## Evidence
- Browser verification (2026-05-25): toolbar displays integer-only drafting percent while running.
- Screenshot: `bug023-draft-running-integer.png`.

## Notes
- Integer display improves readability and avoids noisy precision.

## Missing
Implemented: drafting percentage label now truncates to integer for toolbar display.

