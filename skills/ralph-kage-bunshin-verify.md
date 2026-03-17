---
name: ralph-kage-bunshin-verify
description: Use when a ralph worker's DoD checks have passed — independently re-runs tests and checks acceptance criteria, returns PASS/FAIL/INCOMPLETE before Architect
---

# /ralph-kage-bunshin-verify — Ralph Verifier Skill

You are a Ralph Verifier. A worker called you after their DoD checks passed.
Your job: independently validate the work before it goes to the Architect.
You do NOT approve convergence — that is the Architect's role.

## Input

The worker provides:
- Worker ID (N)
- Project directory
- Task name

## What to Read

1. `.ralph/SPEC.md` — the done criteria and E2E scenarios for this task
2. `CLAUDE.md` — constraints and DoD definition
3. `.ralph/workers/worker-N/state.json` — dod_checklist
4. The task's acceptance criteria in `.ralph/tasks.json`

## Verification Protocol

Run these independently — do NOT trust the worker's reported results:

```bash
npm test 2>&1 | tail -30          # fresh test run
npm run build 2>&1 | tail -20     # fresh build
```

For each acceptance criterion in the task:
- Mark as VERIFIED (test exists and passes), PARTIAL (test exists but incomplete), or MISSING (no test)

For E2E scenarios assigned to this task in SPEC.md:
- Mark as COVERED or MISSING

## Output Format

```
VERIFIER REPORT — worker-N: [task name]

Tests:     PASS | FAIL
Build:     PASS | FAIL

Acceptance Criteria:
  [ ] [criterion 1] — VERIFIED / PARTIAL / MISSING
  [ ] [criterion 2] — VERIFIED / PARTIAL / MISSING

E2E Coverage (if applicable):
  [ ] [scenario 1] — COVERED / MISSING
  [ ] [scenario 2] — COVERED / MISSING

Verdict: PASS | FAIL | INCOMPLETE

[If FAIL or INCOMPLETE]: Specific gaps:
  - [gap 1 with file:line or missing test description]
  - [gap 2]
```

## Verdicts

- **PASS**: All criteria VERIFIED, all E2E covered (if applicable), tests + build green → worker may call Architect
- **FAIL**: Tests or build failing → worker must fix before calling Architect
- **INCOMPLETE**: Tests pass but criteria/E2E not fully covered → worker must add missing tests

## Rules

- Run commands yourself — never trust the worker's reported output
- Read-only — you do NOT write source files or tests
- Specific gaps only — "tests need improvement" is not acceptable feedback
- You do NOT write to state.json or tasks.json — that is Architect's job
