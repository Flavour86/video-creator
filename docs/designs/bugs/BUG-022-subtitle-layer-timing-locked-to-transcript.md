---
id: BUG-022
severity: high
area: editor
spec_ref: SPEC_EDITOR.md timeline + transcript alignment / test-plan EDIT-09 EDIT-20
status: fixed
discovered: 2026-05-25
---

## Summary
Subtitle timeline clips were editable (drag/stretch), which allowed changing cue timing ranges directly from the timeline and broke alignment with transcript timing.

## Steps to Reproduce
1. Open editor timeline with subtitle clips visible.
2. Select a subtitle clip and attempt drag/resize.
3. Observe whether clip start/end timing can be changed.

## Expected
- Subtitle clip timing is locked to transcript-aligned cue timing.
- Timeline interactions may select subtitle clips but must not change cue start/end.

## Actual
- Subtitle timing was mutable from timeline interactions.

## Evidence
- Browser verification (2026-05-25): subtitle row renders without resize handles and subtitle drag no longer mutates timing.
- Screenshot: `bug026-timeline-align-fixed.png`.

## Notes
- Sentence merge remains the supported workflow to adjust subtitle grouping.
- Direct subtitle timing edits in timeline are intentionally blocked.

## Missing
Implemented: subtitle drag/resize mutation path removed from timeline interaction model; subtitle clip timing is now read-only in timeline.

