# Resolution Matrix

Every test-plan item is checked at **all three** of these. Skipping one is a failure — they
catch different classes of bug.

| Resolution | Aspect | Why it's required |
|------------|--------|-------------------|
| 1920×1080 | 16:9 | The standard 1080p final render — the primary delivery target. |
| 1280×720 | 16:9 | 720p draft + smaller viewports; catches layout that only holds at one size. |
| 1080×1920 | 9:16 | Vertical / shorts render; catches framing and overflow bugs the landscape sizes hide. |

Set the browser viewport to the exact pixel size before testing each one. Don't just resize a
window approximately — the point is to test the real target dimensions.

## Reference mapping for SSIM

SSIM needs two images of the **same aspect ratio**; scale both to a common size before
comparing. So:

- **1920×1080 and 1280×720** → compare against the **16:9** reference in
  `docs/designs/tasks/<ver>/visuals/` (e.g. `subtitle-modal-dark.png`). Both landscape sizes use
  the same 16:9 reference, scaled.
- **1080×1920** → compare against the **9:16** reference (e.g. `preview-dark-9x16.png`).

## When a 9:16 reference doesn't exist

Not every surface has a vertical design — many v1 surfaces are 16:9 only. If there is no
aspect-matching 9:16 reference for a feature:

- **Do not** force an SSIM comparison against a 16:9 reference — the score would be meaningless.
- Validate 1080×1920 by **behavior + screenshot presence** instead: the feature must still work
  and you must still capture `…-1080x1920.png`.
- Record this in the bug report: `SSIM: n/a (no 9:16 reference)`. It is **not** a failure on its
  own — but a missing screenshot or broken behavior at 1080×1920 still is.

The 16:9 surfaces almost always have a reference (captured in the pipeline's Phase 1), so
1920×1080 and 1280×720 are normally full SSIM checks.
