# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2026-03-18

### Fixed
- Added YAML frontmatter to all skill files so Claude Code discovers and lists them correctly

## [0.1.1] - 2026-03-17

### Added
- `/ralph-kage-bunshin-debug` — Debugger agent: called on 3+ consecutive failures, diagnoses root cause with file:line evidence, proposes ONE fix, writes `debug_session` to `state.json`
- `/ralph-kage-bunshin-verify` — Verifier agent: independently re-runs tests and checks every acceptance criterion after DoD passes, returns PASS / FAIL / INCOMPLETE before Architect is called

### Changed
- `/ralph-kage-bunshin-loop` — Worker now routes to Debugger on stagnation instead of simply breaking tasks; calls Verifier after DoD before calling Architect; PROGRESS.md adds `learnings` field per generation
- `/ralph-kage-bunshin-architect` — Added Critic gate: steelmans the implementation before approving (actively looks for strongest rejection reason); rejects if an unresolved low-confidence `debug_session` exists in `state.json`
- `/ralph-kage-bunshin-start` — Redesigned as dimension-based interview (Goal / Constraints / Success Criteria); tracks dimension completion status after every answer; presents 2-3 options with trade-offs when stack choices arise; Phase 3 is now a confirmation step, not a repeat comparison; task granularity rules and E2E assignment restored; Phase 6 merged into Phase 5

### Skills
- `/ralph-kage-bunshin-debug` — Debugger agent (root-cause diagnosis, read-only)
- `/ralph-kage-bunshin-verify` — Verifier agent (independent DoD validation, read-only)

## [0.1.0] - 2026-03-16

### Added
- `ralph team <n>` — spawn N tmux workers, each running Claude with `/ralph-kage-bunshin-loop`
- `ralph recover` — reset expired task leases and relaunch workers for pending tasks
- `ralph status` / `ralph status --watch` — live worker dashboard with auto-recovery
- `ralph status --messages` — view worker-to-worker mailbox messages
- `ralph install-skills` — copy skill files to `~/.claude/skills/` with overwrite prompts
- `ralph install-skills --force` — overwrite existing skills without prompting
- `ralph secrets set/unset/list` — manage per-project secrets in `.ralph/.env` (mode 0600)
- `ralph profile list/apply` — reusable project config presets via `~/.ralph/profiles/`
- Task lease system — 5-minute leases with automatic expiry detection and re-queue
- Task dependency system — `depends_on: [N, M]` blocks claim until deps are `converged`
- Git worktree isolation — `isolated: true` tasks run on dedicated branches (`feat/worker-N-<slug>`)
- Architect review gate — `/ralph-kage-bunshin-architect` reviews implementation against spec before converging
- Worker mailbox — file-based messaging via `.ralph/mailbox/`
- Pathology detection — stagnation, oscillation, wonder-loop detection with automatic worker exit
- macOS, Slack, Discord notifications on convergence and pathology
- `ralph status --watch` auto-recovery of expired leases

### Skills
- `/ralph-kage-bunshin-start` — project setup interview → `SPEC.md` + `tasks.json` + `CLAUDE.md`
- `/ralph-kage-bunshin-loop` — worker loop: claim → TDD → DoD → architect review → converge
- `/ralph-kage-bunshin-architect` — architect review gate with atomic convergence writes
