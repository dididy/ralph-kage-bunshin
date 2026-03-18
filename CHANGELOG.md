# Changelog

All notable changes to this project will be documented in this file.

## [0.1.4] - 2026-03-19

### Added
- `ralph team N` now automatically adds a status `--watch` pane so stuck workers are detected without external monitoring
- `ralph recover` and `ralph status --watch` now reset stuck tasks (workers with `updated_at` > 10 min) in addition to expired leases
- `/api-integration-checklist` skill — 9-step external API integration checklist (CORS/preflight check, response + error format, security, proxy decision, pagination, rate limits, type safety, mock strategy, env vars). Called automatically by `/ralph-kage-bunshin-start` when user mentions an external API.

### Changed
- `/ralph-kage-bunshin-loop` — Verifier + Architect logic inlined directly into loop skill; workers no longer stop after sub-skill returns
- `/ralph-kage-bunshin-verify` and `/ralph-kage-bunshin-architect` now documented as standalone manual-use tools, not automated pipeline steps
- `/ralph-kage-bunshin-start` — runs `/api-integration-checklist` when external API is mentioned before confirming stack; references `vercel-react-best-practices` when React/Next.js is in the stack
- README: How It Works, Agent Roles, Key Features, Worker Loop, and Skills table updated to reflect inline verify + architect

### Fixed
- Workers that finish all tasks but find others in-progress now call `ralph recover` before exiting, unblocking any stuck peers
- All test descriptions translated to English (13 test files)
- `Task` interface now includes optional `description` field — aligns type with skill requirement
- `loop` skill: DoD checklist now set to `true` only after architect APPROVED, not before verification — fixes premature checklist write
- `loop` skill: convergence step numbering corrected (was 1-7 with gap, now 1-6 sequential)
- `verify` + `architect` skills: reframed as standalone manual-use tools (not auto-called by loop)
- `loop` skill: external skill dependencies documented at top; E2E script detection clarified (Playwright vs Vitest)
- `architect` skill: pre-existing `architect_review` field treated as "review independently" not "reject outright"
- `claimTask`: worker ID now coerced to `Number` on write — prevents string/number type mismatch in tasks.json
- `renewLease`, `resetStuckTasks`: worker ID comparison coerced to `Number` — consistent with claim behavior
- `loop` skill: claim verification now explicitly requires numeric comparison (`Number(task.worker) === Number(workerId)`) and bans any file writes before verification passes
- `loop` skill: lease renewal now requires calculated timestamp (`new Date(Date.now() + 5*60*1000).toISOString()`) — hand-typed ISO values prohibited
- `/ralph-kage-bunshin-loop` — strengthened claim verification: mandatory 1-second wait + re-read + strict worker ID check before proceeding; workers that lose the race stop immediately instead of continuing in parallel
- `/ralph-kage-bunshin-loop` — `renewLease` clarified: workers update `lease_expires_at` directly in `.ralph/tasks.json` (no CLI command needed)
- `/ralph-kage-bunshin-loop` — `worker-N` substitution rule now explicitly stated at session start

## [0.1.3] - 2026-03-18

### Fixed
- `install-skills` now installs each skill as `<name>/SKILL.md` directory structure so Claude Code discovers them correctly via `/` command

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
