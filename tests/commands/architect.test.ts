import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getStatus } from '../../src/commands/status'
import * as state from '../../src/core/state'

vi.mock('../../src/core/state')

describe('architect review in getStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(state.resetExpiredLeases).mockReturnValue([])
  })

  it('architectStatus is null when DoD not complete', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'task', generation: 2,
      consecutive_failures: 0, last_results: [],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    const { workers } = getStatus('/tmp/test')
    expect(workers[0].architectStatus).toBeNull()
  })

  it('architectStatus is pending when DoD complete but no review yet', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'task', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    const { workers } = getStatus('/tmp/test')
    expect(workers[0].architectStatus).toBe('pending')
  })

  it('architectStatus is approved when architect_review.status is approved', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'task', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      architect_review: { status: 'approved', reviewed_at: new Date().toISOString(), notes: 'LGTM' },
    })
    const { workers } = getStatus('/tmp/test')
    expect(workers[0].architectStatus).toBe('approved')
  })

  it('architectStatus is rejected when architect_review.status is rejected', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'task', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue({
      worker_id: 1, task: 'task', generation: 5,
      consecutive_failures: 0, last_results: ['pass'],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      architect_review: { status: 'rejected', reviewed_at: new Date().toISOString(), notes: 'Missing error handling' },
    })
    const { workers } = getStatus('/tmp/test')
    expect(workers[0].architectStatus).toBe('rejected')
  })
})
