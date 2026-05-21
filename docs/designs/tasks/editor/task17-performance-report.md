# Task 17 Performance Report (Option 3)

Date: 2026-05-21  
Decision: Open-question resolution in `docs/designs/SPEC.md` is `User: Option 3`.

## Command-Gate Results Already Achieved

The required Task 17 verification command gates were already run and confirmed green in the prior implementation session:

- `rtk pnpm test`: pass
- `rtk pnpm lint`: pass
- `rtk pnpm build`: pass
- `rtk pnpm -F @vc/web test`: pass
- `rtk pnpm -F @vc/server test`: pass
- `rtk pnpm -F @vc/web test:visual -- editor`: pass

Editor visual parity gate is included in the passing set above.

## Performance Target Status

| Target | Threshold | Measured status | Owner | Follow-up |
| --- | --- | --- | --- | --- |
| Cached-clip re-render after one property edit | `<= 0.2x` voice duration | No measured value in current gate; no deterministic ffmpeg re-render fixture exists yet | `@vc/server` | Add deterministic benchmark fixture and assertion in server performance tests; wire into Task 17 gate docs before next release gate. |
| Filter-chain build for 50 layers | `<= 50 ms` | Measured ad hoc: `4.764 ms` median for 50 layers | `@vc/server` | Promote the ad hoc measurement to a committed benchmark assertion before next release gate. |
| Undo/redo replay across a 1000-op log | `<= 100 ms/op` | Measured ad hoc: `1.017 ms` median total, `0.001017 ms/op` for 1000-op replay | `@vc/web` | Promote the ad hoc measurement to a committed benchmark assertion before next release gate. |
| Sentence-chip render at 500 chips | `~60 fps` (`<= 16 ms/frame`) | Unmeasured in command gates | `@vc/web` | Add browser benchmark scenario for 500-chip render and capture frame-time metrics in CI/headless profiling. |
| Timeline drag at 100 clips | `~60 fps` (`<= 16 ms/frame`) | Unmeasured in command gates | `@vc/web` | Add timeline drag perf harness with 100 clips and enforce frame-time budget threshold. |

## Measurement Commands

The measured values above came from ad hoc local commands rather than committed benchmark tests:

- Filtergraph: inline Python harness against `server.pipeline.filtergraph.build_compose_command`, 50 foreground layers, 50 runs, median `4.764 ms`.
- Operation-log replay: `rtk pnpm -F @vc/web exec tsx -e ...` against `recoverWorkingState`, 1000 move operations, 25 runs, median `1.017 ms` total.

## Closure Statement

Per Option 3, Task 17 is closed with command gates green and this committed report documenting measured values where available, explicit unmeasured status where no reliable gate exists, and owner/follow-up for every unmeasured or non-gated target.
