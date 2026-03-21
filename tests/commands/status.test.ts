import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getStatus, printStatus, printMessages } from '../../src/commands/status'
import * as state from '../../src/core/state'
import * as mailboxModule from '../../src/core/mailbox'
import * as notifyModule from '../../src/core/notify'
import * as configModule from '../../src/core/config'
import * as recoverModule from '../../src/commands/recover'

vi.mock('../../src/core/state')
vi.mock('../../src/core/notify')
vi.mock('../../src/core/config')
vi.mock('../../src/core/mailbox')
vi.mock('../../src/commands/recover')

function makeWorkerState(overrides: Partial<import('../../src/types').WorkerState> = {}): import('../../src/types').WorkerState {
  return {
    worker_id: 1, task: 'test', generation: 3,
    consecutive_failures: 0, last_results: ['pass'],
    pathology: { stagnation: false, oscillation: false, wonder_loop: false },
    dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
    converged: false,
    started_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('ralph status', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.resetStuckTasks).mockReturnValue([])
    vi.mocked(mailboxModule.countUnread).mockReturnValue(0)
    vi.mocked(mailboxModule.pruneMailbox).mockReturnValue(undefined)
    vi.mocked(recoverModule.runRecover).mockReturnValue(undefined)
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: false, slack_webhook: '', discord_webhook: '' },
      caffeinate: false,
    })
    vi.mocked(notifyModule.notify).mockReturnValue(undefined)
  })

  it('returns worker status', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'component', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      worker_id: 1, task: 'component',
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers).toHaveLength(1)
    expect(status.workers[0].task).toBe('component')
    expect(status.workers[0].converged).toBe(false)
    expect(status.workers[0].elapsedMinutes).toBeGreaterThan(59)
  })

  it('detects stagnation pathology', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'test-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      pathology: { stagnation: true, oscillation: false, wonder_loop: false },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].hasPathology).toBe(true)
    expect(status.workers[0].pathologyType).toBe('Stagnation')
  })

  it('detects oscillation pathology', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'test-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      pathology: { stagnation: false, oscillation: true, wonder_loop: false },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].pathologyType).toBe('Oscillation')
  })

  it('detects wonder_loop pathology', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'test-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      pathology: { stagnation: false, oscillation: false, wonder_loop: true },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].pathologyType).toBe('WonderLoop')
  })

  it('detects converged worker', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done-task', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      converged: true,
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].converged).toBe(true)
  })

  it('handles null worker state gracefully', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'orphan', status: 'in-progress', worker: 99 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(null)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const status = getStatus('/tmp/test')
    expect(status.workers[0].generation).toBe(0)
    expect(status.workers[0].converged).toBe(false)
    expect(status.workers[0].architectStatus).toBeNull()
    spy.mockRestore()
  })

  it('skips tasks with null worker in getStatus', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'pending', status: 'pending', worker: null },
      { id: 2, name: 'active', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState())
    const status = getStatus('/tmp/test')
    expect(status.workers).toHaveLength(1)
  })

  it('returns maxElapsedMinutes=0 when no workers', () => {
    vi.mocked(state.readTasks).mockReturnValue([])
    const status = getStatus('/tmp/test')
    expect(status.maxElapsedMinutes).toBe(0)
  })

  it('notifies on CONVERGED', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done-task', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      converged: true,
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
    }))
    printStatus('/tmp/test')
    expect(notifyModule.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('CONVERGED') })
    )
  })

  it('notifies on PATHOLOGY', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'stuck', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      pathology: { stagnation: true, oscillation: false, wonder_loop: false },
    }))
    printStatus('/tmp/test')
    expect(notifyModule.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('PATHOLOGY') })
    )
  })

  it('does not notify twice for the same converged worker in watch mode', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done-task', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      converged: true,
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
    }))
    const notifiedConverged = new Set<number>()
    const notifiedPathology = new Set<number>()
    printStatus('/tmp/test', notifiedConverged, notifiedPathology)
    printStatus('/tmp/test', notifiedConverged, notifiedPathology)
    const calls = vi.mocked(notifyModule.notify).mock.calls.filter(c =>
      (c[0].message as string).includes('CONVERGED')
    )
    expect(calls).toHaveLength(1)
  })

  it('shows architectStatus=pending when DoD all true but no review', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'ready-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].architectStatus).toBe('pending')
  })

  it('shows architectStatus=null when DoD not complete', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'wip', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      dod_checklist: { npm_test: true, npm_build: false, tasks_complete: false },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].architectStatus).toBeNull()
  })

  it('shows architectStatus=approved when architect_review.status is approved', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'approved-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      architect_review: { status: 'approved', reviewed_at: new Date().toISOString(), notes: 'LGTM' },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].architectStatus).toBe('approved')
  })

  it('shows architectStatus=rejected', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'rejected-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      architect_review: { status: 'rejected', reviewed_at: new Date().toISOString(), notes: 'fix tests' },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].architectStatus).toBe('rejected')
  })

  it('expired lease with autoRecover=true triggers runRecover', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([2])
    vi.mocked(state.readTasks).mockReturnValue([])
    printStatus('/tmp/test', new Set(), new Set(), true)
    expect(recoverModule.runRecover).toHaveBeenCalledWith('/tmp/test', undefined)
  })

  it('expired lease with autoRecover=false does not trigger runRecover', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([2])
    vi.mocked(state.readTasks).mockReturnValue([])
    printStatus('/tmp/test', new Set(), new Set(), false)
    expect(recoverModule.runRecover).not.toHaveBeenCalled()
  })

  it('stuck tasks with autoRecover=true triggers runRecover', () => {
    vi.mocked(state.resetStuckTasks).mockReturnValue([3])
    vi.mocked(state.readTasks).mockReturnValue([])
    printStatus('/tmp/test', new Set(), new Set(), true)
    expect(recoverModule.runRecover).toHaveBeenCalled()
  })

  it('stuck tasks with autoRecover=false does not trigger runRecover', () => {
    vi.mocked(state.resetStuckTasks).mockReturnValue([3])
    vi.mocked(state.readTasks).mockReturnValue([])
    printStatus('/tmp/test', new Set(), new Set(), false)
    expect(recoverModule.runRecover).not.toHaveBeenCalled()
  })

  it('autoRecover=true prunes mailbox', () => {
    vi.mocked(state.readTasks).mockReturnValue([])
    printStatus('/tmp/test', new Set(), new Set(), true)
    expect(mailboxModule.pruneMailbox).toHaveBeenCalledWith('/tmp/test')
  })

  it('autoRecover=false does not prune mailbox', () => {
    vi.mocked(state.readTasks).mockReturnValue([])
    printStatus('/tmp/test', new Set(), new Set(), false)
    expect(mailboxModule.pruneMailbox).not.toHaveBeenCalled()
  })

  it('shows unread message count', () => {
    vi.mocked(mailboxModule.countUnread).mockReturnValue(3)
    vi.mocked(state.readTasks).mockReturnValue([])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printStatus('/tmp/test')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('3 unread messages'))
    spy.mockRestore()
  })

  it('shows singular "message" for 1 unread', () => {
    vi.mocked(mailboxModule.countUnread).mockReturnValue(1)
    vi.mocked(state.readTasks).mockReturnValue([])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printStatus('/tmp/test')
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/1 unread message[^s]/))
    spy.mockRestore()
  })

  it('passes sessionName to runRecover', () => {
    vi.mocked(state.resetExpiredLeases).mockReturnValue([1])
    vi.mocked(state.readTasks).mockReturnValue([])
    printStatus('/tmp/test', new Set(), new Set(), true, 'ralph-session')
    expect(recoverModule.runRecover).toHaveBeenCalledWith('/tmp/test', 'ralph-session')
  })

  it('prints [WARN] icon for pathology workers', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'stuck', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      pathology: { stagnation: true, oscillation: false, wonder_loop: false },
    }))
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printStatus('/tmp/test')
    const output = spy.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('[WARN]')
    spy.mockRestore()
  })

  it('prints [ARCH:✓] for approved workers', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'approved', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      architect_review: { status: 'approved', reviewed_at: new Date().toISOString(), notes: '' },
    }))
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printStatus('/tmp/test')
    const output = spy.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('[ARCH:✓]')
    spy.mockRestore()
  })

  it('prints [ARCH:✗] for rejected workers', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'rejected', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      architect_review: { status: 'rejected', reviewed_at: new Date().toISOString(), notes: '' },
    }))
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printStatus('/tmp/test')
    const output = spy.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('[ARCH:✗]')
    spy.mockRestore()
  })

  it('prints [ARCH:?] for pending review workers', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'pending-review', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
    }))
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printStatus('/tmp/test')
    const output = spy.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('[ARCH:?]')
    spy.mockRestore()
  })

  it('handles invalid started_at gracefully', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'bad-time', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      started_at: 'invalid-date',
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].elapsedMinutes).toBe(0)
  })

  it('prints elapsed time', () => {
    vi.mocked(state.readTasks).mockReturnValue([])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printStatus('/tmp/test')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Elapsed:'))
    spy.mockRestore()
  })
})

describe('printMessages', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('prints "No messages" when mailbox is empty', () => {
    vi.mocked(mailboxModule.listMessages).mockReturnValue([])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printMessages('/tmp/test')
    expect(spy).toHaveBeenCalledWith('No messages in mailbox.')
    spy.mockRestore()
  })

  it('prints messages with read/unread status', () => {
    vi.mocked(mailboxModule.listMessages).mockReturnValue([
      { from: 1, to: 'all', type: 'info', subject: 'broadcast', body: 'hello', timestamp: '2026-03-21T00:00:00.000Z', filename: 'msg1.json', read: false },
      { from: 2, to: 1, type: 'decision', subject: 'decision-msg', body: '', timestamp: '2026-03-21T01:00:00.000Z', filename: 'msg2.json.read', read: true },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printMessages('/tmp/test')
    const output = spy.mock.calls.map(c => c[0]).join('\n')
    expect(output).toContain('[unread]')
    expect(output).toContain('[read]')
    expect(output).toContain('broadcast')
    expect(output).toContain('worker-1 → all')
    expect(output).toContain('worker-2 → worker-1')
    expect(output).toContain('hello') // body
    spy.mockRestore()
  })

  it('prints singular "message" for 1 message', () => {
    vi.mocked(mailboxModule.listMessages).mockReturnValue([
      { from: 1, to: 'all', type: 'info', subject: 'test', body: '', timestamp: '2026-03-21T00:00:00.000Z', filename: 'msg1.json', read: false },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printMessages('/tmp/test')
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/1 message[^s]/))
    spy.mockRestore()
  })

  it('skips body line when body is empty', () => {
    vi.mocked(mailboxModule.listMessages).mockReturnValue([
      { from: 1, to: 'all', type: 'info', subject: 'no-body', body: '', timestamp: '2026-03-21T00:00:00.000Z', filename: 'msg1.json', read: false },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printMessages('/tmp/test')
    // Body line should not be present (3 log calls: header, status line, timestamp, empty line)
    const bodyLines = spy.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('         ') && !c[0].includes('2026'))
    expect(bodyLines).toHaveLength(0)
    spy.mockRestore()
  })
})
