---
name: ralph-kage-bunshin-loop
description: Use when running as a ralph-kage-bunshin worker — claims tasks, follows TDD, calls Debugger on failures, inline verify before converging
---

# /ralph-kage-bunshin-loop — Ralph Loop Skill

You are a Ralph harness worker. When this skill runs, loop until CONVERGED or PATHOLOGY is detected.

> **External skills used by this loop** (install separately if needed):
> - `/playwright-test-generator` — generate E2E tests for browser UI tasks
> - `/e2e-reviewer` — review Playwright test quality
> - `/playwright-debugger` — diagnose E2E test failures
> - `/transition-reverse-engineering` — capture animation/transition timing from reference sites
> - `/ui-reverse-engineering` — capture layout/interaction behavior from reference sites
> - `/api-integration-checklist` — verify CORS, auth, rate limits before writing API client code
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
4. **Immediately** write to `.ralph/tasks.json`: set the task's `status` to `'in-progress'`, `claimed_at` to now (ISO), `lease_expires_at` to now + 30 minutes, and `worker` to your worker ID. Save tasks.json.
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
   - **If git is not available OR the project is not a git repo** (no `.git` directory), skip worktree and work in `$RALPH_PROJECT_DIR` as normal. Do NOT fail — just log "worktree skipped: not a git repo" in PROGRESS.md and continue.
7. If no claimable pending tasks exist:
   - If some tasks are `'pending'` but blocked (dependencies not yet converged) → **wait**: sleep 30 seconds, then go back to step 1
   - If all tasks are `'in-progress'` → all remaining work is handled by other workers. Run `ralph recover` (in case any are stuck), then exit.
   - If all tasks are `'converged'` → the project is done. Exit.

**After claiming — verify the environment is actually ready:**
- If your task `depends_on` a setup task (e.g. id: 1), check that the expected project files actually exist (e.g. `package.json`, `src/`). A setup task marked `'converged'` may have been completed in a different worktree or the files may be missing for other reasons.
- If files are missing: do NOT assume the setup task is complete. Build or restore what's needed, and record this in your first PROGRESS.md entry.

Then read in this order:
- `.ralph/mailbox/` — process messages addressed to you (`to: workerId` or `to: "all"`). Skip files ending in `.read`. For each unread message: read it, then immediately rename it by appending `.read` to prevent re-processing. Message types:
  - `task_complete`: extract the `learnings` array — treat each entry as a hard constraint. If no `learnings` field, check sender's PROGRESS.md directly.
  - `broadcast`: a critical mid-task discovery (wrong API params, broken env, incorrect docs, etc.) — **stop current work immediately**, apply the correction, record it in PROGRESS.md under `learnings:`, then resume. Do not defer broadcasts.
- `CLAUDE.md` — **how to work** (coding rules, TDD, commit gates). Read the `## Code Correctness Rules` section before writing any code.
- `.ralph/SPEC.md` — **what to build** (architecture, tech stack, done criteria, E2E scenarios). **This overrides CLAUDE.md defaults for tech stack choices.**
- `.ralph/workers/worker-N/PROGRESS.md` — **read every `learnings:` line from previous generations before doing anything**. These are hard-won discoveries. Repeating a failed approach already recorded in `learnings` is not allowed.
- `.ralph/workers/worker-N/state.json` (current state — use to initialize your generation counter and `approach_history`)

**state.json initial structure** (create if missing):
```json
{
  "worker_id": N,
  "task": "task name",
  "generation": 0,
  "consecutive_failures": 0,
  "last_results": [],
  "pathology": { "stagnation": false, "oscillation": false, "wonder_loop": false, "external_service_block": false },
  "approach_history": [],
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
- **Before modifying code that calls an external library/hook** (animation libs, state managers, UI frameworks): **read the library's source implementation first** — understand what it does internally (cleanup behavior, side effects, DOM mutations, style resets). Do not assume behavior from the API name alone. Especially for animation libraries: understand the full lifecycle (init → animate → cleanup/revert) before adding styles or config that depend on intermediate states.
- **For visual/animation changes: verify in browser after EACH atomic change** — do not batch multiple visual modifications across files before checking. Apply to one element → open browser → confirm it works → then propagate. tsc/vitest passing does NOT mean the visual result is correct.
- **MANDATORY — check task `description` for `/ui-reverse-engineering` or `/transition-reverse-engineering` strings.** If either string appears in the description, you MUST invoke that skill BEFORE writing any implementation code. This is not optional — skipping it means the implementation will not match the reference site visually. Run the skill first to capture the reference, then implement based on the captured data. If both strings appear, run both skills. Record which skills you invoked in PROGRESS.md under `used_skills:`.
- **If the task involves calling any external API** (check task `description` for API endpoints, fetch calls, third-party services): run `/api-integration-checklist` — it contains the full procedure including endpoint verification, CORS/proxy decision, and type safety
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
- **If you discover an environment-level gotcha** at any point (a CLI tool that intercepts commands unexpectedly, a proxy config that requires restart, source files missing despite a "converged" setup task, etc.) — **immediately** append it to `CLAUDE.md` under a `## Environment Notes` section. Do not wait until converge. Other workers may hit the same issue before you finish.
- **If you discover any critical fact that other workers need before starting their work** (wrong API parameter, incorrect doc, broken assumption in SPEC.md, env issue not yet in CLAUDE.md, etc.) — **immediately** write a `broadcast` mailbox message. Do not wait for `task_complete`. Format:
  ```json
  {
    "type": "broadcast",
    "from": "worker-N",
    "to": "all",
    "subject": "[one-line summary]",
    "body": "[what you discovered and what the correct behavior is]",
    "sent_at": "<ISO timestamp>"
  }
  ```
  Save as `.ralph/mailbox/<timestamp>-worker-N-broadcast.json`. Other workers will pick it up at the start of their next generation.

### 2. Renew lease
Read `.ralph/tasks.json`, update `lease_expires_at` for your task, write it back. Do this **before** running tests, and again after tests complete.

```js
lease_expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString()
// e.g. "2026-03-19T01:23:45.678Z"
```

Do not hand-type a timestamp — always calculate from `Date.now()`.

### 3. Run tests and capture output
```bash
npm test 2>&1 | tail -20
```
- Read the actual output — never assume "it probably passed"
- On failure: **diagnose root cause first** — write one sentence naming the cause before writing any fix. If you cannot name it, add logging/instrumentation to find it.
- On failure with same approach twice in a row: the approach is wrong, not the implementation. Change direction.

### 3b. Runtime verification (UI tasks only)

For tasks involving browser UI, tsc + unit tests passing is **not sufficient**. After tests pass:

```bash
agent-browser open http://localhost:<port>
agent-browser screenshot tmp/verify/before.png
# trigger the interaction (click, navigate, hover)
# wait for the interaction to complete — check the actual animation/transition duration
# from CSS (@keyframes, transition property) or JS config, then use that value
agent-browser wait <measured_duration_ms>
agent-browser screenshot tmp/verify/during.png
agent-browser wait <measured_duration_ms>
agent-browser screenshot tmp/verify/after.png
```

**Do NOT use arbitrary sleep values** — measure from the implementation: for CSS animations use `animation-delay + animation-duration + 50ms`; for CSS transitions use `transition-delay + transition-duration + 50ms`; for JS timers use the timeout value `+ 50ms`. The +50ms accounts for browser repaint.

Read all three screenshots. Verify:
- [ ] No white flash / blank frame in `during.png`
- [ ] No layout jump between frames
- [ ] Content visible in `after.png` matches expected state

**If any check fails:** record the visual defect in PROGRESS.md, update state.json `last_results` with `'fail'` and increment `consecutive_failures`, renew the lease, then go back to step 1 to fix the root cause.

Also verify global entry points are correct:
```bash
# Check that CSS resets are actually loaded — adapt path to your framework's entry file
# React/Vite: src/main.tsx or src/index.tsx
# Next.js: src/pages/_app.tsx or src/app/layout.tsx
# Plain HTML: index.html (look for <link rel="stylesheet">)
grep -r "import.*\.css" src/main.tsx src/index.tsx src/pages/_app.tsx src/app/layout.tsx 2>/dev/null \
  || grep -r "stylesheet" index.html 2>/dev/null \
  || echo "MISSING: no CSS entry point import found — check your framework's entry file"
```

### 4. Update state.json
Read the current state.json first, then write back with:
- `generation`: current value + 1
- `last_results`: append `'pass'`, `'fail'`, or `'fail:external_service'` (use `'fail:external_service'` when the failure is caused by an external API/service error, not your own code). Keep only the last 5 entries.
- `consecutive_failures`: reset to 0 on pass, increment by 1 on fail
- `dod_checklist.npm_test`: set to true when npm test passes
- `dod_checklist.npm_build`: set to true when npm run build passes
- `dod_checklist.tasks_complete`: set to true when your assigned task is done
- `updated_at`: current ISO timestamp

### 5. Detect pathology patterns

| Pattern | Condition | Response |
|---------|-----------|----------|
| Stagnation | `consecutive_failures >= 3` | Call `/ralph-kage-bunshin-debug` with your worker ID, project dir, task name, and the last error output. Apply the proposed fix. If confidence was low or the fix also fails after 3 more attempts, break the task into smaller pieces. |
| Oscillation | The last 4 entries of `last_results` alternate fail/pass — check with `last_results.slice(-4).every((r,i) => (i%2===0 && r==='fail') \|\| (i%2===1 && r==='pass'))` | The implementation decision is unstable. Lock the correct approach in CLAUDE.md and do not revisit it. |
| WonderLoop | The same implementation goal (recorded in `approach_history`) has been attempted 3+ times without passing | Choose a fundamentally different strategy — not a variation of the same approach |
| ExternalServiceBlock | `last_results` has 3+ consecutive `'fail:external_service'` entries (check with `last_results.slice(-3).every(r => r === 'fail:external_service')`) | **Switch approach entirely**: (1) record current approach and error in `state.json` under `approach_history: [{ approach: "...", error: "...", tried_at: "<ISO>" }]`, (2) choose a fundamentally different strategy in this order: direct fetch → Vite proxy → server-side proxy → mock fallback, (3) re-run `/api-integration-checklist` with the new approach, (4) reset `consecutive_failures` to 0 and continue. If all strategies in the list have been tried, mark `external_service_block: true` in pathology. |

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
- used_skills: [list of slash commands actually invoked this generation, e.g. "/transition-reverse-engineering, /api-integration-checklist", or "none"]
- learnings: [one sentence — what you discovered that the next worker should know, or "none"]
```

### 7. DoD check

**Before running DoD — re-read `.ralph/tasks.json` and check your task's current status:**
- If `status` is already `'converged'` and `worker` is NOT your worker ID → another worker completed this task. Do NOT continue. Go back to "On Start" and claim the next pending task.
- If `status` is `'converged'` and `worker` IS your worker ID → you already converged, exit cleanly.

#### Phase 1 — Inline Verification (your job)

Run fresh and check actual output:

```bash
npm test 2>&1 | tail -30
npm run build 2>&1 | tail -20
```

For E2E: check `package.json` `scripts` for a Playwright-specific script — look for keys containing `e2e`, `playwright`, or similar (e.g. `test:e2e`, `e2e`, `playwright`). Run it if present.

For UI tasks:
- Run Step 3b runtime verification (browser screenshots: before/during/after) — tests passing is not sufficient
- Run `/e2e-reviewer` on your Playwright test files and fix any issues flagged (skip only if not installed — note it in PROGRESS.md)
- E2E tests must cover all scenarios assigned to this task in `.ralph/SPEC.md`

**Skill invocation check:**
- Re-read your task `description` in `.ralph/tasks.json`
- If `/ui-reverse-engineering` appears in the description and `used_skills:` in your PROGRESS.md does NOT include it → you MUST go back and run it now. Do not converge without it.
- If `/transition-reverse-engineering` appears in the description and `used_skills:` does NOT include it → same rule.

For each acceptance criterion in `.ralph/tasks.json` for your task:
- Mark as VERIFIED (test exists and passes), PARTIAL, or MISSING

For each E2E scenario assigned to this task in `.ralph/SPEC.md`:
- Mark as COVERED or MISSING

**Verdict:**
- All VERIFIED + all E2E COVERED + tests + build green → write `dod_checklist` all `true` in state.json, then proceed to Phase 2
- Any FAIL or MISSING → fix the gaps and repeat from the top of DoD

#### Phase 2 — Inline Architect Review (independent self-audit)

> **POLICY: `converged: true` and `architect_review` are written only here in Phase 2 — not before, not pre-emptively. Skip Phase 2 and you are not converged.**

Read as if you are a separate reviewer seeing this code for the first time:
`.ralph/SPEC.md`, `CLAUDE.md`, source + test files for the task, state.json, PROGRESS.md

**Time-box to 10 minutes.** Record `architect_review_started_at` in state.json before starting. If you cannot reach a verdict within 10 minutes, treat it as PATHOLOGY — write `{ "architect_review_timeout": true }` to state.json, set task status to `'pathology'`, and exit.

Check:
- All spec requirements met? No done criteria missing? (check both SPEC.md and the task `description` in tasks.json)
- Tests test behavior (not implementation details)?
- No scope creep (nothing built outside the spec)?
- No unresolved `debug_session` with `confidence: low` in state.json?
- **UI tasks only**: evidence in state.json or PROGRESS.md that before/during/after screenshots were taken? If not → REJECTED.
- **Read the actual source code** — not just test output. For each file touched, apply `CLAUDE.md § Code Correctness Rules`:
  - Are values passed to dependencies stable/fresh as the contract requires?
  - Are async operations that write to shared state cancellable?
  - Does every boolean/state that gates UI visibility reach the correct value on both happy and error paths?
- Steelman: "What's the strongest reason to reject?" — if you find one, reject. If none, approve.

**If APPROVED:**
- Write `.ralph/workers/worker-N/state.json` — set `converged: true`, set `dod_checklist` all to `true`, add `architect_review: { status: "approved", reviewed_at: "<ISO>", notes: "<brief reason>" }` (preserve all other fields)
- Write `.ralph/tasks.json` — set this task's `status` to `"converged"`
- Continue to step 3 below

**If REJECTED:**
- Write `.ralph/workers/worker-N/state.json` — add `architect_review: { status: "rejected", reviewed_at: "<ISO>", notes: "<specific gaps>" }` (preserve all other fields)
- Fix each gap listed, re-run DoD from Phase 1

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
4. Write a mailbox message file to `.ralph/mailbox/<timestamp>-worker-N-task-complete.json`:
   ```json
   {
     "from": N,
     "to": "all",
     "type": "task_complete",
     "subject": "task N complete: [name]",
     "body": "brief summary of what was built",
     "learnings": ["one-line learning 1", "one-line learning 2"],
     "timestamp": "<ISO>"
   }
   ```
   **`learnings` is mandatory** — copy every `learnings:` line from your PROGRESS.md into this array. Other workers will read this before starting their tasks. Empty array only if you genuinely learned nothing new.
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

- On external service failure: mark `'fail:external_service'` in last_results, try next approach in the escalation ladder (direct → proxy → mock fallback). Do NOT immediately mock — exhaust real approaches first, then fall back to mock as last resort.
- Never disable or delete tests to make them pass
- Never implement beyond what the task description defines as scope
- When stuck: break into smaller pieces → retry
- After 3 failed attempts with same approach: choose a different method
- See `CLAUDE.md § Code Correctness Rules` for language/framework-agnostic correctness requirements — these apply to every line of code you write
