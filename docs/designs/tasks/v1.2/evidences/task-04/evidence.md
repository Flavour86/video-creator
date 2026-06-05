# task-04 - Persist and reload manual background schedules - evidence
- saved-modal-state.png - Shows the saved manual schedule rows in the current editor session: bg0.png has 00:10-00:15 and bg1.png/bg2.png remain explicit 00:00-00:00 rows.
- reopened-modal-state.png - Shows the same row order and values after browser reload from the saved config.
- preview-scheduled-range.png - Shows the editor preview at 00:10 with bg0.png active from the explicit scheduled range.
- preview-gap.png - Shows the editor preview at 00:05 with no active background, proving the manual gap is not auto-filled after reload.
- autosave-status-after-background-change.png - Shows the editor topbar after the background change reaches Autosave saved.
Verify: `rtk pnpm -F @vc/web test -- app/editor/page.test.tsx components/bg-modal/BgModal.test.tsx lib/preview/resolveDisplay.test.ts` passed (76 files, 673 tests).
Browser: `rtk pnpm exec playwright test tests/visual/task04-evidence.spec.ts --config=playwright.config.ts` passed (temporary spec removed after capture).
