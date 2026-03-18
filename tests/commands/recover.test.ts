import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRecover } from '../../src/commands/recover'
import * as state from '../../src/core/state'
import * as tmux from '../../src/core/tmux'
import * as caffeinate from '../../src/core/caffeinate'
import * as configModule from '../../src/core/config'

vi.mock('../../src/core/state')
vi.mock('../../src/core/tmux')
vi.mock('../../src/core/caffeinate')
vi.mock('../../src/core/config')

describe('ralph recover', () => {
  beforeEach(() => {
    vi.mocked(tmux.sessionExists).mockReturnValue(false)
    vi.mocked(tmux.createSession).mockReturnValue(undefined)
    vi.mocked(tmux.splitPane).mockReturnValue(undefined)
    vi.mocked(tmux.applyLayout).mockReturnValue(undefined)
    vi.mocked(tmux.sendKeys).mockReturnValue(undefined)
    vi.mocked(state.writeWorkerState).mockReturnValue(undefined)
    vi.mocked(state.resetStuckTasks).mockReturnValue([])
    vi.mocked(caffeinate.startCaffeinate).mockReturnValue(undefined)
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: false,
    })
  })

  it('does not create a session when there are no pending tasks', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'converged', worker: 1 },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).not.toHaveBeenCalled()
  })

  it('creates one worker per pending task', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([1])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'expired-task', status: 'pending', worker: null },
      { id: 2, name: 'done-task', status: 'converged', worker: 1 },
    ])
    runRecover('/tmp/project')
    expect(tmux.createSession).toHaveBeenCalledTimes(1)
    // 1 pending task → 1 worker, no extra splits
    expect(tmux.splitPane).not.toHaveBeenCalled()
  })

  it('assigns new worker IDs starting after the current maximum worker ID', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done', status: 'converged', worker: 3 },
      { id: 2, name: 'pending', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    const allCmds = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCmds).toContain('export RALPH_WORKER_ID=4')
  })

  it('splits one extra pane when there are 2 pending tasks', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([1, 2])
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task1', status: 'pending', worker: null },
      { id: 2, name: 'task2', status: 'pending', worker: null },
    ])
    runRecover('/tmp/project')
    expect(tmux.splitPane).toHaveBeenCalledTimes(1)
  })
})
