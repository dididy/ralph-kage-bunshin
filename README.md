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
| **Lease system** | 5-min leases prevent abandoned tasks from blocking progress |
| **Architect review** | Every task reviewed against spec before marking converged |
| **Worker mailbox** | File-based messaging between workers via `.ralph/mailbox/` |
| **Pathology detection** | Stagnation, oscillation, wonder-loop — workers self-detect and exit cleanly |
| **Auto-recovery** | `--watch` mode detects and recovers crashed workers automatically |
| **Secrets** | `.ralph/.env` with `0600` permissions, auto-sourced on worker startup |
| **Profiles** | Reusable config presets via `~/.ralph/profiles/` |

---

## How It Works

1. **`/ralph-kage-bunshin-start`** — Interview skill that generates `.ralph/SPEC.md`, `.ralph/tasks.json`, and `CLAUDE.md`
2. **`ralph team N`** — Spawns N tmux panes, each running Claude with `/ralph-kage-bunshin-loop`
3. **Worker loop** — Each worker claims the lowest-ID pending task, writes tests first, implements, checks DoD, then calls `/ralph-kage-bunshin-architect` for review
4. **Architect gate** — Reviews implementation against the spec. APPROVED writes `converged: true` atomically. REJECTED sends the worker back with specific notes.
5. **Lease system** — Tasks have a 5-minute lease. Crashed workers are auto-detected and tasks re-queued.
6. **Auto-recovery** — `ralph status --watch` automatically calls `ralph recover` when expired leases are detected.

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

Each worker follows a strict TDD loop:
1. Claim lowest-ID pending task (with lease)
2. Read spec, mailbox, and own state
3. Write failing test → implement → pass test
4. Renew lease, run DoD checks (`npm test`, `npm run build`, E2E)
5. Call `/ralph-kage-bunshin-architect` for review
6. On APPROVED: converge, send mailbox message, claim next task

### Architect Review

The architect reads `.ralph/SPEC.md` and reviews the implementation against done criteria. It writes `converged: true` atomically into both `state.json` and `tasks.json` — the worker never writes its own convergence status.

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
| Stagnation | 3+ consecutive failures | Break task into smaller pieces |
| Oscillation | `fail,pass,fail,pass` in last 4 results | Lock decision in CLAUDE.md |
| WonderLoop | Same approach tried 3+ times | Choose different method |

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

ralph install-skills          Copy skills to ~/.claude/skills/
ralph install-skills --force  Overwrite without prompting

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

Installs three skills to `~/.claude/skills/`:

| File | Slash Command | Role |
|------|--------------|------|
| `ralph-kage-bunshin-start.md` | `/ralph-kage-bunshin-start` | Project setup interview → SPEC.md + tasks.json + CLAUDE.md |
| `ralph-kage-bunshin-loop.md` | `/ralph-kage-bunshin-loop` | Worker loop: claim → TDD → DoD → architect review → converge |
| `ralph-kage-bunshin-architect.md` | `/ralph-kage-bunshin-architect` | Architect review gate (called by workers on convergence) |

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
