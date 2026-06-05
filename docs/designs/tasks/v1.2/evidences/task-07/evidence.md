# task-07 - Format preview transport timecodes without milliseconds - evidence

- transport-0012-of-0030.png - Shows the editor preview transport at `00:12 / 00:30` with no milliseconds.
- transport-seeked-0003-no-ms.png - Shows a seeked non-zero editor preview transport time as `00:03 / 00:30` with no milliseconds.
- transport-over-hour-010002-of-010101.png - Shows the editor preview transport retaining hours at `01:00:02 / 01:01:01`.
Verify: `rtk pnpm -F @vc/web test -- components/editor/PreviewSurface.test.tsx` passed, 76 files / 676 tests.
Browser: `rtk pnpm -F @vc/web test:visual -- task-07-evidence.spec.ts` passed while capturing the PNG evidence; the temporary spec was removed after capture.
