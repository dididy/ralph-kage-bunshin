import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getStatus, printStatus } from '../../src/commands/status'
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

describe('ralph status', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
    vi.mocked(state.resetStuckTasks).mockReturnValue([])
    vi.mocked(mailboxModule.countUnread).mockReturnValue(0)
    vi.mocked(recoverModule.runRecover).mockReturnValue(undefined)
  })

  it('returns worker status', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'component', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'component', generation: 3,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
      converged: false,
      started_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    const status = getStatus('/tmp/test')
    expect(status.workers).toHaveLength(1)
    expect(status.workers[0].task).toBe('component')
    expect(status.workers[0].converged).toBe(false)
    expect(status.workers[0].elapsedMinutes).toBeGreaterThan(59)
  })

  it('detects pathology correctly', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'test-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'test-task', generation: 5,
      consecutive_failures: 3, last_results: ['fail', 'fail', 'fail'],
      pathology: { stagnation: true, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    const status = getStatus('/tmp/test')
    expect(status.workers[0].hasPathology).toBe(true)
    expect(status.workers[0].pathologyType).toBe('Stagnation')
  })

  it('detects converged worker', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done-task', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'done-task', generation: 10,
      consecutive_failures: 0, last_results: ['pass', 'pass', 'pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: true,
      started_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    const status = getStatus('/tmp/test')
    expect(status.workers[0].converged).toBe(true)
  })

  it('notifies on CONVERGED', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(notifyModule.notify).mockReturnValue(undefined)
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done-task', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'done-task', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: true,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    printStatus('/tmp/test')
    expect(notifyModule.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('CONVERGED') })
    )
  })

  it('does not notify twice for the same converged worker in watch mode', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(notifyModule.notify).mockReturnValue(undefined)
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'done-task', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'done-task', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: true,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    // Simulate watch mode: share the same Sets across calls
    const notifiedConverged = new Set<number>()
    const notifiedPathology = new Set<number>()
    printStatus('/tmp/test', notifiedConverged, notifiedPathology)
    printStatus('/tmp/test', notifiedConverged, notifiedPathology) // second call — should not notify again
    const calls = vi.mocked(notifyModule.notify).mock.calls.filter(c =>
      (c[0].message as string).includes('CONVERGED')
    )
    expect(calls).toHaveLength(1)
  })

  it('shows architectStatus=pending when DoD all true but no review', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'ready-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'ready-task', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    const status = getStatus('/tmp/test')
    expect(status.workers[0].architectStatus).toBe('pending')
  })

  it('shows architectStatus=approved when architect_review.status is approved', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'approved-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'approved-task', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      architect_review: { status: 'approved', reviewed_at: new Date().toISOString(), notes: 'LGTM' },
    })
    const status = getStatus('/tmp/test')
    expect(status.workers[0].architectStatus).toBe('approved')
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
})
