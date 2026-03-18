---
name: ralph-kage-bunshin-loop
description: Use when running as a ralph-kage-bunshin worker — claims tasks, follows TDD, calls Debugger on failures, inline verify + architect review before converging
---

# /ralph-kage-bunshin-loop — Ralph Loop Skill

You are a Ralph harness worker. When this skill runs, loop until CONVERGED or PATHOLOGY is detected.

> **External skills used by this loop** (install separately if needed):
> - `/playwright-test-generator` — generate E2E tests for browser UI tasks
> - `/e2e-reviewer` — review Playwright test quality
> - `/playwright-debugger` — diagnose E2E test failures
> - `/transition-reverse-engineering` — capture animation/transition timing from reference sites
> - `/ui-reverse-engineering` — capture layout/interaction behavior from reference sites
>
> If any of these are not installed, skip the relevant step and note it in PROGRESS.md.

## On Start

**Claim your task (follow this order exactly):**

**Your worker ID** = the value of the `RALPH_WORKER_ID` environment variable. Read it with `echo $RALPH_WORKER_ID`. Keep this ID for the entire session — every task you claim uses this same ID. **Throughout this skill, replace every occurrence of `N` in paths like `worker-N/` and branch names like `feat/worker-N-<slug>` with your actual worker ID number.**

**Project directory** = `$RALPH_PROJECT_DIR` (the root of the project, where `.ralph/` lives). This is always the main repo root, even when working in a worktree.

1. Read `.ralph/tasks.json`
2. Find ALL **claimable** pending tasks — a task is claimable if:
   - Its `status` is `'pending'`, AND
   - It has no `depends_on`, OR all task IDs in `depends_on` have `status: 'converged'`
3. Pick the claimable task with the **lowest ID number**
4. **Immediately** write to `.ralph/tasks.json`: set the task's `status` to `'in-progress'`, `claimed_at` to now (ISO), `lease_expires_at` to now + 5 minutes, and `worker` to your worker ID. Save tasks.json.
5. **MANDATORY CLAIM VERIFICATION — do not skip this step:**
   - Wait 1 second (let other workers write if they're racing)
   - Re-read `.ralph/tasks.json` from disk
   - Check: does the task's `worker` field equal YOUR worker ID? Compare as numbers (`Number(task.worker) === Number(YOUR_WORKER_ID)`)
   - **If YES**: claim is yours — proceed to step 6
   - **If NO**: another worker won the race — **STOP immediately. Do not write any files, do not implement, do not run commands related to this task.** Discard any work already done. Go back to step 2 and pick a different pending task. If no other tasks are available, follow step 7.
6. **If the claimed task has `"isolated": true`** — create a git worktree:
   ```bash
   git worktree add -b feat/worker-N-<task-slug> $RALPH_PROJECT_DIR/.ralph/workers/worker-N/worktree
   ```
   - `<task-slug>` = task name lowercased, spaces→hyphens, max 40 chars
   - **All coding work for this task happens inside the worktree directory**
   - `cd` into the worktree before starting the main loop
   - The `.ralph/` directory (state, tasks, mailbox) always lives in `$RALPH_PROJECT_DIR` — read/write it from there, not from the worktree
   - If git is not available, skip worktree and work in `$RALPH_PROJECT_DIR` as normal
7. If no claimable pending tasks exist:
   - If some tasks are `'pending'` but blocked (dependencies not yet converged) → **wait**: sleep 30 seconds, then go back to step 1
   - If all tasks are `'in-progress'` → all remaining work is handled by other workers. Run `ralph recover` (in case any are stuck), then exit.
   - If all tasks are `'converged'` → the project is done. Exit.

Then read in this order:
- `.ralph/mailbox/` — process messages addressed to you (`to: workerId` or `to: "all"`). For each message: read it, then immediately rename it by appending `.read` to the filename (e.g. `msg.json` → `msg.json.read`). This prevents re-processing on the next loop iteration.
- `CLAUDE.md` — **how to work** (coding rules, TDD, commit gates)
- `.ralph/SPEC.md` — **what to build** (architecture, tech stack, done criteria, E2E scenarios). **This overrides CLAUDE.md defaults for tech stack choices.**
- `.ralph/workers/worker-N/PROGRESS.md` (resume if exists, start fresh if not)
- `.ralph/workers/worker-N/state.json` (current state — use to initialize your generation counter)

**state.json initial structure** (create if missing):
```json
{
  "worker_id": N,
  "task": "task name",
  "generation": 0,
  "consecutive_failures": 0,
  "last_results": [],
  "pathology": { "stagnation": false, "oscillation": false, "wonder_loop": false },
  "dod_checklist": { "npm_test": false, "npm_build": false, "tasks_complete": false },
  "converged": false,
  "started_at": "<ISO timestamp>",
  "updated_at": "<ISO timestamp>"
}
```

## Main Loop

Repeat the following until CONVERGED or PATHOLOGY detected:

### 1. Implement the next step
- Record what you're implementing in PROGRESS.md
- **If the task involves reverse-engineering visual behavior** (animations, transitions, UI cloning — check task `description` for `/transition-reverse-engineering` or `/ui-reverse-engineering`):
  1. Run `/transition-reverse-engineering` (for animation/transition timing) or `/ui-reverse-engineering` (for layout/interaction behavior) to capture reference recording/frames from the original site — dismiss any modals before recording
  2. Capture the same recording/frames from our implementation
  3. Compare side-by-side and adjust timing/easing using measured values only — no guessing
  4. Repeat until 100% match before proceeding
  5. **"Already implemented" is not grounds for skipping this step** — visual comparison is mandatory every time
- **If the task involves any browser UI** (pages, forms, interactions, routing):
  1. Write E2E spec first using `/playwright-test-generator` — describe the user scenario before touching implementation code
  2. Run the E2E test to confirm it fails (red)
  3. Then proceed with unit tests + implementation below
  4. Use `/e2e-reviewer` to review E2E test quality before marking DoD complete
  5. On E2E failure after implementation: use `/playwright-debugger` to diagnose root cause before retrying
- Follow TDD:
  1. Write the scenario (what are you building)
  2. Write the test first (confirm it fails — red)
  3. Write minimum implementation to pass the test (green)
  4. Capture actual test output (no assumptions)

### 2. Renew lease
Read `.ralph/tasks.json`, update `lease_expires_at` for your task, write it back. Do this **before** running tests, and again after tests complete.

```js
lease_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
// e.g. "2026-03-19T01:23:45.678Z"
```

Do not hand-type a timestamp — always calculate from `Date.now()`.

### 3. Run tests and capture output
```bash
npm test 2>&1 | tail -20
```
- Read the actual output — never assume "it probably passed"
- On failure: analyze error → fix → rerun

### 4. Update state.json
Read the current state.json first, then write back with:
- `generation`: current value + 1
- `last_results`: append 'pass' or 'fail', keep only the last 5 entries
- `consecutive_failures`: reset to 0 on pass, increment by 1 on fail
- `dod_checklist.npm_test`: set to true when npm test passes
- `dod_checklist.npm_build`: set to true when npm run build passes
- `dod_checklist.tasks_complete`: set to true when your assigned task is done
- `updated_at`: current ISO timestamp

### 5. Detect pathology patterns

| Pattern | Condition | Response |
|---------|-----------|----------|
| Stagnation | `consecutive_failures >= 3` | Call `/ralph-kage-bunshin-debug` with your worker ID, project dir, task name, and the last error output. Apply the proposed fix. If confidence was low or the fix also fails after 3 more attempts, break the task into smaller pieces. |
| Oscillation | The last 4 entries of `last_results` are `['fail','pass','fail','pass']` — check with `last_results.slice(-4).join()` === `'fail,pass,fail,pass'` | Lock the decision in CLAUDE.md |
| WonderLoop | Same question/approach attempted 3+ times in this session | Choose a different approach |

**On pathology detected — do these steps in order, then exit:**
1. Update `pathology` field in state.json (e.g. `{ "stagnation": true }`)
2. Update your task's `status` to `'pathology'` in tasks.json
3. Write to PROGRESS.md (see step 5 format, use `result: PATHOLOGY — stagnation`)
4. Exit the loop

### 6. Update PROGRESS.md
Write to `.ralph/workers/worker-N/PROGRESS.md`:
```
## Generation N
- task: [what you did]
- result: pass / fail / PATHOLOGY — [type]
- next: [what to do next, or "CONVERGED" if done, or "EXITING — pathology" if stopping]
- learnings: [one sentence — what you discovered that the next worker should know, or "none"]
```

### 7. DoD check
Run these and check actual output:

```bash
npm test              # all Vitest tests pass
npm run build         # no build errors
```

For E2E: check `package.json` `scripts` for a Playwright-specific script — look for keys containing `e2e`, `playwright`, or similar (e.g. `test:e2e`, `e2e`, `playwright`). These are distinct from `npm test` which runs Vitest unit tests. Run the Playwright script if present; skip only if none exists.

**For UI tasks — before calling architect:**
- Run `/e2e-reviewer` on your Playwright test files and fix any issues flagged
- E2E tests must cover all scenarios assigned to this task in `.ralph/SPEC.md`

Also verify that all acceptance criteria in the task's `description` field (from `.ralph/tasks.json`) are implemented.

**When all 3 conditions are true:**

1. **Verification (inline — do NOT call a separate skill):**
   Run fresh:
   ```bash
   npm test 2>&1 | tail -30
   npm run build 2>&1 | tail -20
   ```
   For each acceptance criterion in `.ralph/tasks.json` for your task:
   - Mark as VERIFIED (test exists and passes), PARTIAL, or MISSING
   For E2E scenarios assigned to this task in `.ralph/SPEC.md`:
   - Mark as COVERED or MISSING

   **Verdict:**
   - All VERIFIED + all E2E COVERED + tests + build green → **proceed immediately to step 2**
   - FAIL or INCOMPLETE → fix the gaps, re-run DoD, then repeat step 1

2. **Architect review (inline — do NOT call a separate skill):**
   Read: `.ralph/SPEC.md`, `CLAUDE.md`, source + test files for the task, `.ralph/workers/worker-N/state.json`, `.ralph/workers/worker-N/PROGRESS.md`

   Check:
   - All spec requirements met? No done criteria missing?
   - Tests test behavior (not implementation details)?
   - No scope creep (nothing built outside the spec)?
   - No unresolved `debug_session` with `confidence: low` in state.json?
   - Steelman: "What's the strongest reason to reject?" — if you find one, reject. If none, approve.

   **If APPROVED:**
   - Write `.ralph/workers/worker-N/state.json` — set `converged: true`, set `dod_checklist` all to `true`, add `architect_review: { status: "approved", reviewed_at: "<ISO>", notes: "<brief reason>" }` (preserve all other fields)
   - Write `.ralph/tasks.json` — set this task's `status` to `"converged"`
   - Continue to step 3

   **If REJECTED:**
   - Write `.ralph/workers/worker-N/state.json` — add `architect_review: { status: "rejected", reviewed_at: "<ISO>", notes: "<specific gaps>" }` (preserve all other fields)
   - Fix each gap listed, re-run DoD, then repeat step 1
3. **If the task had `"isolated": true`** — merge or PR the worktree branch:
   - If the project has a remote (`git remote -v` returns output): create a PR
     ```bash
     git -C $RALPH_PROJECT_DIR/.ralph/workers/worker-N/worktree push -u origin feat/worker-N-<slug>
     gh pr create --title "[task name]" --body "Completed by ralph worker-N"
     ```
   - If no remote: merge directly into the base branch
     ```bash
     git -C $RALPH_PROJECT_DIR merge feat/worker-N-<slug>
     ```
   - Then remove the worktree:
     ```bash
     git worktree remove --force $RALPH_PROJECT_DIR/.ralph/workers/worker-N/worktree
     git branch -D feat/worker-N-<slug>
     ```
4. Write a mailbox message file to `.ralph/mailbox/<timestamp>-worker-N.json`:
   ```json
   { "from": N, "to": "all", "type": "task_complete", "subject": "task N complete: [name]", "body": "brief summary of what was built", "timestamp": "<ISO>" }
   ```
5. Write final PROGRESS.md entry with `result: pass` and `next: CONVERGED`
6. Print:

```
CONVERGED
worker-N complete: [task name]
generation: N
```

**Do NOT exit yet. Go back to "On Start" and claim the next pending task.**
- If there are more claimable `pending` tasks → claim one and start the loop again
- If no claimable pending tasks remain → all work is done or in-progress by others → Exit

## Absolute Rules

- On external service failure: immediately mock it and keep going (never stop)
- Never disable or delete tests to make them pass
- Never implement beyond what the task description defines as scope
- When stuck: break into smaller pieces → retry
- After 3 failed attempts with same approach: choose a different method
