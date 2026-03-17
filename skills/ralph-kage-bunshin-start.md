---
name: ralph-kage-bunshin-start
description: Use when setting up a new ralph-kage-bunshin project — runs a dimension-based interview to generate SPEC.md, tasks.json, and CLAUDE.md
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

### Dimension 2 — Constraint Clarity

**Complete when:**
- Tech stack is confirmed (with specific versions/choices)
- At least one explicit out-of-scope item is named

**Questions to explore (one at a time):**
- "Do you have a tech stack in mind already?"
- "What are you explicitly NOT building this time — what's deferred to later?"
- "Do you need any external services (Auth, DB, payments, etc.)?"
- "Do you need mobile support? Any performance requirements?"

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
    { "id": 1, "name": "Project setup", "status": "pending", "worker": null },
    { "id": 2, "name": "[task]", "status": "pending", "worker": null, "depends_on": [1], "isolated": true },
    { "id": 3, "name": "[task]", "status": "pending", "worker": null, "depends_on": [1], "isolated": true },
    { "id": 4, "name": "[task]", "status": "pending", "worker": null, "depends_on": [2, 3] }
  ]
}
```

**Task rules:**
- `depends_on` tasks are only claimable after all listed tasks are `"converged"`
- `isolated: true` on parallel tasks that may touch overlapping files
- Each task completable in one focused session (~1-3 hours)
- **E2E scenarios must be distributed across tasks** — assign each Playwright scenario to the task that implements that feature. Never create a single "write all E2E tests" task at the end.
- **Task granularity**: if a feature is large, split into (a) data model + schema, (b) core logic, (c) API/UI layer. When unsure: split rather than merge.
- Always include a setup task (id: 1) if the project needs initial scaffolding. All other tasks `depends_on: [1]`.
- Max parallelism per wave determines the worker recommendation — not total task count.

### `CLAUDE.md`
```markdown
# Project Constitution

## How to Work
- Follow TDD: write failing test first, then implement, then refactor
- Every commit must pass: `tsc --noEmit` + ESLint + `npm test`
- Never disable or delete tests to make them pass
- Do not expand scope beyond .ralph/SPEC.md
- On external service failure: mock it and keep going — never stop
- When stuck: break into smaller pieces, max 3 attempts per approach

## Testing
- Unit/integration: Vitest
- E2E: Playwright (`npm run test:e2e`)
- Write Playwright tests for any user-facing flow listed in SPEC.md E2E Test Scenarios

## Definition of Done
- [ ] `npm test` passes (all Vitest tests green)
- [ ] `npm run build` has no errors
- [ ] E2E scenarios in SPEC.md covered by Playwright tests (if applicable)
- [ ] Assigned task complete per .ralph/SPEC.md done criteria

## Convergence Condition
When all DoD items above are satisfied:
1. Call `/ralph-kage-bunshin-architect` with your worker ID, project directory, and task name
2. Wait for APPROVED verdict before marking converged
3. If REJECTED: fix the gaps and repeat DoD checks
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
