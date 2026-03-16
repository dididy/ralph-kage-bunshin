# /ralph-kage-bunshin-start — Ralph Project Setup Skill

You are setting up a new Ralph project. Run a deep, free-form interview to fully understand what the user wants to build — then synthesize a tight spec and granular task list.

## Phase 1: Deep Interview

**Goal:** Understand the project well enough to write a spec a developer with zero context could implement.

Ask questions freely and follow the conversation wherever it goes. You are NOT running through a fixed checklist — you are a senior engineer doing a requirements deep-dive.

**Start with:** "Tell me about what you want to build."

Then explore as needed. Good areas to probe (not a fixed order — follow the conversation):

- **Core behavior** — What does it actually do? Walk me through a user's typical session.
- **Edge cases** — What happens when X fails? What's the unhappy path?
- **Scope boundaries** — What are you explicitly NOT building? What's tempting to add but should wait?
- **Done criteria** — How will you know it's done? What's measurable? What would a demo look like?
- **Data model** — What are the main entities? How do they relate? What's the schema?
- **Architecture** — Monolith or split services? Client-side or server-side rendering? REST or GraphQL? Realtime?
- **Tech stack** — Frontend framework? Backend runtime? Database? ORM? Auth solution? CSS approach?
  - Push back on vague answers. "React" is not enough — is it Next.js? App Router or Pages? With what state management?
  - If they're unsure, make a concrete recommendation and explain why.
  - **Language is always TypeScript unless the user explicitly says otherwise.** Do not ask — assume TypeScript and state it in the spec.
- **External services** — Supabase, Stripe, GitHub API, etc.? What env vars will workers need?
- **Testing strategy** — Are there UI flows that need Playwright E2E tests? Which user journeys are critical?
  - **Default testing stack: Vitest (unit/integration) + Playwright (E2E).** If the user doesn't mention testing, confirm this default during the interview — do not silently omit it.
- **Constraints** — Performance requirements? Mobile support? Bundle size limits? Existing codebase to integrate with?
- **Ambiguities** — Anything unclear? Any design decisions that need to be made now?

**Rules:**
- Ask one question at a time. Wait for the answer.
- If an answer raises new questions, follow up — don't rush to the next topic.
- Keep asking until you feel confident you could hand this spec to a stranger and they'd build the right thing.
- When you have enough, say: "I think I have a clear picture. Let me draft the spec."

## Phase 2: Synthesize the Spec

Do NOT copy the user's words verbatim. You are synthesizing, clarifying, and organizing.

Write a spec that:
- Clarifies all ambiguities you uncovered in the interview
- Identifies implicit dependencies between tasks
- Specifies exact done criteria — testable, not vague
- Notes all external services and fallback strategies
- Lists env vars needed

**Non-negotiable spec items — always include, even if user never mentioned them:**
- **Language**: TypeScript (always, unless user explicitly opted out)
- **Testing**: Vitest for unit/integration + Playwright for E2E — list at least 2–3 concrete E2E scenarios
- **Linting/type-check**: `tsc --noEmit` + ESLint must pass as part of DoD

**Web frontend defaults** (apply when the project has any browser UI — confirm with user if unsure):
- Framework: Next.js 15 App Router (Server Components by default, Client Components only when interactivity requires it)
- Styling: Tailwind CSS v4 + shadcn/ui
- React 19 APIs — prefer these over legacy patterns wherever applicable:
  - `useOptimistic` for optimistic UI updates
  - `useActionState` for form/server action state
  - `use()` to consume Promises and Context directly
  - `useFormStatus` for form submission state
  - Server Actions + `<form action>` pattern instead of API routes for mutations
  - React Compiler (babel plugin) for automatic memoization — no manual `useMemo`/`useCallback`
  - `ref` as a plain prop — no `forwardRef`
  - No `useEffect` for data fetching — use Server Components or `use()`
- State: avoid client-side state managers (Zustand, Redux, etc.) unless the spec clearly requires it
- If user says "React" without specifying → ask: "Next.js App Router, or plain Vite + React SPA?"

## Phase 3: Show the Plan and Get Approval

Print the spec and task list:

```
─────────────────────────────────────────
SPEC
─────────────────────────────────────────
[spec content]

─────────────────────────────────────────
TASKS  (N tasks → recommended N workers)
─────────────────────────────────────────
1. [task name]
2. [task name]
...

Wave 1 (run in parallel):
  1. [task]    [parallel]
  2. [task]    [parallel]

Wave 2 (after wave 1 finishes):
  3. [task]    [after: 1]
  4. [task]    [after: 1, 2]

Wave 3:
  5. [task]    [after: 3, 4]

Max parallel at once: 2  →  RECOMMENDATION: ralph team 2
(Tasks 3-5 depend on earlier work — more workers won't help)
─────────────────────────────────────────
```

Then ask: **"Does this look right? Any changes before I write the files?"**

- If the user requests changes: revise and show again. Repeat until approved.
- If the user says yes: proceed to Phase 4.

## Phase 4: Write Project Files

### `.ralph/SPEC.md`
```markdown
# SPEC.md
> Generated: [ISO timestamp]

## What
[synthesized feature description]

## What NOT
[explicit scope exclusions]

## Architecture
[e.g. Next.js 15 App Router, Server Components first, Supabase for DB + Auth, deployed to Vercel]

## Tech Stack
- **Frontend**: [framework, version, key libraries]
- **Backend**: [runtime, framework, or "Server Actions via Next.js"]
- **Database**: [DB + ORM, e.g. "PostgreSQL via Supabase, Drizzle ORM"]
- **Auth**: [e.g. Supabase Auth, NextAuth, Clerk]
- **Styling**: [e.g. Tailwind CSS v4, shadcn/ui]
- **Testing**: [e.g. Vitest + Playwright for E2E]
- **Deployment**: [e.g. Vercel, Railway, Fly.io]

## Done = ?
[measurable completion criteria — specific and testable]

## E2E Test Scenarios
[key user journeys that must have Playwright tests, e.g.]
- User can sign up, log in, and log out
- User can create, edit, and delete a todo item
- Offline: shows error state gracefully

**Each scenario must be assigned to a specific task** (see tasks.json). Workers only write E2E tests for the scenarios listed in their task description — not all scenarios at once.

## External Dependencies
[services, API keys needed, fallback strategies, or "None"]
```

### `.ralph/tasks.json`
```json
{
  "tasks": [
    { "id": 1, "name": "Project setup", "status": "pending", "worker": null },
    { "id": 2, "name": "[task name]", "status": "pending", "worker": null, "depends_on": [1], "isolated": true },
    { "id": 3, "name": "[task name]", "status": "pending", "worker": null, "depends_on": [1], "isolated": true },
    { "id": 4, "name": "[task name]", "status": "pending", "worker": null, "depends_on": [2, 3] }
  ]
}
```

- Tasks with no `depends_on` (or empty array) are claimable immediately
- Tasks with `depends_on: [N, M]` are only claimable after tasks N and M are both `"converged"`
- Workers automatically skip tasks whose dependencies aren't met yet — no manual coordination needed
- Tasks with `"isolated": true` will be worked on in a dedicated git worktree (`feat/worker-N-<slug>` branch), keeping parallel work completely separate. The branch is merged or PR'd after the architect approves.

**Always include a setup task if the project needs initial environment setup** (e.g. `npm install`, `npx playwright install`, scaffold). Make all other tasks `depends_on: [1]` so workers wait for setup to complete before starting real work.

**Set `"isolated": true` on tasks that run in parallel (same wave) and may touch overlapping files.** Tasks that are strictly sequential don't need isolation — they run one after another on the same branch.

**Task granularity rules:**
- Each task is completable in one focused worker session (~1-3 hours of coding)
- Each task must be specific enough to write tests for
- If a feature is large, split it into: (a) data model + schema, (b) core logic, (c) API/UI layer
- When unsure: split rather than merge
- **E2E scenarios must be distributed across tasks** — assign each Playwright scenario to the task that implements that feature. Do NOT create a single "write all E2E tests" task at the end. Example: "Auth UI — login form + Playwright E2E: user can log in and log out"

**Dependency analysis (critical for worker count recommendation):**

For each task, explicitly decide: can it run in parallel with others, or does it depend on another task being done first?

Label each task with one of:
- `[parallel]` — no dependencies, can start immediately → `depends_on` omitted
- `[after: N]` — must wait for task N → `"depends_on": [N]`
- `[after: N, M]` — must wait for both → `"depends_on": [N, M]`

Then count the maximum number of tasks that can run simultaneously at any wave. That number is your worker recommendation — not the total task count.

Example:
```
Task 1: Project setup            [parallel]   ← wave 1: run first, others wait
Task 2: DB schema + types        [after: 1]   ← wave 2: 3 tasks run together
Task 3: Auth module              [after: 1]   ← wave 2
Task 4: File upload util         [after: 1]   ← wave 2
Task 5: User profile API         [after: 2,3] ← wave 3: depends on schema + auth
Task 6: Dashboard UI             [after: 5]   ← wave 4
Task 7: E2E tests                [after: 6]   ← wave 5
```
→ Max parallelism = 3 (wave 2) → recommend `ralph team 3`

If most tasks are sequential (wave by wave with 1-2 tasks each), recommend 2-3 workers max. Extra workers just sit idle.

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
- [ ] E2E scenarios in SPEC.md covered by Playwright tests (if applicable to this task)
- [ ] Assigned task complete per .ralph/SPEC.md done criteria

## Convergence Condition
When all DoD items above are satisfied:
1. Call `/ralph-kage-bunshin-architect` with your worker ID, project directory, and task name
2. Wait for APPROVED verdict before marking converged
3. If REJECTED: fix the gaps and repeat DoD checks
```

### `.ralph/.env` (only if env vars were mentioned)
```
KEY=
KEY2=
```
Add `.ralph/.env` to `.gitignore` if not already present.

## Phase 5: Hand Off

Do NOT run `ralph team` automatically. Print this and stop:

```
[OK] .ralph/SPEC.md written
[OK] .ralph/tasks.json written (N tasks)
[OK] CLAUDE.md written
[OK] .ralph/.env created  (if applicable)

Ready. Run this in your terminal to start workers:

  ralph team N

(N = max parallel tasks per wave analysis above — see TASKS section for recommendation)
You can run fewer workers; extra tasks will queue and be claimed automatically.

To watch workers in tmux:

  tmux attach -t ralph-<project-name>

To monitor status:

  ralph status --watch
```

## Rules

- Never skip the approval step (Phase 3)
- Never ask all interview questions at once
- Never accept vague done criteria — push for measurable outcomes
- The spec is your synthesis, not a transcript of the interview
- Write actual files using your tools — do not just print the content
- Task count drives the worker recommendation — more granular is better
