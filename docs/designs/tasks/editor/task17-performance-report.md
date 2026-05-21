# Task 17 Performance Report (Option 3)

Date: 2026-05-21  
Decision: Open-question resolution in `docs/designs/SPEC.md` is `User: Option 3`.

## Latest Performance Gate Results

All Task 17 performance targets now have committed executable benchmark assertions.

| Target | Threshold | Committed gate | Latest status |
| --- | --- | --- | --- |
| Cached-clip re-render after one property edit | `<= 0.2x` voice duration | `apps/server/tests/test_clip_cache.py::test_cached_clip_rerender_after_single_property_edit_meets_target` | Pass via targeted server performance gate. |
| Filter-chain build for 50 layers | `<= 50 ms` | `apps/server/tests/test_filtergraph.py::test_filtergraph_build_for_50_layers_meets_target` | Pass via targeted server performance gate. |
| Undo/redo replay across a 1000-op log | `<= 100 ms/op` | `apps/web/lib/editor-operation-log/operation-log.test.ts::replays a 1000-op log within the performance target` | Pass via targeted web performance gate. |
| Sentence-chip render at 500 chips | `~60 fps` (`<= 16 ms/frame`) | `apps/web/components/editor/TranscriptPane.test.tsx::renders a 500-sentence transcript window within the frame budget` | Pass via targeted web performance gate; the component virtualizes large transcript lists and measures steady-state scroll-window render. |
| Timeline drag at 100 clips | `~60 fps` (`<= 16 ms/frame`) | `apps/web/components/editor/Timeline.test.tsx::handles timeline drag at 100 clips within the frame budget` | Pass via targeted web performance gate. |

## Measurement Commands

- `rtk pnpm -F @vc/server test -- tests/test_clip_cache.py tests/test_filtergraph.py`: pass, `201 passed, 5 skipped`.
- `rtk pnpm --dir apps/web exec vitest run components/editor/TranscriptPane.test.tsx components/editor/Timeline.test.tsx lib/editor-operation-log/operation-log.test.ts`: pass, `3 passed`, `23 passed`.

## Full Acceptance Gates

The required Task 17 verification command gates were run in this closure pass and confirmed green:

- `rtk pnpm test`: pass
- `rtk pnpm lint`: pass
- `rtk pnpm build`: pass
- `rtk pnpm -F @vc/web test`: pass
- `rtk pnpm -F @vc/server test`: pass
- `rtk pnpm -F @vc/web test:visual -- editor`: pass

## Closure Statement

Per Option 3, Task 17 remains closed by command gates and this committed performance report. There are no remaining unmeasured Task 17 performance targets; each listed target is covered by a committed benchmark assertion with a green targeted gate.
