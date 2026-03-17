# /ralph-kage-bunshin-loop — Ralph Loop Skill

You are a Ralph harness worker. When this skill runs, loop until CONVERGED or PATHOLOGY is detected.

## On Start

**Claim your task (follow this order exactly):**

**Your worker ID** = the value of the `RALPH_WORKER_ID` environment variable. Read it with `echo $RALPH_WORKER_ID`. Keep this ID for the entire session — every task you claim uses this same ID.

**Project directory** = `$RALPH_PROJECT_DIR` (the root of the project, where `.ralph/` lives). This is always the main repo root, even when working in a worktree.

1. Read `.ralph/tasks.json`
2. Find ALL **claimable** pending tasks — a task is claimable if:
   - Its `status` is `'pending'`, AND
   - It has no `depends_on`, OR all task IDs in `depends_on` have `status: 'converged'`
3. Pick the claimable task with the **lowest ID number**
4. **Immediately** call `claimTask(projectDir, taskId, workerId)` — this sets `status: 'in-progress'`, `claimed_at`, `lease_expires_at` (+5 min), and `worker`. Save tasks.json.
5. **Re-read tasks.json and verify your claim won** — check that the task's `worker` field is still your worker ID. If another worker overwrote it, go back to step 2 and pick the next claimable pending task.
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
   - If all tasks are `'in-progress'` → all remaining work is handled by other workers. Exit.
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
Call `renewLease(projectDir, taskId, workerId)` — this extends `lease_expires_at` to now + 5 minutes. Do this **before** running tests, and again after tests complete.

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
npm run test:e2e      # Playwright E2E tests pass (skip if no E2E script in package.json)
```

**For UI tasks — before calling architect:**
- Run `/e2e-reviewer` on your Playwright test files and fix any issues flagged
- E2E tests must cover all scenarios assigned to this task in `.ralph/SPEC.md`

Also verify your assigned task's status is `'in-progress'` and all its work is complete.

**When all 3 conditions are true:**
1. Set `dod_checklist` all to `true` in state.json
2. Call `/ralph-kage-bunshin-verify` — pass it your worker ID, project directory, and task name
   - If verdict is **PASS**: continue to step 3
   - If verdict is **FAIL** or **INCOMPLETE**: fix the gaps listed, re-run DoD, then call Verifier again
3. Call `/ralph-kage-bunshin-architect` — pass it your worker ID, project directory, and task name
   - **Do NOT write `architect_review`, `converged`, or task status yourself** — the architect writes all of these atomically
   - After the architect responds, **read your own state.json** (`.ralph/workers/worker-N/state.json`) and verify `converged === true`
   - Do NOT act on another worker's architect verdict — only your own state.json matters
   - If `converged === true`: the architect has already updated both state.json and tasks.json — continue to step 4
   - If `converged` is still `false`: the architect rejected. Read `architect_review.notes`, fix each issue, re-run DoD checks, then call `/ralph-kage-bunshin-architect` again
4. **If the task had `"isolated": true`** — merge or PR the worktree branch:
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
5. Send a mailbox message via `sendMessage`: `{ from: N, to: "all", type: "task_complete", subject: "task N complete: [name]", body: "brief summary of what was built" }`
6. Write final PROGRESS.md entry with `result: pass` and `next: CONVERGED`
7. Print:

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
