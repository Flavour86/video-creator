# task-09 - integrated v1.2 editor flow evidence

- Browser flow added in `apps/web/tests/e2e/render-correctness-v1-2-integrated-editor-flow.spec.ts`.
- Captured 15 screenshots: final editor state, background modal, subtitle modal, preview transport, and render output at `1920x1080`, `1280x720`, and `1080x1920`.
- The flow creates a manual background schedule with a zero `ramen-shop.jpg` row and a `30s-40s` gap, sets subtitle max characters to `20`, reloads, verifies persisted UI/config, asserts whole-second transport text `00:38 / 15:42`, and renders final output.
- Verify: `rtk pnpm -F @vc/web test:e2e -- render-correctness-v1-2` passed: 3 passed.
- Verify: `rtk pnpm test` passed: server `284 passed, 9 skipped`; web `76 files, 679 tests`.
- Verify: `rtk pnpm lint` passed after wrapping one server lint line; remaining web output is existing `<img>` warnings.
- Verify: `rtk pnpm build` passed with existing `<img>` warnings.
- Verify: `rtk pnpm -F @vc/web test` passed: 76 files, 679 tests.
- Verify: `rtk pnpm -F @vc/server test` passed: 284 passed, 9 skipped.
- Verify: `rtk pnpm -F @vc/web test:e2e -- render-correctness` passed: 7 passed, 3 skipped.
