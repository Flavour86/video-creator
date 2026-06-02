# Folder Layout

Everything a version produces lives under two roots: `tasks/<ver>/` (the build) and
`bugs/<ver>/` (the QA sweep).

## tasks/<ver>/

```
docs/designs/tasks/<ver>/
  state.json         # pipeline cursor (see state-and-resumption.md)
  spec.md            # Phase 2 (as-spec)
  plan.md            # Phase 3 (as-plan) — narrative plan
  todo.md            # Phase 3 — ordered tasks; checkboxes are the progress record
  test-plan.md       # Phase 5
  visuals/           # canonical references, from the UPDATED PROTOTYPE (Phase 1)
    <surface>-<theme>[-<aspect>].png
  evidences/         # proof from the RUNNING APP, captured per task during Phase 4
    <task-id>/
      <screen-or-state>.png
      evidence.md
```

## bugs/<ver>/ — produced by the bug-inspection skill

```
docs/designs/bugs/<ver>/
  bug-<YYYY-MM-DD>.md
  evidence/
    <feature>-<resolution>.png
```

## Three screenshot sets — keep them straight

They look alike but answer different questions; never mix them up:

| Set | Source | Question it answers | Location |
|-----|--------|---------------------|----------|
| Canonical references | the updated prototype | "what should it look like?" | `tasks/<ver>/visuals/` |
| Build evidence | the running app, per task | "did this task work?" | `tasks/<ver>/evidences/<task-id>/` |
| Bug-sweep evidence | the running app, QA pass | "does it hold across resolutions?" | `bugs/<ver>/evidence/` |

References are the SSIM **target**. Build evidence and bug-sweep evidence are **proof**, not
targets.

## visuals naming

`<surface>-<theme>[-<aspect>].png` — e.g. `subtitle-modal-dark.png`, `preview-dark-9x16.png`.
Capture both themes when the change is theme-sensitive, and capture 9:16 when the change affects
render output (so the bug sweep can compare the 1080×1920 resolution). The new version's visual
spec points at this folder — **not** the legacy `docs/designs/visuals/`, which keeps the
pre-existing editor/render/launcher references untouched.

## bug-sweep evidence naming

`<feature>-<resolution>.png` — e.g. `watermark-position-1280x720.png`. One per feature per
resolution; a missing file is a sweep failure.
