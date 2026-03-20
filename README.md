<p align="center">
  <img src="assets/ralph.jpg" alt="ralph-kage-bunshin" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="node"></a>
</p>

<h3 align="center">
  <strong>Spawn N cloned Ralphs. Each claims a task, writes tests, implements, and converges — while you sleep.</strong>
</h3>

<p align="center">
  <em>ralph-kage-bunshin (影分身, Shadow Clone) — orchestrate multiple Claude Code instances in parallel tmux sessions. You define the spec, workers do the rest.</em>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#features">Features</a> •
  <a href="#commands">Commands</a> •
  <a href="#skills">Skills</a>
</p>

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Parallel workers** | N workers claim and complete tasks independently in tmux panes |
| **Task dependencies** | `depends_on` ensures correct ordering — workers wait automatically |
| **Git worktrees** | `isolated: true` tasks run in dedicated branches, no file conflicts |
| **Lease system** | Configurable leases (default 30 min) prevent abandoned tasks from blocking progress |
| **Agent pipeline** | Worker → Debugger (on failure) → inline Verify → inline Architect review |
| **Debugger agent** | Called on 3+ failures: diagnoses root cause, proposes ONE fix with file:line evidence |
| **Inline verification** | Worker re-runs tests fresh and checks every acceptance criterion before converging |
| **Inline architect review** | Critic-gate review against spec — steelmans before approving, writes `converged: true` atomically |
| **Worker mailbox** | File-based messaging between workers via `.ralph/mailbox/`; `learnings` from completed tasks broadcast to all workers |
| **Environment notes** | Workers record env-level gotchas (CLI quirks, missing files) to `CLAUDE.md` immediately — shared across all workers and sessions |
| **Pathology detection** | Stagnation, oscillation, wonder-loop, external-service-block — workers self-detect and exit cleanly |
| **Auto-recovery** | `--watch` mode detects crashed workers and recovers them in the original session by recycling idle panes |
| **Secrets** | `.ralph/.env` with `0600` permissions, auto-sourced on worker startup |
| **Profiles** | Reusable config presets via `~/.ralph/profiles/` |

---

## How It Works

1. **`/ralph-kage-bunshin-start`** — Dimension-based interview that generates `.ralph/SPEC.md`, `.ralph/tasks.json`, and `CLAUDE.md`
2. **`ralph team N`** — Spawns N tmux panes, each running Claude with `/ralph-kage-bunshin-loop`
3. **Worker loop** — Claims the lowest-ID pending task, writes tests first, implements, checks DoD
4. **Debugger gate** — On 3+ consecutive failures, `/ralph-kage-bunshin-debug` diagnoses root cause and proposes ONE fix
5. **Verification (inline)** — Worker independently re-runs tests and checks all acceptance criteria against SPEC.md before proceeding
6. **Architect review (inline)** — Worker performs Critic-gate review against spec with steelmanning. APPROVED writes `converged: true` atomically into `state.json` and `tasks.json`.
7. **Lease system** — Tasks have a configurable lease (default 30 min). Crashed workers are auto-detected and tasks re-queued.
8. **Auto-recovery** — `ralph status --watch` automatically calls `ralph recover` when expired leases or stuck workers are detected. Recovered workers spawn in the original session by recycling idle (converged) panes — no separate recover session created.

---

## Installation

```bash
npm install -g ralph-kage-bunshin
ralph install-skills
```

Requires: **Node.js 18+**, **tmux**, **[Claude Code](https://claude.ai/code)**

---

## Quick Start

**Step 1 — Install**
```bash
npm install -g ralph-kage-bunshin
ralph install-skills
```

**Step 2 — Set up your project (inside Claude Code)**
```
cd my-project
claude    # open Claude Code in your project directory
```
Then run the setup skill:
```
/ralph-kage-bunshin-start
```
> This skill runs an interview, then writes `.ralph/SPEC.md`, `.ralph/tasks.json`, and `CLAUDE.md`.

**Step 3 — Launch workers (in your terminal)**
```bash
ralph team 3
```

**Step 4 — Monitor**
```bash
ralph status --watch
tmux attach -t ralph-my-project
```

---

## Features

### Worker Loop

Each worker follows a strict TDD + multi-agent pipeline:

```
claim task → write test (red) → implement (green) → refactor
  → 3 failures? → Debugger → fix → retry
  → DoD pass → inline verify → inline architect review → converge → claim next task
```

1. Claim lowest-ID pending task (with lease)
2. Read spec, mailbox, and own state
3. Write failing test → implement → pass test
4. On 3+ consecutive failures: call `/ralph-kage-bunshin-debug` for root-cause diagnosis
5. Run DoD checks (`npm test`, `npm run build`, E2E)
6. **Inline verification** — re-run tests fresh, check every acceptance criterion and E2E scenario against SPEC.md
7. **Inline architect review** — Critic-gate review against spec with steelmanning; write `converged: true` atomically on APPROVED
8. On APPROVED: send mailbox message, claim next task

### Agent Roles

| Agent | Skill | Triggered by | Role |
|-------|-------|-------------|------|
| **Worker** | `/ralph-kage-bunshin-loop` | `ralph team N` | Implement, TDD, DoD checks, inline verify + architect review |
| **Debugger** | `/ralph-kage-bunshin-debug` | 3+ consecutive failures | Root-cause diagnosis, ONE fix proposal |

> **Note:** Verifier and Architect logic run **inline** inside the worker loop — no separate skill calls. The `/ralph-kage-bunshin-verify` and `/ralph-kage-bunshin-architect` skills exist as standalone tools for manual use outside the automated loop.

### Architect Review

The architect reads `.ralph/SPEC.md` and steelmans the implementation before approving — actively looking for the strongest reason to reject. APPROVED writes `converged: true` atomically into both `state.json` and `tasks.json`. Low-confidence debug sessions block approval until resolved.

### Task Dependencies

```json
{ "tasks": [
  { "id": 1, "name": "Project setup",  "status": "pending" },
  { "id": 2, "name": "Auth module",    "status": "pending", "depends_on": [1], "isolated": true },
  { "id": 3, "name": "DB schema",      "status": "pending", "depends_on": [1], "isolated": true },
  { "id": 4, "name": "API layer",      "status": "pending", "depends_on": [2, 3] }
]}
```

- `depends_on` — task won't be claimed until all listed tasks are `converged`
- `isolated: true` — runs in a dedicated git worktree (`feat/worker-N-<slug>`), merged or PR'd on convergence

### Pathology Detection

| Pattern | Condition | Response |
|---------|-----------|----------|
| Stagnation | 3+ consecutive failures | Call Debugger → apply fix → if still failing, break into smaller pieces |
| Oscillation | `fail,pass,fail,pass` in last 4 results | Lock decision in CLAUDE.md |
| WonderLoop | Same approach tried 3+ times | Choose different method |
| ExternalServiceBlock | 3+ consecutive `fail:external_service` | Switch approach: direct fetch → Vite proxy → server-side proxy → mock fallback; record in `approach_history` |

### Secrets

```bash
ralph secrets set OPENAI_API_KEY=sk-...
ralph secrets set DATABASE_URL=postgresql://...
```

Stored in `.ralph/.env` with `0600` permissions. Workers `source .ralph/.env` automatically on startup.

---

## Commands

```
ralph team <n>              Spawn N tmux workers
ralph recover               Reset expired leases, relaunch workers
ralph status                Show worker state
ralph status --watch [N]    Live dashboard, refresh every N seconds (default: 5)
ralph status --no-recover   Watch mode without auto-recovery
ralph status --messages     Show mailbox messages

ralph install-skills               Copy skills to ~/.claude/skills/ (overwrites by default)
ralph install-skills --no-overwrite  Skip existing files instead of overwriting

ralph secrets set KEY=value   Store a secret in .ralph/.env
ralph secrets unset KEY       Remove a secret
ralph secrets list            List secret keys (values hidden)

ralph profile list            List available profiles
ralph profile apply <name>    Apply a profile to the current project
```

---

## Skills

```bash
ralph install-skills
```

Installs six skills to `~/.claude/skills/`, then installs `dididy/e2e-skills` and `dididy/ui-skills` via `npx skills`. Overwrites existing files by default — use `--no-overwrite` to skip.

| File | Slash Command | Role |
|------|--------------|------|
| `ralph-kage-bunshin-start.md` | `/ralph-kage-bunshin-start` | Dimension-based project setup interview → SPEC.md + tasks.json + CLAUDE.md |
| `ralph-kage-bunshin-loop.md` | `/ralph-kage-bunshin-loop` | Worker: claim → TDD → DoD → inline verify → inline architect review → converge |
| `ralph-kage-bunshin-debug.md` | `/ralph-kage-bunshin-debug` | Debugger: root-cause diagnosis on 3+ failures, ONE fix proposal |
| `ralph-kage-bunshin-verify.md` | `/ralph-kage-bunshin-verify` | Verifier: standalone manual-use tool — independent DoD validation |
| `ralph-kage-bunshin-architect.md` | `/ralph-kage-bunshin-architect` | Architect: standalone manual-use tool — Critic-gate review, atomic convergence writes |
| `api-integration-checklist.md` | `/api-integration-checklist` | CORS/proxy decision checklist for external API integrations — called by `/ralph-kage-bunshin-start` when user mentions an external API |

### `/ralph-kage-bunshin-start` Design

The setup skill is designed by borrowing the best from two interview methodologies:

| Methodology | Source | What was borrowed |
|-------------|--------|-------------------|
| **Dimension-based gating** | [deep-interview](https://skills.sh/yeachan-heo/oh-my-claudecode/deep-interview) | Track three explicit dimensions (Goal / Constraints / Success Criteria) — proceed to spec only when all three are filled. Display dimension status after every answer. |
| **Approach comparison** | [superpowers:brainstorming](https://skills.sh/obra/superpowers/brainstorming) | When choices arise (stack, architecture), present 2-3 options with trade-offs and a recommendation rather than accepting the first answer. Full architecture comparison before spec. |

The result: structured clarity without the overhead of mathematical ambiguity scoring or multi-stage pipelines.

---

## Project Structure

```
my-project/
  .ralph/
    SPEC.md          # What to build
    tasks.json       # Task list with status, leases, dependencies
    .env             # Secrets (gitignored, 0600)
    mailbox/         # Worker-to-worker messages
    workers/
      worker-1/
        state.json   # Generation, pathology flags, DoD checklist
        PROGRESS.md  # Build log
  CLAUDE.md          # TDD rules, DoD criteria
```

---

## License

Apache 2.0
