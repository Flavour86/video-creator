---
id: BUG-024
severity: high
area: editor
spec_ref: SPEC_EDITOR.md draft strip + toolbar gating / test-plan EDIT-07 EDIT-08
status: fixed
discovered: 2026-05-25
---

## Summary
After draft render completion, the top render strip remained visible and "Render Draft" state did not restore to normal enabled behavior.

## Steps to Reproduce
1. Trigger "Render Draft".
2. Wait for draft render to reach completion.
3. Observe top strip and toolbar button state.

## Expected
- Draft strip hides after completion.
- "Render Draft" button returns to enabled idle state (when project is valid and no active job).

## Actual
- Completed strip stayed visible.
- Toolbar behavior did not fully return to post-completion idle expectation.

## Evidence
- Browser verification (2026-05-25): strip hides after completion and draft button is enabled.
- Screenshot: `bug024-draft-done-strip-hidden.png`.

## Notes
- Render Final gating remains independent and still depends on hash-change conditions.

## Missing
Implemented: render strip now hides in `ready` state, and draft/final button disabled logic is split to restore draft availability correctly after completion.

