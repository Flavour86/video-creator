---
id: BUG-029
severity: low
area: editor
spec_ref: SPEC_EDITOR.md inspector rail visual parity / test-plan EDIT-47
status: fixed
discovered: 2026-05-25
---

## Summary
An extra `SQLITE` pill/tag was shown in the Inspector global config header though it is not part of intended product UI.

## Steps to Reproduce
1. Open editor and inspect right-side `Inspector` header area.
2. Check `Global Video Config` row actions/tags.

## Expected
No `SQLITE` decorative/tag element is displayed.

## Actual
`SQLITE` pill was visible.

## Evidence
- Browser verification (2026-05-25): `SQLITE` pill is no longer present in Inspector header.
- Screenshot: `bug027-background-row-visible.png`.

## Notes
- Removing internal/debug-style tags reduces UI noise and keeps parity with spec-driven interface.

## Missing
Implemented: removed `SQLITE` tag from Inspector global config header.

