import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRecover } from '../../src/commands/recover'
import * as state from '../../src/core/state'
import * as tmux from '../../src/core/tmux'
import * as caffeinate from '../../src/core/caffeinate'
import * as configModule from '../../src/core/config'
import fs from 'fs'
import * as childProcess from 'child_process'

vi.mock('../../src/core/state')
vi.mock('../../src/core/tmux')
vi.mock('../../src/core/caffeinate')
vi.mock('../../src/core/config')
vi.mock('fs')
vi.mock('child_process')

describe('ralph recover', () => {
  beforeEach(() => {
    vi.mocked(tmux.sessionExists).mockReturnValue(false)
    vi.mocked(tmux.createSession).mockReturnValue(undefined)
    vi.mocked(tmux.splitPane).mockReturnValue(undefined)
    vi.mocked(tmux.applyLayout).mockReturnValue(undefined)
    vi.mocked(tmux.sendKeys).mockReturnValue(undefined)
    vi.mocked(tmux.setPaneTitle).mockReturnValue(undefined)
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2, 3])
    vi.mocked(state.resetStuckTasks).mockReturnValue([])
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(caffeinate.startCaffeinate).mockReturnValue(undefined)
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: false,
    })
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.appendFileSync).mockReturnValue(undefined)
    vi.mocked(fs.chmodSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([] as any)
    vi.mocked(fs.rmSync).mockReturnValue(undefined)
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(''))
  })

  it('does not create a session when there are no pending tasks', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'converged', worker: 1 },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).not.toHaveBeenCalled()
  })

  it('logs expired lease resets', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.resetExpiredLeases).mockReturnValue([2, 5])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 2, name: 'task2', status: 'converged', worker: 1 },
    ])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Reset 2 expired lease(s)'))
    spy.mockRestore()
  })

  it('logs stuck task resets', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.resetStuckTasks).mockReturnValue([3])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 3, name: 'task3', status: 'converged', worker: 1 },
    ])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Reset 1 stuck task(s)'))
    spy.mockRestore()
  })

  it('logs "all tasks converged" when no pending and no in-progress', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'converged', worker: 1 },
    ])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('All tasks converged'))
    spy.mockRestore()
  })

  it('logs "still in-progress" when no pending but some in-progress', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'in-progress', worker: 1 },
    ])
    runRecover('/tmp/project')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('1 still in-progress'))
    spy.mockRestore()
  })

  it('delegates to running watcher session instead of creating new one', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    // Session exists = watcher is running
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    runRecover('/tmp/project')
    expect(tmux.createSession).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('will reassign'))
    spy.mockRestore()
  })

  it('starts caffeinate when config.caffeinate is true', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    expect(caffeinate.startCaffeinate).toHaveBeenCalled()
  })

  it('creates a new watcher session when no existing session', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-project')
  })

  it('spawns worker panes + watcher pane', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo-a', status: 'pending', worker: null },
      { id: 2, name: 'todo-b', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    // 2 workers + 1 watcher = 3 panes; session starts with 1, so 2 splits
    expect(tmux.splitPane).toHaveBeenCalledTimes(2)
  })

  it('sets watcher pane title and launches watcher claude', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1])
    runRecover('/tmp/project')
    expect(tmux.setPaneTitle).toHaveBeenCalledWith(expect.any(String), 1, 'ralph-watcher')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 1)
    expect(watcherCalls.some(c => c[2].includes('/ralph-kage-bunshin-watcher'))).toBe(true)
  })

  it('sets worker pane titles without launching claude', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1])
    runRecover('/tmp/project')
    expect(tmux.setPaneTitle).toHaveBeenCalledWith(expect.any(String), 0, 'ralph-worker-1')
    const workerCalls = vi.mocked(tmux.sendKeys).mock.calls
      .filter(c => c[1] === 0)
      .map(c => c[2])
    expect(workerCalls.every(cmd => !cmd.includes('claude'))).toBe(true)
  })

  it('exports RALPH_WORKER_COUNT to watcher pane', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo-a', status: 'pending', worker: null },
      { id: 2, name: 'todo-b', status: 'pending', worker: null },
    ])
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2])
    runRecover('/tmp/project')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 2)
    expect(watcherCalls.some(c => c[2].includes("RALPH_WORKER_COUNT='2'"))).toBe(true)
  })

  it('writes FAKECHAT_PORT to .env when missing', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    runRecover('/tmp/project')
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('FAKECHAT_PORT')
    )
  })

  it('sources .env file when it exists', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    runRecover('/tmp/project')
    const allCmds = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCmds.some(cmd => cmd.includes('source'))).toBe(true)
  })

  it('attaches to the tmux session after starting', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'todo', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'tmux',
      ['attach-session', '-t', 'ralph-project'],
      { stdio: 'inherit' }
    )
  })

  it('caps worker count at 20', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1, name: `task-${i + 1}`, status: 'pending' as const, worker: null,
    }))
    vi.mocked(state.readTasks).mockReturnValue(tasks)
    // Mock enough panes for 20 workers + 1 watcher
    vi.mocked(tmux.listPanes).mockReturnValue(Array.from({ length: 21 }, (_, i) => i))
    runRecover('/tmp/project')
    // 20 workers + 1 watcher = 21 panes; session starts with 1, so 20 splits
    expect(tmux.splitPane).toHaveBeenCalledTimes(20)
  })
})
