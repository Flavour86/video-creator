---
id: BUG-021
severity: high
area: editor
spec_ref: SPEC_EDITOR.md subtitles modal + preview / test-plan EDIT-30 EDIT-31
status: fixed
discovered: 2026-05-25
---

## Summary
Subtitle text rendering was not breaking naturally for long lines and could drift away from the intended bottom-safe placement. It also degraded when subtitle style settings (larger font, background/border) were changed.

## Steps to Reproduce
1. Open `/editor/:projectId` with long Chinese subtitle lines.
2. Play preview and observe subtitle block in lower area.
3. Increase subtitle font size and enable subtitle background style.
4. Observe line breaks and subtitle placement stability.

## Expected
- Subtitle text wraps naturally into readable lines.
- Subtitle block stays in the bottom-safe region (centered horizontally for bottom placement).
- Larger font and background/border styles still render correctly without layout break.

## Actual
- Wrapping behavior was inconsistent and not naturally segmented.
- Placement/style combinations could produce unreadable layout pressure.

## Evidence
- Browser verification (2026-05-25): long lines wrap naturally with bounded multi-line layout and remain bottom-safe during preview playback.
- Screenshot: `bug021-subtitle-wrap-capped.png`.

## Notes
- Fix adds natural wrapping with CJK-friendly line breaking and bounded line count.
- Subtitle rendering remains compatible with larger font sizes and styled background/stroke.

## Missing
Implemented: preview subtitle text layout now preserves structure, wraps naturally, caps lines safely, and keeps stable bottom-safe placement across style changes.

