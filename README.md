<p align="center">
  <img src="assets/ralph.jpg" alt="ralph-kage-bunshin" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="node"></a>
</p>

<h3 align="center">
  ralph-kage-bunshin (Ralph Wiggum 影分身) — orchestrate parallel Claude Code workers in tmux.<br>
  You define the spec, workers claim tasks, write tests, implement, and converge.
</h3>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#commands">Commands</a> •
  <a href="#skills">Skills</a>
</p>

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Parallel workers** | N workers claim tasks independently in tmux panes |
| **Fair task claiming** | Worker-ID offset distribution — no collision cascades when multiple workers claim simultaneously |
| **Task dependencies** | `depends_on` ensures correct ordering — workers wait automatically |
| **Agent pipeline** | Worker → Debugger (on failure) → Verify → Architect review |
| **Pathology detection** | Detects stuck patterns (stagnation, oscillation, etc.) and exits cleanly |
| **Auto-recovery** | `--watch` detects crashed workers, recycles orphaned panes, and spawns replacements in-place |
| **Clean state** | `ralph team N` cleans up stale worker directories from previous runs |
| **Lease system** | 30-min leases prevent abandoned tasks from blocking progress |
| **Git worktrees** | `isolated: true` tasks run in dedicated branches, no file conflicts |
| **Report** | Per-worker summary with task, generations, time, and token cost |

---

## Quick Start

**1. Install**
```bash
npm install -g ralph-kage-bunshin
npx skills add dididy/ralph-kage-bunshin -gy
npx skills add dididy/e2e-skills -gy
npx skills add dididy/ui-skills -gy
```
Inside Claude Code, install the fakechat plugin:
```
/plugin install fakechat@claude-plugins-official
```

Requires: **Node.js 18+**, **tmux**, **[Claude Code](https://claude.ai/code)**

**2. Set up your project**
```bash
cd my-project && claude
```
Inside Claude Code:
```
/ralph-kage-bunshin-start
```

**3. Launch**
```bash
ralph team 3
```

> `ralph team` automatically spawns an architect pane and a status pane (`ralph status --watch`) alongside the workers.

---

## How It Works

1. **Setup** — `/ralph-kage-bunshin-start` interviews you, then generates `SPEC.md`, `tasks.json`, `CLAUDE.md`
2. **Spawn** — `ralph team N` opens N worker panes + 1 architect pane + 1 status pane in tmux
3. **Work** — Each worker claims a task → writes tests → implements → refactors
4. **Converge** — Tests pass → verify acceptance criteria → architect review → mark `converged` → wake up waiting workers
5. **Wait & Wake** — Workers waiting for dependencies stay alive; when a task converges, wake signals are sent instantly via fakechat
6. **Recover** — `--watch` auto-detects stuck/crashed workers and respawns (dependency waits no longer need recovery)

Tasks support `depends_on` for ordering and `isolated: true` for git worktree isolation. All communication uses **bidirectional fakechat channels**: workers push notifications to the architect (port 8787), and converging workers wake blocked peers by posting to their fakechat ports (8788, 8789, ...). The architect pane is spawned automatically by `ralph team`.

---

## Commands

```
ralph team <n>              Spawn N workers + architect + status
ralph recover               Reset expired leases, relaunch workers
ralph status                Show worker state
ralph status --watch [N]    Live dashboard (refresh every N sec, default 30)
ralph status --no-recover   Watch without auto-recovery
ralph report                Per-worker summary with cost

ralph secrets set KEY=val   Store a secret in .ralph/.env
ralph secrets unset KEY     Remove a secret
ralph secrets list          List secret keys (values hidden)

ralph profile list          List available profiles
ralph profile apply <name>  Apply a profile
```

---

## Skills

Six skills installed via [skills.sh](https://skills.sh) (see Quick Start).

| Skill | Description |
|-------|-------------|
| `ralph-kage-bunshin-start` | Dimension-based interview → SPEC.md + tasks.json (with dependency waves) + CLAUDE.md |
| `ralph-kage-bunshin-loop` | Worker execution loop: claim → TDD → lease renewal → pathology detection → DoD → converge |
| `ralph-kage-bunshin-debug` | Root-cause diagnosis on 3+ failures — file:line evidence, ONE fix proposal, read-only |
| `ralph-kage-bunshin-verify` | Read-only acceptance-criteria validation — PASS/FAIL/INCOMPLETE verdict, no state changes |
| `ralph-kage-bunshin-architect` | Approval authority — spec compliance, steelman review, atomic converged state writes |
| `api-integration-checklist` | Pre-coding API integration check — CORS, auth, rate limits, proxy decision |

Each skill includes behavioral evals (`evals/evals.json`) and trigger evals (`evals/trigger-eval.json`) compatible with [skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md).

---

## Project Structure

```
.ralph/
  SPEC.md           What to build
  tasks.json        Task list with status, leases, dependencies
  .env              Secrets (gitignored, mode 0600)
  workers/
    worker-N/
      state.json    Generation, pathology flags, cost
      PROGRESS.md   Build log

CLAUDE.md             TDD rules, DoD criteria
```

---

## License

Apache 2.0
