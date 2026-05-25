---
id: BUG-027
severity: high
area: editor
spec_ref: SPEC_EDITOR.md timeline layer representation / test-plan EDIT-20 EDIT-21
status: fixed
discovered: 2026-05-25
---

## Summary
Background layer visibility in timeline was missing/incorrect, making timeline composition inconsistent with configured project layers.

## Steps to Reproduce
1. Open editor and add/select a background asset.
2. Inspect timeline rows for expected layer entries.
3. Verify the background layer row appears with clip segment.

## Expected
Timeline includes background row/clip corresponding to configured background layer.

## Actual
Background row was not visibly represented in timeline.

## Evidence
- Browser verification (2026-05-25): background row appears in timeline after background is configured.
- Screenshot: `bug027-background-row-visible.png`.

## Notes
- Timeline order still respects render stack semantics.

## Missing
Implemented: background row/clip rendering path is present and validated in timeline + tests.

