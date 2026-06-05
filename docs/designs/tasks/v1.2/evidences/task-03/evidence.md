# task-03 - manual background modal editing - evidence
- no-auto-fill.png - open Add background modal contains no Auto fill control.
- first-asset-zero-range.png - first selected background asset shows Start, End, and Hold as `00:00`.
- preserved-existing-row-after-add.png - adding `bg-crowded-1.png` preserves existing `bg-red.png`, `bg-video.mp4`, and `bg-blue.png` ranges while the new row starts at `00:00-00:00`.
- reordered-rows-unchanged-ranges.png - reordered rows keep their original ranges instead of being redistributed.
- edited-video-start-derived-end.png - editing `bg-video.mp4` Start to `00:12` derives locked End `00:16` and Hold `00:04` while other rows retain their ranges.
Verify: `rtk pnpm -F @vc/web test -- components/bg-modal/BgModal.test.tsx` - passed, 76 test files / 671 tests.
Browser evidence: `rtk pnpm -F @vc/web test:visual -- task03-bg-modal-evidence.spec.ts` - passed, 1 Playwright test; temporary capture spec removed after screenshots were saved.
