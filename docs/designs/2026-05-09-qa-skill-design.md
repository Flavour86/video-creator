# QA Skill — Design Spec

- Date: 2026-05-09
- Status: approved for planning
- Companion to: `.claude/skills/prototype-to-tasks/SKILL.md`

## 1. Purpose

A project-local skill that acts as a **senior QA engineer**. Given a prototype URL and an implementation URL, it inspects the running implementation against the prototype and produces an actionable bug list covering UI, UX, and functional defects.

Where `prototype-to-tasks` is the senior developer who breaks a prototype down into tasks, this skill is the QA who verifies the resulting implementation matches what the prototype promises — both visually and behaviorally — and stays catching bugs across iteration cycles until the feature actually works end-to-end with real data.

## 2. Failure modes this skill prevents

- The implementation looks right but renders sample data; tests pass but the feature doesn't update when real data changes.
- Visual drift from the prototype is ignored because "it's close enough"; small drift accumulates into a different feeling product.
- A visible visual bug is filed without identifying its functional cause, so the next iteration patches the symptom and the cause re-surfaces.
- The bug list becomes a snapshot the user has to reconcile manually after each fix cycle.

## 3. Skill metadata

- **Name**: `qa`
- **Location**: `.claude/skills/qa/SKILL.md` (project-local)
- **Trigger phrases**: "QA this", "test the implementation against the prototype", "find bugs in this feature", "compare the prototype with what's built", "inspect the implementation", or sharing both a prototype URL and an implementation URL with verification intent.
- **Character**: senior QA engineer. Skeptical of every visible value and every interaction. Demands proof that values are wired (not just look right). Never invents requirements beyond what the prototype shows.

## 4. Inputs and invocation

Per invocation the skill receives:

- **Prototype URL** — e.g. `http://192.168.31.48/app.html` (LAN) or any reachable URL.
- **Implementation URL** — e.g. `http://localhost:3000/<route>`.
- **Implicit**: the skill is run inside the implementation repo and may read its source.

Optional flags:

- `--mode=full|verify|integration` (default `full`)
- `--viewports=1920,1280,768` (default: native render width of the prototype)
- `--related=<url>,<url>` (used by `integration` mode only)

## 5. Modes

### 5.1 Full scan (default)

Runs every workflow phase (Section 6) end-to-end on a single feature. Creates or updates `docs/qa/<feature-slug>-bugs.md`.

### 5.2 Verify

Re-checks only currently `open` entries in the existing bug file. Phases 4–7 only, scoped per entry. Marks resolved entries as `fixed` with a verification timestamp; leaves still-broken entries `open`. Reports the delta in the chat summary.

Use after the AI model has applied fixes. Fast iteration.

### 5.3 Integration

Runs after a feature's bug list is empty/clean. User passes `--related` URLs of sibling features the current one wires into. The skill checks cross-feature contracts: shared state propagates, side effects land in the related views, navigation handoffs preserve context.

Output appends to the existing per-feature bug files. Filing rule: an integration entry lives in the feature whose code must change to fix it. If both features must change, file two entries (one per feature, separate ids) and link them via `caused_by`. The `where` field always names both features so the cross-feature relationship is visible at a glance. No separate integration file.

## 6. Workflow phases

Each phase writes/updates entries; nothing is skipped silently.

1. **Inspect prototype** — Chrome MCP open the prototype URL. Detect native render width; resize to extra viewports only if user passed `--viewports` or the project documents breakpoints. For each region capture in memory: text, layout, screenshots, dynamic-looking values, every state variant the prototype exposes (loading, empty, error, hover, selected, disabled), every interaction. Screenshots are persisted to `docs/qa/screens/<feature>/<bug-id>-prototype.png` only when an entry created later in the run references the visual evidence — never speculatively.
2. **Inspect implementation** — second tab, implementation URL, same viewports. Same per-region capture. Save matching impl screenshots.
3. **Visual diff (first-class)** — for each region compare prototype vs implementation. Any divergence in layout, spacing, color, typography, copy, icon, density, or overflow is a `[UI]` or `[UX]` entry. Catastrophic visual divergence (one subtitle vs. an entire transcript dump) gets `BLOCKER` severity.
4. **Code-trace** — for each visible value in the implementation: find it in the rendered component tree; trace to source (hook, store selector, prop chain, fetch, helper). A hardcoded literal where the prototype showed dynamic data is a `[FUNCTIONAL]` entry. Record `file:line`.
5. **Runtime probe** — for traced-real values, mutate the underlying source (touch `project.json`, write a media file, toggle a setting, restart a watcher) and verify the UI updates. Stale rendering is a `[FUNCTIONAL]` entry.
6. **Interaction probe** — exercise every interaction the prototype shows (click, hover, keyboard, drag, watcher-driven update). Compare against implementation behavior.
7. **State coverage** — empty, loading, and error variants. Each must render. Missing variants are `[UX]` entries.
8. **Linked-entries pass** — for every `[UI]`/`[UX]` symptom, ask whether a `[FUNCTIONAL]` cause is identifiable in code or runtime. If yes and an entry already exists, set `caused_by` to that entry's id. **If yes and no entry exists, create the `[FUNCTIONAL]` entry first and link the symptom to it.** Never leave `caused_by` pointing at a non-existent id; never speculate (no link if the cause can't be located).
9. **Reconcile bug list** — open existing `docs/qa/<feature-slug>-bugs.md` if present. Mark entries that no longer reproduce as `fixed` with verification timestamp. Add new entries with fresh stable ids; do not renumber.
10. **Surface ambiguities & summarize** — append/update the "Open Questions" section with assumptions made when classification was ambiguous (Section 8 calls this `assumption`). Print to chat: counts (open/fixed by category × severity), the visual-divergence digest, the top three bugs to fix first, and any open questions that block further verification.

## 7. Real-data detection rubric

For each visible dynamic-looking value in the implementation:

1. Locate the value in the rendered DOM and map it to its component.
2. Trace upward: hook call → store selector → prop chain → fetch / helper / file probe / hardcoded literal.
3. Classify:
   - **wired** — chain ends at a fetch, store hydrated from disk/API, or system probe.
   - **derived** — computed from a wired value via a project helper.
   - **hardcoded literal** — chain ends at a string/number/array constant in source. → `[FUNCTIONAL]` entry.
   - **fallback masquerade** — the chain looks wired but renders a default that visually matches the prototype (e.g., `value ?? "Tokyo Essay"`). → `[FUNCTIONAL]` entry; record both the wired path and the offending fallback.
4. Confirm with a runtime probe (Phase 5). A wired value that doesn't react to source mutation is treated as hardcoded for bug-list purposes.

## 8. Bug entry schema

Required fields:

- `id` — `B####` (stable, never renumbered)
- `category` — `FUNCTIONAL` | `UX` | `UI`
- `severity` — `BLOCKER` | `MAJOR` | `MINOR`
- `status` — `open` | `fixed` | `wontfix`
- `title` — one line
- `where` — prototype region + implementation `file:line` (when known)
- `expected` — what the prototype shows or does
- `actual` — what the implementation shows or does
- `evidence` — code snippet, runtime probe result, or screenshot pair reference
- `repro` — steps (required for interaction/runtime entries)
- `found` — ISO date of first appearance
- `verified` — ISO date set when status flips to `fixed`

Optional fields:

- `caused_by` — id of the root-cause entry (per Section 6.8 rules)
- `assumption` — one-liner recording what was assumed when classification was ambiguous

## 9. Output template

File path: `docs/qa/<feature-slug>-bugs.md`. Created on first scan; updated thereafter.

```markdown
# QA: <Feature> — Bugs

- Prototype: <URL>
- Implementation: <URL>
- Last scan: <ISO timestamp> (mode: full | verify | integration)
- Counts: open N (BLOCKER a / MAJOR b / MINOR c) · fixed M · wontfix K

## Open

### B0007 [FUNCTIONAL][BLOCKER] Alignment produces no per-sentence cues
- where: prototype region "Subtitles track" / impl `apps/server/server/pipeline/transcribe.py`
- expected: WhisperX forced alignment yields one cue per sentence; subtitle layer renders one line at a time.
- actual: subtitle layer renders the entire transcript as one block; SUBTITL… timeline track is empty.
- evidence: `.vc/alignment.json` for test01 contains a single cue spanning full duration; pipeline log shows reference-text path skipped.
- repro: open Editor for test01; observe overlay text and timeline track.
- found: 2026-05-09

### B0008 [UI][BLOCKER] Subtitle overlay overflows player area
- caused_by: B0007
- where: prototype region "Player overlay" / impl `apps/web/components/Editor/Player.tsx`
- expected: single subtitle line, centered at lower third of the player.
- actual: ~12 lines of CJK text fill the player vertically.
- evidence: screenshot pair `docs/qa/screens/editor/B0008-{prototype,impl}.png`.
- found: 2026-05-09

## Fixed

### B0001 [UI][MINOR] Header padding 16px instead of 24px
- verified: 2026-05-10 (verify mode)

## Open Questions
- B0011: Prototype footer shows `v0.1.0-prototype`; impl shows the same. Is this meant to read from `package.json` or stay literal? Assumed literal pending confirmation.

## Visual divergence digest (last scan)
- Player overlay (BLOCKER): subtitle block vs single line — see B0008
- Inspector panel (MINOR): "PIP" label color drift — see B0014
- Status bar (MINOR): missing `cuda` / `ffmpeg` chips on prototype but present in impl — see B0015
```

## 10. File layout produced by the skill

```
docs/qa/
├── <feature-slug>-bugs.md          # one per feature
└── screens/
    └── <feature>/
        ├── B####-prototype.png
        └── B####-impl.png
```

The skill creates `docs/qa/` and the per-feature subfolder under `screens/` on first invocation. Screenshot files are referenced by entries that need visual evidence; the skill does not save screenshots that no entry references.

## 11. Anti-patterns and pitfalls

- **Trusting visual fidelity alone.** Two screens that look the same can have different data sources. Always run the code-trace + runtime probe.
- **Skipping the visual diff because the implementation "is close".** Small drift compounds. Record it as `MINOR` `[UI]` entries; the user decides what to fix.
- **Filing a `[UI]` entry without checking for a functional cause.** The Section 6.8 pass is mandatory; if a cause exists and no entry covers it, create one.
- **Speculating a `caused_by` link.** Only link when the cause is observable in code or runtime. If the cause is unknown, leave `caused_by` empty and add an open question.
- **Renumbering ids on a re-run.** Ids are stable across runs; status fields move, ids do not.
- **Inventing requirements not shown by the prototype.** The prototype is the visual/interaction contract. If something is unclear, record an open question — never invent a "should".

## 12. End-of-run report

After every run the skill prints to chat:

- Mode and target URLs.
- Counts (`open` / `fixed` / `wontfix`) broken down by category × severity.
- Visual divergence digest (region + bug id, BLOCKER first).
- Top three bugs to fix first (selection rule: highest-severity, then earliest-id within ties).
- Open questions that block further verification.
- Path to the bug file and any new screenshots.
