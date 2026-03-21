import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRecover } from '../../src/commands/recover'
import * as state from '../../src/core/state'
import * as tmux from '../../src/core/tmux'
import * as caffeinate from '../../src/core/caffeinate'
import * as configModule from '../../src/core/config'
import fs from 'fs'

vi.mock('../../src/core/state')
vi.mock('../../src/core/tmux')
vi.mock('../../src/core/caffeinate')
vi.mock('../../src/core/config')
vi.mock('fs')

describe('ralph recover', () => {
  beforeEach(() => {
    vi.mocked(tmux.sessionExists).mockReturnValue(false)
    vi.mocked(tmux.createSession).mockReturnValue(undefined)
    vi.mocked(tmux.splitPane).mockReturnValue(undefined)
    vi.mocked(tmux.applyLayout).mockReturnValue(undefined)
    vi.mocked(tmux.sendKeys).mockReturnValue(undefined)
    vi.mocked(tmux.setPaneTitle).mockReturnValue(undefined)
    vi.mocked(tmux.killPane).mockReturnValue(undefined)
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2, 3])
    vi.mocked(tmux.getActivePaneIndex).mockReturnValue(2)
    vi.mocked(tmux.findIdlePanes).mockReturnValue([])
    vi.mocked(tmux.findStatusPane).mockReturnValue(0)
    vi.mocked(tmux.getPaneCommands).mockReturnValue(new Map())
    vi.mocked(tmux.getPaneTitles).mockReturnValue(new Map())
    vi.mocked(state.initWorkerState).mockReturnValue(undefined)
    vi.mocked(state.resetStuckTasks).mockReturnValue([])
    vi.mocked(state.readWorkerState).mockReturnValue(null)
    vi.mocked(caffeinate.startCaffeinate).mockReturnValue(undefined)
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: false,
    })
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  it('does not create a session when there are no pending tasks', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([])
    runRecover('/tmp/project')
    expect(tmux.createSession).not.toHaveBeenCalled()
  })

  it('logs expired lease resets', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.resetExpiredLeases).mockReturnValue([2, 5])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 2, name: 'task2', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Reset 2 expired lease(s)'))
    spy.mockRestore()
  })

  it('logs stuck task resets', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.resetStuckTasks).mockReturnValue([3])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 3, name: 'task3', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Reset 1 stuck task(s)'))
    spy.mockRestore()
  })

  it('logs "all tasks converged" when no pending and no in-progress', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('All tasks converged'))
    spy.mockRestore()
  })

  it('logs "still in-progress" when no pending but some in-progress', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('1 still in-progress'))
    spy.mockRestore()
  })

  it('starts caffeinate when config.caffeinate is true', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    expect(caffeinate.startCaffeinate).toHaveBeenCalled()
  })

  it('spawns workers only for claimable tasks, not all pending', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'setup', status: 'converged', worker: 1 },
      { id: 2, name: 'claimable', status: 'pending', worker: null, depends_on: [1] },
      { id: 3, name: 'blocked', status: 'pending', worker: null, depends_on: [2] },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 2, name: 'claimable', status: 'pending', worker: null, depends_on: [1] },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).toHaveBeenCalledTimes(1)
    expect(tmux.splitPane).not.toHaveBeenCalled()
  })

  it('does not spawn workers when active workers already cover claimable tasks', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'setup', status: 'converged', worker: 1 },
      { id: 2, name: 'active', status: 'in-progress', worker: 2 },
      { id: 3, name: 'claimable', status: 'pending', worker: null, depends_on: [1] },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 3, name: 'claimable', status: 'pending', worker: null, depends_on: [1] },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).not.toHaveBeenCalled()
    expect(tmux.sendKeys).not.toHaveBeenCalled()
  })

  it('spawns only the deficit: claimable minus active workers', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'setup', status: 'converged', worker: 1 },
      { id: 2, name: 'active', status: 'in-progress', worker: 2 },
      { id: 3, name: 'claimable-a', status: 'pending', worker: null, depends_on: [1] },
      { id: 4, name: 'claimable-b', status: 'pending', worker: null, depends_on: [1] },
      { id: 5, name: 'claimable-c', status: 'pending', worker: null, depends_on: [1] },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 3, name: 'claimable-a', status: 'pending', worker: null, depends_on: [1] },
      { id: 4, name: 'claimable-b', status: 'pending', worker: null, depends_on: [1] },
      { id: 5, name: 'claimable-c', status: 'pending', worker: null, depends_on: [1] },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).toHaveBeenCalledTimes(1)
    expect(tmux.splitPane).toHaveBeenCalledTimes(1)
  })

  it('assigns new worker IDs starting after the current maximum worker ID', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done', status: 'converged', worker: 3 },
      { id: 2, name: 'pending', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 2, name: 'pending', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    const allCmds = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCmds).toContain("export RALPH_WORKER_ID='4'")
  })

  it('does not spawn workers when all pending tasks are blocked by dependencies', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'setup', status: 'in-progress', worker: 1 },
      { id: 2, name: 'blocked-a', status: 'pending', worker: null, depends_on: [1] },
      { id: 3, name: 'blocked-b', status: 'pending', worker: null, depends_on: [1] },
      { id: 4, name: 'blocked-c', status: 'pending', worker: null, depends_on: [2] },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([])
    runRecover('/tmp/project')
    expect(tmux.createSession).not.toHaveBeenCalled()
    expect(tmux.sendKeys).not.toHaveBeenCalled()
  })

  it('reuses idle shell panes in existing session', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done', status: 'converged', worker: 1 },
      { id: 2, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 2, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    vi.mocked(tmux.getPaneCommands).mockReturnValue(new Map([[1, 'zsh']]))
    vi.mocked(tmux.getPaneTitles).mockReturnValue(new Map())
    vi.mocked(tmux.findIdlePanes).mockReturnValue([1])

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runRecover('/tmp/project', 'ralph-session')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Reusing idle pane'))
    expect(tmux.createSession).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('recycles converged worker panes when no idle shell panes', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done', status: 'converged', worker: 1 },
      { id: 2, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 2, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    vi.mocked(tmux.getPaneCommands).mockReturnValue(new Map([[1, 'claude']]))
    vi.mocked(tmux.getPaneTitles).mockReturnValue(new Map([[1, 'ralph-worker-1']]))
    vi.mocked(tmux.findIdlePanes).mockReturnValue([])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'done', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: true,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runRecover('/tmp/project', 'ralph-session')
    expect(tmux.killPane).toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Recycling converged pane'))
    spy.mockRestore()
  })

  it('skips worker when getActivePaneIndex returns null after split', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done', status: 'converged', worker: 1 },
      { id: 2, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 2, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    vi.mocked(tmux.getPaneCommands).mockReturnValue(new Map([[1, 'claude']]))
    vi.mocked(tmux.getPaneTitles).mockReturnValue(new Map([[1, 'ralph-worker-1']]))
    vi.mocked(tmux.findIdlePanes).mockReturnValue([])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'done', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: true,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    vi.mocked(tmux.getActivePaneIndex).mockReturnValue(null)

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    runRecover('/tmp/project', 'ralph-session')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Could not get pane index after split'))
    spy.mockRestore()
  })

  it('spawns new panes for remaining workers after recycling', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done', status: 'converged', worker: 1 },
      { id: 2, name: 'todo-a', status: 'pending', worker: null },
      { id: 3, name: 'todo-b', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 2, name: 'todo-a', status: 'pending', worker: null },
      { id: 3, name: 'todo-b', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    // Only 1 idle pane, but need 2 workers
    vi.mocked(tmux.getPaneCommands).mockReturnValue(new Map([[1, 'zsh']]))
    vi.mocked(tmux.getPaneTitles).mockReturnValue(new Map())
    vi.mocked(tmux.findIdlePanes).mockReturnValue([1])

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runRecover('/tmp/project', 'ralph-session')
    // 1 recycled + 1 new split
    expect(tmux.splitPane).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Spawning new pane'))
    spy.mockRestore()
  })

  it('sources .env file when it exists during pane recovery', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    vi.mocked(tmux.getPaneCommands).mockReturnValue(new Map([[1, 'zsh']]))
    vi.mocked(tmux.getPaneTitles).mockReturnValue(new Map())
    vi.mocked(tmux.findIdlePanes).mockReturnValue([1])
    vi.mocked(fs.existsSync).mockReturnValue(true)

    runRecover('/tmp/project', 'ralph-session')
    const allCmds = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCmds.some(cmd => cmd.includes('source'))).toBe(true)
  })

  it('falls back to new session when existing session does not exist', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.sessionExists).mockReturnValue(false)

    runRecover('/tmp/project', 'nonexistent-session')
    expect(tmux.createSession).toHaveBeenCalledTimes(1)
  })

  it('skips if recover session already exists', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.sessionExists).mockReturnValue(true)

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('already exists'))
    spy.mockRestore()
  })

  it('cleans up idle panes when no pending tasks but existing session', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([])
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    vi.mocked(tmux.findIdlePanes).mockReturnValue([2, 3])

    runRecover('/tmp/project', 'ralph-session')
    expect(tmux.killPane).toHaveBeenCalledTimes(2)
  })

  it('creates new session with multiple workers (splitPane calls)', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo-a', status: 'pending', worker: null },
      { id: 2, name: 'todo-b', status: 'pending', worker: null },
      { id: 3, name: 'todo-c', status: 'pending', worker: null },
    ])
    vi.mocked(state.getClaimableTasks).mockReturnValue([
      { id: 1, name: 'todo-a', status: 'pending', worker: null },
      { id: 2, name: 'todo-b', status: 'pending', worker: null },
      { id: 3, name: 'todo-c', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).toHaveBeenCalledTimes(1)
    // 3 workers: session starts with 1 pane, 2 splits needed
    expect(tmux.splitPane).toHaveBeenCalledTimes(2)
  })
})
