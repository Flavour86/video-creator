# task-01 - Implement frontend manual background schedule resolution - evidence

- positive-scheduled-range.png - proves a positive-duration manual background schedule row displays its media in range at 00:02.
- zero-duration-selected-row.png - proves a zero-duration manual schedule row keeps the preview black instead of falling back to the playlist at 00:02.
- manual-schedule-gap.png - proves a gap between positive manual schedule ranges keeps the preview black instead of filling from the playlist at 00:05.
- legacy-no-schedule-fallback.png - proves a legacy background item with no schedule still uses the existing playlist fallback at 00:12.

Verify: `rtk pnpm -F @vc/web test -- lib/preview/resolveDisplay.test.ts components/editor/PreviewSurface.test.tsx` passed. Browser evidence: `rtk pnpm exec playwright test tests/visual/task-01-evidence.spec.ts --config playwright.config.ts` passed with `all_proxy` cleared for the local Playwright process.
