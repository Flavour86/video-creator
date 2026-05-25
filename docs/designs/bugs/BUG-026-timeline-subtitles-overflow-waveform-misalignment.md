---
id: BUG-026
severity: high
area: editor
spec_ref: SPEC_EDITOR.md timeline duration integrity / test-plan EDIT-20 EDIT-21
status: fixed
discovered: 2026-05-25
---

## Summary
Subtitle clips could visually overrun timeline duration bounds, causing mismatch with waveform/video duration and introducing horizontal overflow behavior.

## Steps to Reproduce
1. Open editor timeline with long subtitle track.
2. Inspect right edge alignment between waveform and subtitle clips.
3. Observe whether timeline introduces unnecessary horizontal overflow.

## Expected
- Subtitle track cannot exceed video duration/waveform bounds.
- Timeline clips are clamped to project duration.
- Horizontal overflow/x-scroll is not shown for this case.

## Actual
- Subtitle row could render beyond waveform boundary.
- Horizontal overflow behavior appeared.

## Evidence
- Browser verification (2026-05-25): subtitle clip right edge remains within timeline duration and timeline containers are overflow-hidden.
- Screenshot: `bug026-timeline-subtitle-align-no-xscroll.png`.

## Notes
- Duration clamping is applied when building rows and when computing visual width.

## Missing
Implemented: subtitle clip bounds and width are clamped to timeline duration; overflow-x is hidden for timeline surface/rows to prevent stray x-scroll.

