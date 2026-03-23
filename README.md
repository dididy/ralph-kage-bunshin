<p align="center">
  <img src="assets/ralph.jpg" alt="ralph-kage-bunshin" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="node"></a>
</p>

<h3 align="center">
  ralph-kage-bunshin (Ralph Wiggum 影分身) — you design, agents forge through the night.<br>
  A watcher orchestrates parallel Claude Code workers in tmux: assigns tasks, reviews code, recovers from failures — all autonomously.
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
| **Watcher orchestrator** | Central Claude session manages all task assignment, worker lifecycle, and health monitoring |
| **Dynamic scaling** | Only activates worker panes when parallel tasks exist — idle panes = zero tokens |
| **Fresh sessions** | Every task assignment starts a new Claude session — no context pollution |
| **Task dependencies** | `depends_on` ensures correct ordering — watcher evaluates the dependency graph |
| **Agent pipeline** | Watcher → Worker → Debugger (on failure) → Architect review |
| **Visual regression** | Automated screenshot comparison between reference site and clone via `agent-browser` — blocks convergence on mismatch |
| **Skill artifacts** | Physical measurement files required to prove `/ui-reverse-engineering` and `/transition-reverse-engineering` were actually invoked |
| **Pathology detection** | Detects stuck patterns (stagnation, oscillation, etc.) and exits cleanly |
| **Auto-recovery** | Watcher monitors worker health, resets stuck tasks, and respawns workers |
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

Requires: **Node.js 18+**, **tmux**, **[Claude Code](https://claude.ai/code)**, **[Channels](https://code.claude.com/docs/en/channels)** (v2.1.80+)

> Workers and the watcher communicate via [Claude Code Channels](https://code.claude.com/docs/en/channels) using the [fakechat plugin](https://code.claude.com/docs/en/channels#quickstart).

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

> `ralph team` spawns N empty worker panes + 1 watcher Claude session. The watcher assigns tasks to workers dynamically.

---

## How It Works

1. **Setup** — `/ralph-kage-bunshin-start` interviews you, then generates `SPEC.md`, `tasks.json`, `CLAUDE.md`
2. **Spawn** — `ralph team N` opens N empty worker panes + 1 watcher Claude pane in tmux
3. **Assign** — The watcher evaluates the dependency graph and launches Claude sessions on worker panes for claimable tasks
4. **Work** — Each worker implements its assigned task via TDD → reports `[DONE]` → exits
5. **Review** — Watcher spawns an architect on the same pane to review → `[APPROVED]` or `[REJECTED]`
6. **Repeat** — On approval, watcher assigns the next claimable task. On rejection, respawns the worker. On 3+ failures, spawns a debugger.
7. **Complete** — When all tasks are converged, watcher sends a macOS notification and prints a summary.

Tasks support `depends_on` for ordering and `isolated: true` for git worktree isolation. Workers communicate with the watcher via **[Channels](https://code.claude.com/docs/en/channels)** using [fakechat](https://code.claude.com/docs/en/channels#quickstart) (port 8787). Every task assignment, architect review, and debugger invocation starts a fresh Claude session — no context pollution.

---

## Commands

```
ralph team <n>              Spawn N worker panes + watcher
ralph recover               Reset expired leases, relaunch watcher
ralph status                Show worker state (one-shot)
ralph report                Per-worker summary with cost

ralph secrets set KEY=val   Store a secret in .ralph/.env
ralph secrets unset KEY     Remove a secret
ralph secrets list          List secret keys (values hidden)

ralph profile list          List available profiles
ralph profile apply <name>  Apply a profile
```

---

## Skills

Seven skills installed via [skills.sh](https://skills.sh) (see Quick Start).

| Skill | Description |
|-------|-------------|
| `ralph-kage-bunshin-start` | Dimension-based interview → SPEC.md + tasks.json (with dependency waves) + CLAUDE.md |
| `ralph-kage-bunshin-watcher` | Central orchestrator — task assignment, worker lifecycle, architect/debugger spawning, health monitoring |
| `ralph-kage-bunshin-loop` | Worker execution loop: receive task → TDD → DoD → report result → exit |
| `ralph-kage-bunshin-debug` | Root-cause diagnosis on 3+ failures — file:line evidence, ONE fix proposal, read-only |
| `ralph-kage-bunshin-verify` | Read-only acceptance-criteria validation — PASS/FAIL/INCOMPLETE verdict, no state changes |
| `ralph-kage-bunshin-architect` | Approval authority — spec compliance, steelman review, reports verdict to watcher |
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
      state.json              Generation, pathology flags, cost
      PROGRESS.md             Build log
      ui-measurements.json    Skill artifact (if UI task)
      transition-measurements.json  Skill artifact (if animation task)
      visual-regression.json  Screenshot comparison verdicts
      reference-screenshots/  Reference site screenshots
      clone-screenshots/      Clone site screenshots

CLAUDE.md             TDD rules, DoD criteria
```

---

## License

Apache 2.0
