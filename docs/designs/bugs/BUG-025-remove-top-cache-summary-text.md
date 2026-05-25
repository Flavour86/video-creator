---
id: BUG-025
severity: low
area: editor
spec_ref: SPEC_EDITOR.md toolbar / test-plan EDIT-05
status: fixed
discovered: 2026-05-25
---

## Summary
The extra cache summary text below the project title in the top-left header (e.g. `cache warm 2/2`) was unnecessary and not aligned with intended toolbar presentation.

## Steps to Reproduce
1. Open editor project page.
2. Inspect top-left brand/project area below project title.

## Expected
No extra cache text line appears under the project title in the editor header.

## Actual
A secondary cache summary line was displayed.

## Evidence
- Browser verification (2026-05-25): top-left header no longer renders cache summary line.
- Screenshot: `bug024-draft-done-strip-hidden.png`.

## Notes
- Cache status remains available through dedicated status components and render context.

## Missing
Implemented: removed redundant top-left cache summary text from editor header.

