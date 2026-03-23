import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getStatus, printStatus } from '../../src/commands/status'
import * as state from '../../src/core/state'

vi.mock('../../src/core/state')

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

  it('detects external_service_block pathology', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'test-task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      pathology: { stagnation: false, oscillation: false, wonder_loop: false, external_service_block: true },
    }))
    const status = getStatus('/tmp/test')
    expect(status.workers[0].hasPathology).toBe(true)
    expect(status.workers[0].pathologyType).toBe('ExternalServiceBlock')
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
