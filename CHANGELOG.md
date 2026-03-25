# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] - 2026-03-25

### Changed
- **`/ralph-kage-bunshin-loop` evals** — 4 eval updates + 4 new evals (52 total, was 48):
  - **Updated** loop-44/45/46: visual regression evals now test `/ui-capture` skill invocation instead of direct `agent-browser` usage, matching the v0.2.1 SKILL.md change
  - **New** loop-49: worker applies `debug_session.proposed_fix` as first action when present in state.json
  - **New** loop-50: worker reads `architect_review.notes` and addresses listed gaps when `status: "rejected"` found in state.json
  - **New** loop-51: worker immediately broadcasts critical discoveries (wrong API, broken assumptions) to watcher via curl POST without waiting for convergence
  - **New** loop-52: isolated task with no remote merges into base branch instead of pushing; logs skip reason in PROGRESS.md

## [0.2.1] - 2026-03-24

### Changed
- **`/ui-capture` skill integration** — Clone project analysis in `/ralph-kage-bunshin-start` and visual regression in `/ralph-kage-bunshin-loop` now delegate to `/ui-capture` instead of using `agent-browser` directly. `/ui-capture` provides structured baseline assets (full-page screenshots, scroll/hover/cursor-reactive transition videos, `regions.json`) that feed directly into task scoping and architect review.
- **`/ralph-kage-bunshin-start`** — Clone project pre-analysis rewritten: checks `ffmpeg` dependency, invokes `/ui-capture <url>` for Phase 1 (full page capture) + Phase 2 (transition detection), serves comparison page for user confirmation, uses confirmed `regions.json` to scope tasks with specific scroll ranges and transition types.
- **`/ralph-kage-bunshin-loop`** — Visual regression step now invokes `/ui-capture <reference-url> <localhost-url>` to generate comparison page instead of manually screenshotting reference and clone sites. Added `/ui-capture` to skill dependencies.
- **README** — Added "Why two communication paths?" section explaining Watcher→Worker (`tmux send-keys`) vs Worker→Watcher (`fakechat`) design rationale.

## [0.2.0] - 2026-03-23

### Added
- **Watcher-centric architecture** — `ralph team N` now spawns a central watcher Claude session that orchestrates all task assignment, worker lifecycle, architect/debugger spawning, and health monitoring. Replaces the decentralized worker-driven model where workers independently claimed tasks.
- **`/ralph-kage-bunshin-watcher` skill** — Central orchestrator: reads dependency graph, assigns tasks to worker panes via `sendKeys`, handles `[DONE]`/`[FAIL]`/`[PATHOLOGY]`/`[APPROVED]`/`[REJECTED]`/`[DIAGNOSIS]` messages, performs 60-second health checks, and detects completion.
- **Dynamic worker scaling** — Only activates worker panes when parallel tasks are available. Setup task uses 1 worker; wave 2 with 3 tasks activates 3 workers. Idle panes = empty shell = zero tokens.
- **Fresh Claude sessions** — Every task assignment, architect review, and debugger invocation starts a new Claude session on the target pane. No context pollution between tasks.
- **`prepareWorkerPanes()`** — New function in `team.ts` that sets up worker pane environment variables without launching Claude. The watcher launches Claude sessions on-demand.

### Removed
- **`ralph status --watch`** — Watcher handles all monitoring; `ralph status` is now a one-shot status display.
- **Worker task claiming** — Workers no longer read/write `tasks.json`. The watcher is the sole writer.
- **Worker lease renewal** — Watcher manages leases; workers don't renew.
- **Worker dependency checking** — Watcher evaluates the dependency graph and only assigns claimable tasks.
- **Inline architect review (Phase 2)** — Workers report `[DONE]` and exit; watcher spawns a separate architect session.
- **Worker wake signals** — Workers no longer broadcast `[WAKE]` to peers; watcher handles task flow.
- **Complex pane recycling in recover** — Simplified to delegate to running watcher or spawn a fresh watcher session.
- **Notification logic from `printStatus`** — Watcher sends notifications directly.
- **`notify.ts`** — Merged `getFakechatPort()` into `config.ts`; removed `notify()`, `postWebhook()`, `isValidHttpsUrl()` (watcher handles notifications directly).
- **Dead worker-claiming code** — Removed `claimTask()`, `renewLease()`, `getClaimableTasks()`, `warnMissingDependencies()`, `LEASE_DURATION_MS` from `state.ts`. Removed `launchWorkers()`, `launchWorkersOnPanes()`, `WORKER_FAKECHAT_BASE_PORT`, `getWorkerFakechatPort()` from `team.ts`.
- **Dead utilities** — Removed `sleepSync()`, `sendRawKeys()`, `findWatcherPane()` from `tmux.ts`; `saveConfig()` from `config.ts`; `stopCaffeinate()` from `caffeinate.ts`; `updateTaskStatus()` from `state.ts`.
- **`leaseDurationMs` config field** — Removed from `RalphConfig` type and config validation (was only used by removed `claimTask`/`renewLease`).

### Changed
- **`ralph team N`** — Spawns N empty shell worker panes + 1 watcher Claude pane (was N worker Claude panes + 1 architect pane). Watcher pane title: `ralph-watcher`.
- **`/ralph-kage-bunshin-loop`** — Massively simplified. New flow: read `$RALPH_TASK_ID` env var → implement via TDD → DoD Phase 1 → report `[DONE]`/`[FAIL]`/`[PATHOLOGY]` via fakechat → exit. Worker does not write to `tasks.json`.
- **`/ralph-kage-bunshin-architect`** — No longer includes health monitoring. Reports `[APPROVED]`/`[REJECTED]` to watcher via fakechat then exits. Watcher handles all state updates.
- **`/ralph-kage-bunshin-debug`** — Input changed from worker-provided to environment variables (`$RALPH_WORKER_ID`, `$RALPH_TASK_ID`, `$RALPH_PROJECT_DIR`). Reports `[DIAGNOSIS]` to watcher via fakechat then exits.
- **`ralph recover`** — Simplified: resets expired/stuck tasks, then either delegates to running watcher session or spawns a fresh watcher + worker pane setup.
- **`ralph status`** — One-shot display only; removed `--watch` option, notification logic, and lease/stuck reset (watcher handles these).
- **Plugin count** — 7 skills (was 6). Added `ralph-kage-bunshin-watcher`.

## [0.1.9] - 2026-03-23

### Removed
- **Status pane** — `ralph team N` no longer spawns a dedicated status pane. Pane count reduced from N+2 to N+1 (workers + architect only). The polling-based recovery loop was redundant with the architect's real-time fakechat monitoring.
- **`ralph status --no-recover`** — auto-recovery has moved to the architect session; the flag is no longer applicable.
- **`findStatusPane()`** — removed from `tmux.ts` along with tests; no longer needed after status pane removal.

### Changed
- **Architect skill gains health monitoring** — `/ralph-kage-bunshin-architect` now includes a Health Monitoring section: handles `[PATHOLOGY]`/`[CONVERGED]` messages, proactively checks for stuck tasks after 5 minutes of silence, and respawns workers on idle tmux panes.
- **Eval coverage** — `ralph-kage-bunshin-architect`: 28 behavioral evals (was 24). New evals cover health monitoring: pathology reset+respawn, all-converged detection, proactive stuck check, expired lease reset.

### Fixed
- **Worker ID reuse in recover** — `ralph recover` previously assigned monotonically increasing worker IDs (`maxExistingId + 1`), causing pane count to grow from 3 to 9+ across multiple recovery cycles. Now reuses the smallest available IDs not held by active in-progress workers (e.g. workers 1,2,3 → worker 2 stuck → recover reuses worker 2 instead of spawning worker 4).

## [0.1.8] - 2026-03-23

### Added
- **Visual regression hard gate** — Convergence loop now requires automated visual comparison between reference site and clone via `agent-browser` screenshots. Workers must produce `.ralph/workers/worker-N/visual-regression.json` with per-section verdicts and `overall_verdict: "pass"` before converging. Graceful skip when `agent-browser` is genuinely unavailable.
- **Skill artifact hard gate** — Tasks requiring `/ui-reverse-engineering` or `/transition-reverse-engineering` must produce physical artifact files (`ui-measurements.json`, `transition-measurements.json`) in the worker directory. Both PROGRESS.md `used_skills:` entry AND artifact file must exist — self-declared skill invocation without artifacts blocks convergence.
- **Rubber-stamp detection** — Architect review now cross-checks `visual-regression.json` `overall_verdict` against per-section verdicts. Contradictions (e.g. `overall_verdict: "pass"` with failing sections) trigger rejection.
- `dod_checklist.visual_regression` and `dod_checklist.skill_artifacts` — optional boolean fields added to `WorkerState` type for tracking new convergence gates.
- **Architect pane in `ralph team`** — `ralph team N` now automatically spawns an architect pane with `claude --channels plugin:fakechat@claude-plugins-official`, eliminating the need to open a separate terminal. Recovery (`recover.ts`) excludes the architect pane from recyclable worker panes via `findArchitectPane()`.
- Quick Start simplified — removed separate "Open architect session" step from README since `ralph team` now handles it.
- fakechat plugin install instruction added to Quick Start.
- **Eval coverage expanded** — 183 behavioral + 71 trigger = 254 total evals (was 166 + 69 = 235). New evals cover skill artifact creation/validation, visual regression workflow, rubber-stamp detection, and graceful agent-browser skip.
  - `ralph-kage-bunshin-loop`: 60 behavioral + 13 trigger (was 50 + 11)
  - `ralph-kage-bunshin-architect`: 24 behavioral + 12 trigger (was 20 + 12)
  - `ralph-kage-bunshin-verify`: 21 behavioral + 11 trigger (was 18 + 11)
- `fakechat_port` config option (`~/.ralph/config.json` → `notifications.fakechat_port`) for non-standard port. Falls back to `FAKECHAT_PORT` env var, then `8787`.
- `getFakechatPort()` exported from `notify.ts` for consistent port resolution across the codebase.
- `/ralph-kage-bunshin-loop` — workers now `curl POST localhost:8787/upload` on convergence and critical discoveries instead of writing mailbox files.
- `external_service_block` pathology type added to `WorkerState` type — matches SKILL.md contract for ExternalServiceBlock detection.
- Security hardening across all skill files — credential safety for state.json, indirect prompt injection mitigation for agent-browser captures, external response handling for curl, `RALPH_AUTO_PUSH` gate for autonomous push/PR operations.
- Dead code removed — `src/core/worktree.ts` (3 exported functions never imported anywhere).
- Config validation — 24-hour upper bound enforced for `leaseDurationMs` and `stuckThresholdMs`.
- `--watch` interval validation — rejects floats (`Number.isInteger`), not just NaN.
- **Bidirectional fakechat channels** — Every worker now launches with its own fakechat channel (`--channels plugin:fakechat`, port 8788+N). When a task converges, the worker broadcasts `[WAKE]` signals to all other workers' fakechat ports, enabling instant dependency wake-up without `ralph recover`. Workers enter wait mode instead of exiting when no claimable tasks exist.
- `WorkerState.fakechat_port` — records each worker's fakechat port in state.json so other participants can discover and POST to it.
- `/ralph-kage-bunshin-loop` — wait mode: workers stay alive when blocked on dependencies, wake up instantly via fakechat signal. Convergence step now broadcasts to all peer workers. All architect-directed notifications use hardcoded port 8787 (not `$FAKECHAT_PORT` which is now the worker's own port).

### Removed
- **Mailbox system** — `src/core/mailbox.ts`, `ralph status --messages` CLI command, and all mailbox file I/O. Workers communicate via fakechat channel push instead.
- **`notify()` fakechat posting** — `notify()` no longer posts to fakechat (workers do this directly via curl). Retains macOS, Slack, and Discord webhook support.

### Changed
- **Architect pane runs with `--dangerously-skip-permissions`** — architect session previously launched without permission bypass, causing MCP tool calls (e.g. fakechat reply) to prompt for user approval and block autonomous operation. Now matches worker sessions.
- `/ralph-kage-bunshin-loop` — Phase 1 (DoD) now enforces two new hard gates: skill artifact file existence + visual regression pass. Phase 2 (architect review) independently verifies both artifacts and visual comparison honesty.
- `/ralph-kage-bunshin-verify` — report format expanded with Skill Artifacts and Visual Regression sections; PASS verdict now requires artifacts present + visual regression passed (when applicable).
- `/ralph-kage-bunshin-architect` — replaced generic "runtime visual verification" with structured skill artifact verification and visual regression verification hard gates; added honesty check for rubber-stamped verdicts.
- **Channel-based notifications** — Workers now push real-time events (convergence, pathology, broadcasts) directly to architect session via [Claude Code Channels](https://code.claude.com/docs/en/channels) ([fakechat](https://code.claude.com/docs/en/channels#quickstart)). File-based mailbox system removed entirely.
- **`status --watch` role clarified** — `status --watch` retains macOS/Slack/Discord notifications for convergence and pathology events (user-facing). Fakechat notifications are worker-owned (pushed directly via curl), preventing duplication. Default polling interval changed from 5s to 30s.
- **`fakechat_channel` config removed** — Replaced by `fakechat_port` (optional). Workers use `$FAKECHAT_PORT` env var (written to `.env` by `ralph team`).
- `recover.ts` — pane recycling rewritten as 3-phase process: (1) terminate orphaned workers via `sendRawKeys` + `sendKeys`, (2) kill terminated panes in reverse index order to prevent index shifting, (3) split fresh panes and launch new workers. Explicit `paneToWorkerId` mapping replaces fragile `findIndex` lookup.

### Fixed
- **Orphaned worker pane accumulation** — `ralph recover` previously failed to detect and recycle orphaned worker panes (Claude still running but task reset to pending by expire/stuck detection). This caused pane count to grow with each recovery cycle (e.g. 4 → 6 → 8 panes) while orphaned workers continued working on tasks they no longer owned, leading to race conditions. Recovery now detects orphaned panes by comparing pane titles against active task assignments, terminates them (`Ctrl+C` → `exit`), and recycles the pane for the new worker.
- **Stale worker directory cleanup** — `ralph team N` now removes worker directories with IDs > N from previous runs. Previously, `ralph team 4` after `ralph team 5` left `worker-5/state.json` as a ghost, causing wake signals to dead ports and preventing clean state. Cleanup runs AFTER `killSession` to prevent write conflicts with still-running workers.
- **Stale worker cleanup in recover** — `ralph recover` now also cleans up stale worker directories after spawning new workers (both existing session and fallback session paths).
- **Task claiming fairness** — Workers now pick tasks using worker-ID offset (`(workerID - 1) % claimableCount`) instead of all racing for the lowest ID. When 4 workers simultaneously claim 4 tasks, each selects a different task, eliminating collision cascades from the 1-second optimistic concurrency window.
- **`consecutive_failures` validation** — Added to `WORKER_STATE_REQUIRED_FIELDS` in `readWorkerState`. Previously a state.json missing this field passed validation, potentially causing `undefined` arithmetic downstream.
- **Initial worker state consistency** — `createInitialWorkerState` now includes `external_service_block: false` in pathology, `approach_history: []`, and `visual_regression: false` + `skill_artifacts: false` in `dod_checklist`, matching the SKILL.md template contract.
- **Elapsed time drift** — `ralph status` and `ralph report` computed elapsed time from `state.started_at`, which was reset whenever `initWorkerState` was called (recovery, worker restart). Elapsed now uses `task.claimed_at` from tasks.json as primary source (immutable after claim), falling back to `state.started_at` only if `claimed_at` is unavailable.
- **initWorkerState overwrites started_at on recovery** — added `preserveStartedAt` option to `initWorkerState()`. Recovery now passes `{ preserveStartedAt: true }` to retain the original timestamp when recycling a worker.
- **Stale pane indices after kill** — tmux renumbers pane indices after `kill-pane`, but idle pane indices were stored before kills, causing launches on non-existent panes. Idle panes are now re-scanned by command detection after all kills complete.
- **`recover.ts` orphaned worker termination** — failed `exit` command now logs warning instead of silently failing; `FAKECHAT_PORT` written to `.env` on recovery (same as `team.ts`).

## [0.1.7] - 2026-03-21

### Fixed
- **Worker proliferation** — `ralph recover` previously spawned one worker per pending task, ignoring dependency status and active workers. With 12 tasks and cascading recovery cycles, this caused 5 initial workers to balloon to 25+, exhausting system memory (kernel panic). Recovery now spawns `max(0, claimable - active)` workers only.

### Added
- **Eval framework** — skill-creator compatible behavioral evals and trigger evals for all 6 skills (166 behavioral + 69 trigger = 235 test cases total)
  - `ralph-kage-bunshin-start`: 37 behavioral + 13 trigger evals
  - `ralph-kage-bunshin-loop`: 50 behavioral + 11 trigger evals
  - `ralph-kage-bunshin-architect`: 20 behavioral + 12 trigger evals
  - `ralph-kage-bunshin-debug`: 17 behavioral + 11 trigger evals
  - `ralph-kage-bunshin-verify`: 18 behavioral + 11 trigger evals
  - `api-integration-checklist`: 24 behavioral + 11 trigger evals
- `ralph report` — per-worker summary showing task name, generations, elapsed time, convergence status, architect review, and token-based cost (input/output tokens, USD). Aggregates total cost across all workers.
- `WorkerState.cost` — optional field for tracking per-worker token usage and estimated cost (`total_usd`, `total_input_tokens`, `total_output_tokens`, `api_duration_ms`)
- `.claude-plugin/plugin.json` + `marketplace.json` — enables `npx skills add dididy/ralph-kage-bunshin` for skills.sh marketplace installation
- Skills directory restructured from `skills/<name>.md` to `skills/<name>/SKILL.md` — standard format for `npx skills` compatibility

### Removed
- `ralph install-skills` command — replaced by `npx skills add dididy/ralph-kage-bunshin -gy`; companion skills installed separately via `npx skills add dididy/e2e-skills -gy` and `npx skills add dididy/ui-skills -gy`

### Changed
- **Skill descriptions optimized** — all 6 skill descriptions rewritten for precise triggering (reduces false positives between similar skills like architect vs verify)
- `ralph team N` — workers launched with named sessions (`claude -n "ralph-worker-N"`) enabling future `--resume` for context preservation across recovery cycles
- `ralph recover` — workers launched with named sessions (`claude -n "ralph-worker-N"`) consistent with `team`
- `recover.test.ts` — rewritten to test claimable-based spawning: verifies blocked tasks don't trigger workers, active workers are subtracted from needed count, and dependency-gated tasks are correctly excluded
- `team.test.ts` — updated to verify session naming flag (`-n "ralph-worker-N"`) in claude launch command
- `/ralph-kage-bunshin-start` — UI clone projects now require `agent-browser` site analysis before interview; pre-fills Goal dimension from observed site structure; added: ONE-AT-A-TIME enforcement in all 3 dimensions, Goal-before-Constraints gate, self-contained task description requirement, isolated flag rule of thumb, anti-pattern for lumped E2E tasks
- `/ralph-kage-bunshin-loop` — `agent-browser` availability check added before visual verification step; added: `sleep 1` race-condition note, HARD RULE for no-repeat learnings, two-renewal-per-generation minimum, loop invariant for exits, broadcast timing urgency, mandatory 5-field PROGRESS.md
- `/ralph-kage-bunshin-debug` — `agent-browser` installation check added before browser-based debugging; added: read-ALL-before-hypothesis rule, upstream null cause guidance, `next_diagnostic_step` for low confidence, 2-file threshold
- `/ralph-kage-bunshin-architect` — animation/transition tasks now require multi-point measurement evidence; hardcoded values without measurement → REJECT; added: BLOCKING pre-check emphasis, open-every-touched-file rule, steelman question checklist, no code snippets in rejections
- `/ralph-kage-bunshin-verify` — added: E2E detection keywords, INCOMPLETE-is-not-soft-PASS, structured gap format with example
- `/api-integration-checklist` — description clarified for design-time use before coding
- README simplified — merged hero taglines, trimmed Key Features descriptions, consolidated How It Works steps, simplified Skills table, removed duplicate install commands

## [0.1.6] - 2026-03-20

### Changed
- Lease duration increased from 5 minutes to 30 minutes — reduces premature lease expiry for longer tasks
- `/ralph-kage-bunshin-loop` — worktree setup now gracefully skips when project is not a git repo (no `.git` directory) instead of failing; logs "worktree skipped: not a git repo" in PROGRESS.md
- `/ralph-kage-bunshin-architect` — runtime visual check now accepts `agent-browser unavailable` as valid skip reason instead of hard-rejecting
- `/ralph-kage-bunshin-loop` — MANDATORY skill invocation check: tasks with `/ui-reverse-engineering` or `/transition-reverse-engineering` in description must invoke those skills before implementation; convergence gate now enforces this
- `/ralph-kage-bunshin-loop` — new rule: read external library source before modifying code that calls it; do not assume behavior from API name alone
- `/ralph-kage-bunshin-loop` — new rule: verify visual/animation changes in browser after each atomic change, not in batch
- `/ralph-kage-bunshin-start` — UI clone tasks now require `/ui-reverse-engineering` in task description; animation tasks also require `/transition-reverse-engineering`
- `ralph team N` — workers launched with `claude -p` (print mode) for cleaner output

### Fixed
- `ralph recover` — idle shell panes (worker exited, shell remains) now detected and recycled via `getPaneCommands()` instead of relying on converged state alone
- `ralph recover` — excess idle panes cleaned up before recycling; prevents pane accumulation across multiple recovery cycles
- `ralph recover` — worker state initialized (`initWorkerState`) before launching recovered workers; prevents stale state from previous worker

### Added
- `tmux.ts` — `getPaneCommands()`, `findIdlePanes()`, `findStatusPane()`, `getPaneTitles()`, `setPaneTitle()` utilities for reliable pane identification
- `state.ts` — `createInitialWorkerState()` and `initWorkerState()` extracted as shared helpers; eliminates duplicate initialization in `team.ts` and `recover.ts`
- `findStatusPane` now identifies status pane by title (`ralph-status`) with command-based fallback for backward compatibility
- `cleanupIdlePanes` kills panes in reverse index order to prevent index shift during cleanup
- `recover` logs a warning when `getActivePaneIndex` returns null after split instead of silently skipping

## [0.1.5] - 2026-03-19

### Added
- `/api-integration-checklist` — Step 0: verify every documented endpoint with real curl before writing any code; catches mis-documented parameter names (e.g. `?id=` vs `?i=`) before implementation starts
- `install-skills` — now also installs `dididy/ui-skills` alongside `dididy/e2e-skills`
- `install-skills` — overwrites existing skills by default (no prompt); use `--no-overwrite` to skip existing files

### Fixed
- `ralph team N` — status pane now uses `listPanes()` to resolve actual last pane index after `applyLayout('tiled')` reorders panes; previously `ralph status --watch` was sent to wrong pane and never ran
- `ralph team N` — `applyLayout('tiled')` now called once after all worker splits instead of after each split; eliminates pane index drift
- `ralph team N` — `launchWorkers` now throws if pane count is less than worker count instead of silently sending keys to `undefined`
- `ralph team N` — `runTeam` now throws if tmux reports fewer panes than expected after layout, preventing `statusPaneIdx` from being `undefined`
- Robustness: `readTasks` now validates `task.name` is a string in addition to `id`, `status`, `worker`, and `depends_on`
- Robustness: `profile.apply` now rejects empty strings in `initial_structure` (previously resolved to project root silently)
- Robustness: `profile.list` now validates profile structure before returning; malformed profile files are skipped with a warning instead of being cast blindly
- Robustness: `mailbox.listMessages` now validates each message against `MailboxMessage` schema before use; invalid files are skipped with a warning
- Robustness: `recover.existingWorkerIds` filter uses `typeof w === 'number'` instead of `w !== null` — prevents NaN from corrupted worker fields propagating into `Math.max`
- Robustness: `findRecyclablePanes` returns early if session has fewer than 2 panes
- `ralph recover` — recovered workers now spawn in the **original session** by recycling idle (converged + no active task) panes instead of creating a separate `-recover` session; active panes are never killed
- `ralph recover` — worker-to-pane mapping now uses tasks.json worker IDs instead of fragile `paneIdx + 1` arithmetic that breaks after pane reordering
- `ralph status --watch` — `--watch <n>` now exits with an error if `n` is not a positive integer instead of silently defaulting to 5
- `install-skills` — uses `fileURLToPath()` for portable package root resolution instead of raw URL pathname (fixes edge cases on Windows)
- Security: `shellQuote` extracted to shared utility (`src/core/shell.ts`); no more duplication between `team` and `recover`
- Security: webhook URLs validated with `new URL()` parser instead of `startsWith('https://')`; malformed URLs are rejected
- Security: `.ralph/.env` file permissions enforced with `chmodSync(0o600)` after every write, not just on creation
- Robustness: `readTasks` and `readWorkerState` now validate JSON structure after parsing; malformed state files return `null` instead of crashing downstream
- Robustness: `getClaimableTasks` and `claimTask` warn when `depends_on` references a non-existent task ID
- Robustness: `Math.max` spread on empty workers array replaced with explicit length check
- Configurable: `leaseDurationMs` and `stuckThresholdMs` now readable from `~/.ralph/config.json`; hard-coded constants remain as defaults
- Mailbox: `pruneMailbox()` added — deletes `.json.read` files older than 7 days; called automatically by `ralph status --watch`
- `LICENSE` replaced with canonical Apache 2.0 text so GitHub correctly detects the license (was showing "Other")

### Changed
- `/ralph-kage-bunshin-loop` — UI copy and API verification procedures removed; loop now delegates to `/ui-reverse-engineering`, `/transition-reverse-engineering`, `/api-integration-checklist` respectively — each skill owns its own procedure
- `/ralph-kage-bunshin-start` — reverse-engineering task description format rule simplified; worker just invokes the skill, which contains the full procedure
- `/ralph-kage-bunshin-loop` — mailbox now supports `broadcast` type: critical mid-task discoveries (wrong API params, broken docs, env issues) are written immediately as broadcast messages, not deferred to `task_complete`
- `/ralph-kage-bunshin-loop` — mailbox read logic: skip `.read` files explicitly; `broadcast` messages applied immediately before related work begins
- `/ralph-kage-bunshin-loop` — `api.md` existing is not grounds for skipping Step 0 curl verification; always re-verify parameter names/shapes before writing API client code
- `/ralph-kage-bunshin-start` — worker recommendation formula clarified: `max tasks in parallel across all waves = recommended workers` (previously over-counted by 1 in some cases)
- `/ralph-kage-bunshin-loop` — environment-level gotchas now recorded immediately to `CLAUDE.md` under `## Environment Notes` when discovered, not at converge time
- `/ralph-kage-bunshin-loop` — after claiming, worker verifies expected project files exist before proceeding; setup task marked `converged` may have run in a different worktree
- `/ralph-kage-bunshin-loop` — mailbox `task_complete` with no `learnings` flagged as protocol violation; worker falls back to sender's PROGRESS.md
- `/ralph-kage-bunshin-loop` — `used_skills` field added to PROGRESS.md generation format
- `/ralph-kage-bunshin-loop` — DoD now re-reads `tasks.json` first; stops if another worker already converged the task
- `/ralph-kage-bunshin-loop` — architect review time-boxed to 10 minutes; timeout treated as PATHOLOGY
- `/ralph-kage-bunshin-loop` — ExternalServiceBlock pathology: 3+ `fail:external_service` → switch approach ladder (direct → Vite proxy → server-side proxy → mock fallback), record in `approach_history`
- `/ralph-kage-bunshin-loop` — `last_results` supports `'fail:external_service'` entry type
- `/ralph-kage-bunshin-start` — all tasks require `description` field; empty or missing not allowed
- `/ralph-kage-bunshin-start` — `isolated: true` rule clarified: set on any parallel task touching shared files; when in doubt, set it
- `/ralph-kage-bunshin-start` — E2E scenarios distributed across tasks and included in each task's `description`; single end-of-project E2E task not allowed
- `/ralph-kage-bunshin-start` — reverse-engineering tasks require explicit step format in `description`; "already implemented" is not grounds for skipping visual comparison

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
