---
id: BUG-028
severity: high
area: editor
spec_ref: SPEC_EDITOR.md inspector rail watermark interaction / test-plan EDIT-25
status: fixed
discovered: 2026-05-25
---

## Summary
The global "Watermark" control interaction did not follow the expected dialog-based flow for selecting/changing watermark assets.

## Steps to Reproduce
1. Open editor and locate `Global Video Config` in Inspector.
2. Click `Watermark`.
3. Observe resulting interaction.

## Expected
Clicking `Watermark` opens a dedicated modal/dialog where user can:
- enable/disable watermark
- upload asset
- choose from available assets

## Actual
Interaction did not open the expected asset dialog flow.

## Evidence
- Browser verification (2026-05-25): clicking Watermark opens modal with enable toggle, upload entry, and asset grid.
- Screenshot: `bug028-watermark-modal-open.png`.

## Notes
- Modal-backed flow aligns with existing editor dialog patterns and avoids hidden in-panel mutation.

## Missing
Implemented: inspector watermark action now opens dedicated `WatermarkModal` and supports asset selection/update workflow.

