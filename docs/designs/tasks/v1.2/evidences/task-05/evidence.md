# task-05 - subtitle max characters per line - evidence

- subtitle-modal-16x9-value-20.png - Shows the Subtitles modal in 16:9 mode with `Max characters per line` visible and set to `20`.
- subtitle-modal-9x16-value-20.png - Shows the Subtitles modal in 9:16 mode with the same field visible and loaded at the persisted value `20`.
- subtitle-modal-live-wrapped-preview.png - Shows the modal preview wrapping live after the value is changed to `20`.
- subtitle-applied-editor-preview.png - Shows Apply persisted `20` and updated the editor preview with wrapped subtitles.
- subtitle-cancel-restored-draft.png - Shows a canceled draft edit restored the previously applied value `20` on modal reopen.

Verify: `rtk pnpm -F @vc/web test -- components/editor/EditorModal.test.tsx components/editor/PreviewSurface.test.tsx app/editor/page.test.tsx` passed; 76 test files, 675 tests.
