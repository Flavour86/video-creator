# Design: `prototype-update-pipeline` + `bug-inspection` skills

- Date: 2026-06-01
- Status: Draft for review
- Type: Two project-level skills — a resumable orchestrator and a QA sweep
- Motivating input: `docs/prototype/v1.1/records.md` + `01-04.png`

## 1. Problem

Each time a prototype change order lands as `docs/prototype/<ver>/records.md` (numbered
change items, each annotated by a screenshot), the same long pipeline must run by hand:
update the prototype, write a full implementation spec, break it into tasks, build each
task, verify it **in a real browser** (not just unit tests), capture screenshot evidence,
produce a step-by-step test plan, then **QA-sweep the result across resolutions** and file
bugs. Doing this ad hoc is slow and inconsistent, and a long multi-gate run overflows the
session and loses detail. We want repeatable skills that drive it end-to-end with approval
gates and that are **resumable from disk** across many sessions.

## 2. Goals / Non-goals

**Goals**
- `prototype-update-pipeline`: turn a `records.md` change order into a shipped,
  browser-verified feature set; resumable; context-bounded (per-task subagents, `/clear`
  between gates).
- `bug-inspection`: test a version's features against its `test-plan.md` **in a real
  browser at three resolutions**, file a dated bug report with screenshot evidence.
- Reuse existing skills (`as-spec`, `as-plan`, `as-build`, `subagent-driven-development`,
  `frontend-ui-engineering`, `browser-testing-with-devtools`, `playwright-best-practices`).

**Non-goals**
- Not auto-merging. The pipeline stops before merge.
- Not resolving feature-level open questions itself (e.g. item 5) — it surfaces them.

## 3. Locked decisions

| Decision | Choice | Consequence |
| --- | --- | --- |
| Autonomy | Gated at phase boundaries | Approve after prototype update, spec, plan; Phase 4 auto-runs tasks; pause before merge |
| Prototype | Edit `docs/prototype/v1` in place | Single evolving prototype = source of truth; references snapshotted at update time |
| Packaging | One resumable orchestrator skill | One gate-bounded segment per invocation; resumes from `tasks/<ver>/state.json` + `todo.md` |
| Resumption | On-disk state is the source of truth | `todo.md` checkboxes (authoritative for tasks) + `state.json` (phase/gates/cursor); read first; `/clear`-safe |
| Context budget | Per-task subagents + fresh session per gate | Heavy work stays in the subagent; short reports return, get persisted, then dropped |
| Canonical references | `docs/designs/tasks/<ver>/visuals/` | **Per-version** (not the legacy `docs/designs/visuals/`); new visual specs point here |
| Bug sweep | Separate `bug-inspection` skill, invoked at Wrap | Also runnable standalone; 3-resolution, browser-mandatory, style-parity SSIM ≥ 0.9 |
| Skill location | Source in `.agents/skills/`, symlinked into `.claude/skills/` | Repo convention; symlinks need Dev Mode or an elevated shell to create |
| Item 5 (mixed bg timing) | Defer to spec phase | Surfaced as an Open Question at GATE 2 |

**Three screenshot sets, three homes:**
- **Canonical references** — from the *updated prototype*; SSIM target; in
  `docs/designs/tasks/<ver>/visuals/`.
- **Build evidences** — from the *running app* during task verification; in
  `docs/designs/tasks/<ver>/evidences/<task-id>/`.
- **Bug-sweep evidence** — from the *running app* during QA; in
  `docs/designs/bugs/<ver>/evidence/` (singular, per your spec).

---

# Skill A — `prototype-update-pipeline`

## 4. Identity

- **Name (working):** `prototype-update-pipeline`.
- **Location:** source in `.agents/skills/prototype-update-pipeline/`, symlinked into
  `.claude/skills/prototype-update-pipeline/` (the repo's skill convention).
- **Nature:** a resumable, state-driven orchestrator. Each invocation reads on-disk state,
  advances to the **next gate only**, then stops. Run across multiple sessions; `/clear`
  between gates to bound context.
- **Triggers when:** the user provides / points at a new `docs/prototype/<ver>/records.md`,
  or asks to "run / continue the prototype update pipeline for v1.x."

## 5. Inputs & detection

1. Resolve `<ver>` (arg, or the folder of the target `records.md`, e.g. `v1.1`).
2. Parse `records.md`: ordered change items + the screenshot each references; read the PNGs.
3. Ensure `docs/designs/tasks/<ver>/` exists (idempotent).
4. Create / switch to the version branch (see Section 11).

## 6. Phase graph + gates

```
Phase 0  Intake     detect records.md, parse items+PNGs, derive <ver>,
                     create tasks/<ver>/ + state.json, create/switch version branch
Phase 1  Prototype   apply each change item to docs/prototype/v1 (in place); run prototype,
                     snapshot changed screens (16:9 and, if render output changes, 9:16) →
                     tasks/<ver>/visuals/ canonical references                       ─ GATE 1
Phase 2  Spec        as-spec → tasks/<ver>/spec.md (objective, per-item interactions,
                     component states, FE/BE behavior, acceptance, parity map,
                     Open Questions incl. item 5)                                     ─ GATE 2
Phase 3  Plan        as-plan → tasks/<ver>/{plan.md, todo.md}: small ordered tasks,
                     each with Acceptance + Verify cmds + required Evidence            ─ GATE 3
Phase 4  Execute     subagent-driven-development: ONE clean subagent per task →
                     as-build (TDD) [+ frontend-ui-engineering] → browser-verify
                     (Chrome DevTools MCP / Playwright) → evidences/<task>/*.png → commit;
                     persist result, tick todo.md, advance cursor (resumable per task)
Phase 5  Test plan   generate tasks/<ver>/test-plan.md (step-by-step for AI/human)
Phase 6  Wrap        full gates (rtk pnpm test/lint/build, web+server, build-time parity);
                     INVOKE bug-inspection (Skill B); feed any bugs back as fix tasks
                     (return to Phase 4) until the sweep is clean                      ─ GATE 4
```

The skill performs **exactly one gate-bounded segment per invocation**, then stops for
approval. After approval the user may `/clear` and re-invoke; it resumes from state.

## 7. State & resumption

Memory lives on disk, not in the conversation. **Every invocation begins by reading state
and reporting position** ("Phase 4, task 7/12; gates prototype+spec+plan approved"), then
continues.

`docs/designs/tasks/<ver>/state.json`:

```json
{
  "version": "v1.1",
  "branch": "feature/v1.1-prototype-update",
  "phase": "execute",
  "gates_approved": ["prototype", "spec", "plan"],
  "current_task": "task-07",
  "references_captured": true,
  "updated_at": "2026-06-01T12:00:00Z"
}
```

- **Precedence:** `todo.md` checkboxes are authoritative for task completion; `state.json`
  records phase + gate approvals + cursor. On conflict, **reconcile by re-deriving from
  artifacts** (which files exist, which boxes are ticked, which refs/evidences present).
- **Crash/compaction safety:** completion is written to disk immediately (checkbox + evidence
  + per-task commit). A lost session resumes at the last completed task.
- **Context discipline:** one segment per session; `/clear` between gates; state makes it
  loss-free.

## 8. Artifacts & file layout

```
docs/designs/tasks/<ver>/
  state.json         # phase, gates approved, task cursor (Section 7)
  spec.md            # as-spec output (Phase 2)
  plan.md            # as-plan narrative plan (Phase 3)
  todo.md            # ordered tasks: Acceptance + Verify + Evidence; checkboxes = progress
  test-plan.md       # step-by-step test script (Phase 5)
  visuals/
    <surface>-<theme>[-<aspect>].png   # canonical references from updated prototype (Phase 1)
  evidences/
    <task-id>/
      <screen-or-state>.png            # app proof captured during Phase 4
      evidence.md                      # 1 line per shot: what it proves
docs/designs/bugs/<ver>/               # produced by Skill B
  bug-<YYYY-MM-DD>.md
  evidence/
    <feature>-<resolution>.png
```

`todo.md` mirrors the existing repo style (Phases → Tasks → Checkpoints; each task with
`Acceptance:` + `Verify:` using the `rtk pnpm …` convention), plus an `Evidence:` line
naming the screens/states the subagent must capture.

## 9. Execution model (Phase 4)

- The orchestrator walks `todo.md` in dependency order and dispatches **one subagent per
  task** with clean context (default sequential).
- Each subagent prompt carries: task id/title, relevant `spec.md` sections, Acceptance,
  Verify commands, required Evidence, and the mandate: run `as-build` (RED→GREEN→commit),
  use `frontend-ui-engineering` for UI, then verify **in a real browser** and save evidence
  before claiming done.
- Subagent returns: `{ task_id, files_changed, verify_results, evidence_paths,
  parity_result?, commit_sha, status: done|blocked, notes }`.
- On `done`: validate against Acceptance, tick `todo.md`, write `evidences/<task>/evidence.md`,
  update `state.json.current_task`, **then drop the report from working memory**. The main
  thread holds at most one task's report.
- On `blocked`: pause and surface to the user.
- Commits: per-task via `as-build`; **no co-author / attribution lines** (global rule).

## 10. Verification & build-time visual parity

- **Functional:** the `Verify:` commands in `todo.md`.
- **Browser (mandatory):** interactive check via Chrome DevTools MCP; exercise each changed
  functional point; capture evidence. A task is **not done** on unit tests alone.
- **Build-time parity:** a Playwright visual spec compares the implemented surface against
  `tasks/<ver>/visuals/` references via SSIM ≥ **0.98** (project's strict standard) — comparing
  **style, not content**, driven by deterministic fixtures (or masked dynamic regions) so
  dynamic data doesn't cause false misses; the screenshot-inventory test keeps one parity owner
  per reference.

## 11. Git branching model for iterations

```
master ──●───────────────●───────────────────●──────────────►
          \             / \                  /
 chore/pup-skill ●──●──/   \                /     (the two skills + this doc → merge FIRST)
                            \              /
        feature/v1.1 ●─●─●─●─●─●─●─●──────/        (v1.1: prototype edits, tasks/v1.1/*,
                       per-task commits             evidences, visuals, test-plan, bugfixes)
        feature/v1.2  (cut from master AFTER v1.1 merged) ─●─●─● ...
```

Rules:
1. **Infrastructure first.** The two skills + this design doc land on `chore/prototype-update-pipeline-skill`, cut from `master`, and merge to `master` before any iteration runs — so every version uses the merged skill.
2. **One branch per version:** `feature/<ver>-prototype-update`, cut from `master`. All Phase 1–6 output (prototype edits, `tasks/<ver>/*`, `bugs/<ver>/*`, per-task commits) lands there.
3. **`state.json.branch`** records it; Phase 0 creates the branch if absent, switches to it when resuming.
4. **Merge at GATE 4** (after Wrap + a clean bug sweep) via `finishing-a-development-branch` (PR or merge); never auto-merge.
5. **Sequential iterations:** start `v1.<n+1>` from `master` only after `v1.<n>` merges → linear history, no stacked unmerged branches. (Parallel iterations would branch from the prior version branch; recommended against.)
6. **Bug-fix loop:** bugs from the sweep become fix tasks on the *same* version branch (re-enter Phase 4), re-sweep, then merge.

**One-time bootstrap (current tree):** branch `task/editor-07-background-modal` holds
unrelated, uncommitted editor work plus the untracked `docs/prototype/v1.1/` and
`docs/superpowers/`. Resolving this cleanly is a user decision (asked separately) — the model
above governs every iteration once bootstrapped.

---

# Skill B — `bug-inspection`

## 12. Identity & behavior

- **Name (working):** `bug-inspection`.
- **Location:** source in `.agents/skills/bug-inspection/`, symlinked into
  `.claude/skills/bug-inspection/` (the repo's skill convention).
- **Purpose:** QA a version's features against `tasks/<ver>/test-plan.md` in a real browser
  and produce a dated bug report.
- **Triggers when:** invoked by the pipeline at Phase 6, or the user asks to "bug-sweep /
  inspect / QA v1.x against the test plan."

**Mandatory rules (any miss = FAIL):**
- Test every test-plan item at **all three resolutions: 1920×1080, 1280×720, 1080×1920.**
- Use **Chrome DevTools MCP or Playwright** to exercise features **in the browser**. Running
  the unit/test suite alone is **not** acceptable.
- Capture a browser **screenshot per feature per resolution** into
  `docs/designs/bugs/<ver>/evidence/`. A missing screenshot for any related feature = FAIL.
- **Visual parity = style, not content.** Match layout, color, typography, and the changed
  controls/states against the aspect-matching `tasks/<ver>/visuals/` reference; dynamic data
  (transcript text, waveforms, thumbnails, preview frame, names, timecodes) may differ. SSIM ≥
  0.9 applies to the static/masked regions. 16:9 references cover 1920×1080 and 1280×720; 9:16
  covers 1080×1920. Where no matching-aspect reference exists, that resolution is validated by
  behavioral checks + screenshot presence (SSIM skipped, noted in the report).

**Bug report** `docs/designs/bugs/<ver>/bug-<YYYY-MM-DD>.md`:

```
# Bug Report — <ver> — <date>
Tested against: tasks/<ver>/test-plan.md
Resolutions: 1920x1080 | 1280x720 | 1080x1920
Summary: <passed>/<total> features clean

## <feature / test-plan item N>
- 1920x1080 : PASS  SSIM 0.97  evidence/<feature>-1920x1080.png
- 1280x720  : FAIL  expected <x>, actual <y>  evidence/<feature>-1280x720.png
- 1080x1920 : FAIL  missing screenshot
Severity: blocker | major | minor
Repro: <steps from test-plan>
```

- **Sweep verdict:** clean only if every feature passes all three resolutions
  (browser-tested, screenshot present, **style matches** — SSIM ≥ 0.9 on static/masked regions
  where applicable — and behavior matches expected). A dynamic-data-only difference is not a
  failure. Otherwise the report lists failures and the pipeline routes them back to a Phase-4
  fix loop before merge.

## 13. Bundled skill files (what skill-creator generates)

```
.claude/skills/prototype-update-pipeline/
  SKILL.md
  references/
    state-and-resumption.md     spec-template.md         plan-conventions.md
    folder-layout.md            subagent-task-prompt.md  evidence-protocol.md
    test-plan-template.md

.claude/skills/bug-inspection/
  SKILL.md
  references/
    resolution-matrix.md        # the 3 resolutions + per-aspect reference mapping
    sweep-protocol.md           # browser-mandatory loop, evidence rules, SSIM ≥ 0.9, fail conditions
    bug-report-template.md      # bug-<date>.md structure
```

## 14. Item 5 handling mechanism

At Phase 2 the pipeline scans `records.md` for natural-language design questions
("help me brainstorm …", "how to …") and lists them as **Open Questions** in `spec.md`,
pausing at GATE 2 for the user's decision — like the existing `SPEC.md` open-questions log.
For item 5 it presents image-duration options for a mixed image+video playlist (fixed
default seconds per image; even split of the leftover range; explicit per-image duration
field; Ken-Burns over a default) and lets the user pick.

## 15. Open questions / risks

- **Reference capture fidelity:** the v1 prototype is JSX/HTML; clean per-surface, per-aspect
  snapshots may need a small harness or manual framing. Acceptable for v1.
- **9:16 references:** only the prototype surfaces that have a vertical mode yield 9:16
  references; otherwise 1080×1920 is behavioral + screenshot-only in the sweep.
- **Two SSIM thresholds:** build-time parity = 0.98 (strict, per existing project policy);
  bug-sweep = 0.9 (cross-resolution QA). Both compare **style, not content** — dynamic data
  (transcript text, waveforms, thumbnails, names, timecodes) may differ; SSIM applies to the
  static/masked regions. Intentional; documented in both skills.
- **Trigger precision:** descriptions must fire correctly without over-triggering;
  skill-creator will tune them.

## 16. Status / next step

Both skills are authored in `.agents/skills/{prototype-update-pipeline,bug-inspection}/`
(`SKILL.md` + `references/`). Remaining before the first run:
- Create the `.claude/skills/` symlinks to the source (needs Dev Mode or an elevated shell);
  real-dir copies are in place as a temporary bridge so the skills work meanwhile.
- User review of the skills, then commit on `chore/prototype-update-pipeline-skill` and merge to
  `master` per §11.

First real run targets `v1.1`.
