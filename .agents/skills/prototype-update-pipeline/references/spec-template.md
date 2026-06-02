# spec.md Template (Phase 2)

`spec.md` describes the **delta** this version introduces — one detailed section per change item
in `records.md` — not the whole product. Invoke the **as-spec** skill to produce it; this is the
structure and the bar it must clear. It mirrors the repo's existing `SPEC_*.md` style (precise,
acceptance-oriented) but scoped to the version.

Every change item must answer: what does the user do, what does each component show in each
state, what does the frontend do, what does the backend do, how do we know it's right, and which
visual reference proves it.

## Structure

```
# Spec: <ver> Prototype Update

## Source
- records.md items 1..N (summarize each in one line) and the screenshot each references.
- Canonical references captured in docs/designs/tasks/<ver>/visuals/.

## Change Item 1 — <title>
### Interaction
<the user-facing flow, step by step: triggers, inputs, results>
### Component states
<each affected component and every state it can be in: default, loading, active, empty, error,
disabled — and what each looks like / shows>
### Frontend behavior
<state/store changes, which working-config fields mutate, validation, optimistic UI, how it
reaches the preview/render, operation-log entry if applicable>
### Backend behavior
<routes, payloads, persistence to project_configs, shared-schema changes, pipeline/filtergraph
effects — or "none" if purely client-side>
### Acceptance criteria
<a checklist of objectively checkable statements; these become the task Acceptance lines>
### Visual parity
<which surface maps to which tasks/<ver>/visuals/ reference, and the SSIM target (0.98).
Parity = style, not content: match layout, color, typography, and the changed controls/states;
dynamic data (transcript text, waveforms, thumbnails, preview frame, names, timecodes) may
differ from the reference.>

## Change Item 2 — <title>
... (same subsections)

## Open Questions
<anything records.md asked you to "brainstorm" or that is genuinely ambiguous. Present concrete
options with a recommendation and STOP for the user at GATE 2. Record the resolution here once
decided, in the style of the repo's SPEC.md open-questions log.>
```

## Notes that matter for this repo

- **Shared schema:** if a change needs new config fields (e.g. subtitle background color, a
  per-image background duration), say so explicitly and note that generated TS/Python must be
  regenerated (`rtk pnpm gen:types`, `rtk pnpm gen:py`) — never hand-edited.
- **Persistence:** canonical config lives in SQLite `project_configs`; say which fields change.
- **Don't silently break invariants** (orphan handling, image/video playlist separation, no
  secret storage). Call out anything a change touches.
- **Open Questions are a gate, not a footnote.** The pipeline pauses at GATE 2 until they're
  resolved — for v1.1 this includes item 5 (how long an image occupies time in a mixed
  image+video background: fixed default seconds, even split of the leftover range, an explicit
  per-image duration field, or Ken-Burns over a default).
