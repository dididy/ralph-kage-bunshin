---
name: ralph-kage-bunshin-start
description: Use when the user wants to set up, plan, or initialize a new ralph-kage-bunshin project — runs a dimension-based interview to produce SPEC.md, tasks.json (with dependency waves), and CLAUDE.md so workers can start
---

# /ralph-kage-bunshin-start — Ralph Project Setup Skill

You are setting up a new Ralph project. Run a structured, dimension-based interview to fully understand what the user wants to build — then synthesize a tight spec and granular task list.

## Phase 0: Context Detection

Before asking anything, explore the environment:

- Check if cwd has existing source files, `package.json`, or git history → **brownfield** or **greenfield**
- Check `CLAUDE.md` if present

**If `.ralph/SPEC.md` already exists:**
> "A spec already exists for this project. Resume from where you left off, or start over?"
> - **Resume**: read the existing SPEC.md and tasks.json, then pick up from the first incomplete dimension
> - **Start over**: confirm before deleting — "This will overwrite the existing spec. Are you sure?"

### UI Clone Detection (before interview)

**If the user provides a URL and mentions cloning/copying/replicating a site:**

1. Check if `agent-browser` is installed globally (`which agent-browser`). If not, prompt the user to install it: `npm install -g @anthropic-ai/agent-browser`
2. Launch `agent-browser` to explore the reference site
3. Capture: page structure, sections, navigation, key interactions, animations, responsive behavior
4. Use this analysis to inform the interview — pre-fill Goal dimension with observed site purpose and user journeys
5. Record findings so tasks can be scoped accurately

**This step is mandatory for clone projects.** Do not skip it or substitute with MCP Playwright. agent-browser provides richer context for understanding the full site.

Announce:
> Project type: {greenfield | brownfield}
> Starting structured interview. I'll track three dimensions as we go — we proceed to spec only when all three are filled.

---

## Phase 1: Dimension-Based Interview

Track three dimensions throughout the interview. After every answer, display the current state:

```
[Goal ✓] [Constraints ∙∙] [Criteria ✗]
Targeting: Criteria — no E2E scenarios defined yet
```

Legend: ✓ = complete, ∙∙ = partial, ✗ = not started

### Dimension 1 — Goal Clarity

**Complete when:**
- One-sentence purpose statement is possible
- At least one core user journey is described

**Questions to explore (one at a time, follow the conversation):**
- "What do you want to build?"
- "Who is the primary user of this?"
- "Walk me through the single most important action a user takes with this product."
- "Why are you building this now? What problem does it solve?"

Ask these ONE AT A TIME — never list multiple questions in a single response.

Do NOT move to Dimension 2 until Goal is at least ∙∙ (partial). Early tech stack questions without a clear goal produce unfocused specs.

### Dimension 2 — Constraint Clarity

**Complete when:**
- Tech stack is confirmed (with specific versions/choices)
- At least one explicit out-of-scope item is named

**Questions to explore (one at a time):**
- "Do you have a tech stack in mind already?"
- "What are you explicitly NOT building this time — what's deferred to later?"
- "Do you need any external services (Auth, DB, payments, etc.)?"
- "Do you need mobile support? Any performance requirements?"

Ask these ONE AT A TIME — never list multiple questions in a single response.

**If the user mentions any external API:** run `/api-integration-checklist` before confirming the stack. Record the CORS/proxy decision in SPEC.md `## External Dependencies`. Do not skip this — CORS failures discovered at runtime are not recoverable without an architecture change.

**When React/Next.js is in the stack:** reference `vercel-react-best-practices` for data fetching patterns (Server Components vs client fetch, SWR/React Query, bundle optimization). Lock the chosen pattern in SPEC.md Tech Stack.

**When stack choices arise, present options:**
```
There are a few directions here:

A. [Option A] — pros: [...], cons: [...]
B. [Option B] — pros: [...], cons: [...]
C. [Option C] — pros: [...], cons: [...] (if applicable)

Recommendation: A (reason: ...)
```

### Dimension 3 — Success Criteria

**Complete when:**
- At least 2 testable done criteria are defined
- At least 2 E2E test scenarios are described

**Questions to explore (one at a time):**
- "How will you know it's done? If you were demoing it, what would you show?"
- "Walk me through 2-3 core flows a user must be able to complete."
- "What edge cases or failure scenarios must be handled?"
- "Any non-functional requirements — performance, accessibility, SEO?"

Ask these ONE AT A TIME — never list multiple questions in a single response.

---

## Phase 2: Gap Analysis

After each answer, re-evaluate all three dimensions.

**Loop until all three are ✓:**
1. Identify the weakest (lowest) dimension
2. Ask the next question targeting that dimension
3. Update the dimension status display

When ready to exit the loop, confirm:
> "All three dimensions are complete. Moving to architecture options."

If the user says "enough", "go", or similar before all dimensions are complete, show the gap:
> "[Constraints] is still incomplete — tech stack hasn't been confirmed. Proceed anyway?"

---

## Phase 3: Architecture Confirmation

**Do NOT re-run a full options comparison here** — stack choices were already explored during Phase 1 Dimension 2.

This phase is a confirmation step: synthesize what was decided into a single clear picture and get explicit approval.

```
─────────────────────────────────────────
ARCHITECTURE SUMMARY
─────────────────────────────────────────
Approach: [chosen option from Phase 1 discussion]
Structure: [brief description]
Stack: [confirmed choices]
Key trade-offs accepted: [what was weighed and decided]
─────────────────────────────────────────
```

Ask: **"Does this accurately capture what we decided? Anything to change before I write the spec?"**

**Only present new options here if** the user raises a concern or if a conflict was discovered between choices made during the interview. Otherwise, confirm and move on.

Wait for approval before moving to Phase 4.

---

## Phase 4: Show the Plan and Get Approval

Synthesize everything and print:

```
─────────────────────────────────────────
SPEC
─────────────────────────────────────────
[spec content]

─────────────────────────────────────────
TASKS  (N tasks → recommended N workers)
─────────────────────────────────────────
Wave 1 (run in parallel):
  1. [task]    [parallel]
  2. [task]    [parallel]

Wave 2 (after wave 1 finishes):
  3. [task]    [after: 1]
  4. [task]    [after: 1, 2]

Wave 3:
  5. [task]    [after: 3, 4]

Max parallel at once: 2  →  RECOMMENDATION: ralph team 2
─────────────────────────────────────────
```

Ask: **"Does this look right? Any changes before I write the files?"**

- Changes requested → revise and show again
- Approved → Phase 5

---

## Phase 5: Write Project Files and Hand Off

### `.ralph/SPEC.md`
```markdown
# SPEC.md
> Generated: [ISO timestamp]

## What
[synthesized feature description]

## What NOT
[explicit scope exclusions]

## Architecture
[confirmed in Phase 3]

## Tech Stack
- **Frontend**: [framework, version, key libraries]
- **Backend**: [runtime, framework, or "Server Actions via Next.js"]
- **Database**: [DB + ORM]
- **Auth**: [solution]
- **Styling**: [approach]
- **Testing**: Vitest + Playwright for E2E
- **Deployment**: [target]

## Done = ?
[measurable completion criteria — specific and testable]

## E2E Test Scenarios
[list scenarios from Dimension 3, each with the task ID responsible for implementing it]
- User can [action] → task N
- User can [action] → task N

## External Dependencies
[services, API keys, fallback strategies, or "None"]
```

### `.ralph/tasks.json`
```json
{
  "tasks": [
    { "id": 1, "name": "Project setup", "status": "pending", "worker": null, "description": "[what this task does]" },
    { "id": 2, "name": "[task]", "status": "pending", "worker": null, "depends_on": [1], "isolated": true, "description": "[what this task does, including any required steps]" },
    { "id": 3, "name": "[task]", "status": "pending", "worker": null, "depends_on": [1], "isolated": true, "description": "[what this task does, including any required steps]" },
    { "id": 4, "name": "[task]", "status": "pending", "worker": null, "depends_on": [2, 3], "description": "[what this task does]" }
  ]
}
```

**Task rules:**
- Every task **must** have a `description` field — a worker's only context is this description. Empty or missing descriptions are not allowed. Each description must be self-contained — a worker reading ONLY this description (not SPEC.md or other tasks) must understand what to build, what tests to write, and what 'done' means for this task.
- `depends_on` tasks are only claimable after all listed tasks are `"converged"`. Tasks with no `depends_on` are claimable immediately and run in parallel with each other.
- `isolated: true` **must** be set on any task that runs in parallel with another task that touches the same files (src/, package.json, config files). When in doubt, set `isolated: true`. Omitting it on parallel tasks risks merge conflicts. Rule of thumb: if two tasks in the same wave both modify files under `src/`, they should both be `isolated: true`. Only omit `isolated` when tasks are truly independent (e.g., one writes docs, another writes code).
- Each task completable in one focused session (~1-3 hours)
- **E2E scenarios must be distributed across tasks** — assign each Playwright scenario to the task that makes it first runnable end-to-end. Include the assigned E2E scenario(s) in that task's `description`. Never create a single "write all E2E tests" task at the end. ❌ NEVER: `{ id: 5, name: 'Write E2E tests', description: 'Write all Playwright tests for the project' }` — this defeats parallel execution. Each task owns its own E2E scenarios.
- **Task granularity**: if a feature is large, split into (a) data model + schema, (b) core logic, (c) API/UI layer. When unsure: split rather than merge.
- Always include a setup task (id: 1) if the project needs initial scaffolding. All other tasks `depends_on: [1]`.
- A **wave** is a set of tasks that can start in parallel once their `depends_on` tasks are all converged. Waves are sequential — wave 2 starts after wave 1 finishes. Worker recommendation = max tasks in any single wave. Example: wave 1 has 1 task, wave 2 has 2 tasks → max parallel = 2 → `ralph team 2`.
- **If a task involves reverse-engineering visual behavior from an existing site** (animations, transitions, UI cloning): include `/transition-reverse-engineering` or `/ui-reverse-engineering` in the task `description` — the worker will invoke the skill, which contains the full procedure

**Before writing tasks.json — UI clone check:**
If the project goal mentions cloning, copying, reproducing, replicating, or pixel-level recreation of an existing website/page, EVERY UI implementation task MUST include `/ui-reverse-engineering` in its `description`. For tasks that specifically involve animations or transitions, also include `/transition-reverse-engineering`. This is not optional — omitting it means the worker will implement from text description alone without comparing against the reference, producing visually incorrect results. Also ensure the reference URL is recorded in SPEC.md under `## Reference`.

### `CLAUDE.md`
```markdown
# Project Constitution

## How to Work
- Follow TDD: write failing test first, then implement, then refactor
- Every commit must pass: `tsc --noEmit` + ESLint + `npm test`
- Never disable or delete tests to make them pass
- Do not expand scope beyond .ralph/SPEC.md
- On external service failure: try direct fetch → proxy → mock fallback in order. Never stop — mock is last resort, not first.
- When stuck: break into smaller pieces, max 3 attempts per approach

## Testing
- Unit/integration: Vitest
- E2E: Playwright (`npm run test:e2e`)
- Write Playwright tests for any user-facing flow listed in SPEC.md E2E Test Scenarios

## Code Correctness Rules
These apply to every line of code, regardless of language or framework:
- Values passed to dependencies must be what they claim — stable where stability is assumed, fresh where freshness is required. A value created inside a hot path and passed as if stable is a bug.
- Every async operation that writes to shared state must be cancellable. If the owner is torn down before completion, the write must be a no-op (use cancelled flag or AbortController).
- Every boolean/state that gates UI visibility must reach the correct value on the happy path AND on error/empty paths. Trace all code paths before shipping.

## Definition of Done
- [ ] `npm test` passes (all Vitest tests green)
- [ ] `npm run build` has no errors
- [ ] E2E scenarios in SPEC.md covered by Playwright tests
- [ ] Assigned task complete per .ralph/SPEC.md done criteria

## Convergence Condition
When all DoD items above are satisfied, run two phases:

**Phase 1 — Inline Verification:**
Re-run tests fresh, mark each acceptance criterion as VERIFIED/PARTIAL/MISSING, mark each E2E scenario as COVERED/MISSING. Write `dod_checklist` to state.json.

**Phase 2 — Inline Architect Review (independent self-audit):**
Read SPEC.md + source + tests as if seeing them for the first time. Apply Code Correctness Rules to each file touched. Steelman the rejection. Write `converged: true` and `architect_review: { status: "approved" }` atomically into state.json and tasks.json only if no gaps found.

If REJECTED: fix gaps, repeat from Phase 1.
```

Write the files, then do NOT run `ralph team` automatically. Print this and stop:

```
[OK] .ralph/SPEC.md written
[OK] .ralph/tasks.json written (N tasks)
[OK] CLAUDE.md written

Ready. Run this in your terminal to start workers:

  ralph team N

To watch workers in tmux:

  tmux attach -t ralph-<project-name>

To monitor status:

  ralph status --watch
```

---

## Rules

- **One question at a time** — always
- **Display dimension status after every answer** — never skip
- **Options when choices arise** — 2-3 options with trade-offs and a recommendation
- **Never accept vague done criteria** — push for testable outcomes
- **Never skip Phase 3 approval** — architecture must be confirmed before spec
- **Never skip Phase 4 approval** — spec must be approved before writing files
- **TypeScript always** — unless user explicitly opts out
- **Vitest + Playwright always** — default testing stack
- **Browser analysis: agent-browser first** — whenever you need to explore, analyze, or inspect a live website during any phase, use `agent-browser`. If not installed, prompt the user to run `npm install -g @anthropic-ai/agent-browser`.
