# Visual Parity Rules — Style, Not Content

The references in `docs/designs/tasks/<ver>/visuals/` capture how a surface should **look**.
They cannot capture the exact data a real project will contain. So parity means the **style**
matches the reference — never that every pixel matches.

This is the single most important nuance of the SSIM check: don't fail a feature because the
real project's content differs from whatever happened to be in the reference screenshot.

## Static style (must match) vs dynamic data (expected to differ)

**Must match the reference:**
- Layout & geometry — panel/modal sizes and positions, grid, alignment.
- Color & theme — background, text, accent, borders (the design tokens).
- Typography — font family, size, weight, line height.
- Spacing — padding, margins, gaps, radii.
- The changed controls and their states — the new field/control is present, in the right place,
  styled correctly, in the correct state (default / active / disabled / open / empty / error).

**Expected to differ — do NOT require a match:**
- Transcript / subtitle **text** content.
- Waveform shape, audio length.
- Media thumbnails and the live preview video **frame**.
- Project name, file names, render output names.
- Timecodes, durations, ETA, progress %, dates, counts.

A difference in dynamic data is normal and is **not** a failure. A difference in style **is**.

## How to score it

1. Prefer to compare the **changed static element** — e.g. the subtitle modal's Color control,
   the watermark position/opacity/size controls, the autosave status text, the sentence edit
   icon. These are chrome, so SSIM on them is meaningful.
2. If the captured frame contains large dynamic regions (preview, waveform, transcript list),
   **mask those regions** (or crop to the static chrome) before computing SSIM, so the score
   reflects style and not content.
3. **SSIM ≥ 0.9** is the bar for that static/style comparison.
4. If masking isn't practical, fall back to a **qualitative style judgment**: pass when the
   styling matches the reference even though the content differs; fail only when layout, color,
   typography, a control, or a state is wrong. Record which method you used in the bug report.

## Verdict for an item

- **PASS** — style matches (SSIM ≥ 0.9 on static/masked regions, or an explicit style-judgment
  pass) AND the dynamic content renders in the correct style, even if its value differs.
- **FAIL** — layout / color / typography / control / state diverges from the reference, OR the
  feature is behaviorally wrong, OR a required screenshot is missing.

Never fail an item just because the transcript had different words, the waveform looked
different, or the thumbnail was a different image. That is the entire point of this rule.
