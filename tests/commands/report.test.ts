import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getReport, printReport } from '../../src/commands/report'
import * as state from '../../src/core/state'

vi.mock('../../src/core/state')

function makeWorkerState(overrides: Partial<import('../../src/types').WorkerState> = {}): import('../../src/types').WorkerState {
  return {
    worker_id: 1,
    task: 'setup',
    generation: 5,
    consecutive_failures: 0,
    last_results: ['pass'],
    pathology: { stagnation: false, oscillation: false, wonder_loop: false },
    dod_checklist: { npm_test: true, npm_build: true, tasks_complete: true },
    converged: true,
    started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('ralph report', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty report when no tasks exist', () => {
    vi.mocked(state.readTasks).mockReturnValue([])
    const report = getReport('/tmp/test')
    expect(report.workers).toHaveLength(0)
    expect(report.summary.totalTasks).toBe(0)
    expect(report.summary.totalCostUsd).toBe(0)
  })

  it('returns per-worker report with task name, generations, elapsed, and convergence', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'Project setup', status: 'converged', worker: 1 },
      { id: 2, name: 'Auth module', status: 'in-progress', worker: 2 },
    ])
    vi.mocked(state.readWorkerState)
      .mockReturnValueOnce(makeWorkerState({
        worker_id: 1, task: 'Project setup', generation: 3, converged: true,
        started_at: new Date(Date.now() - 1800000).toISOString(),
      }))
      .mockReturnValueOnce(makeWorkerState({
        worker_id: 2, task: 'Auth module', generation: 7, converged: false,
        started_at: new Date(Date.now() - 3600000).toISOString(),
      }))

    const report = getReport('/tmp/test')
    expect(report.workers).toHaveLength(2)
    expect(report.workers[0].taskName).toBe('Project setup')
    expect(report.workers[0].generations).toBe(3)
    expect(report.workers[0].converged).toBe(true)
    expect(report.workers[0].elapsedMinutes).toBeGreaterThanOrEqual(29)
    expect(report.workers[1].taskName).toBe('Auth module')
    expect(report.workers[1].converged).toBe(false)
  })

  it('includes architect review status in worker report', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'API layer', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      worker_id: 1, task: 'API layer',
      architect_review: { status: 'approved', reviewed_at: new Date().toISOString(), notes: 'LGTM' },
    }))

    const report = getReport('/tmp/test')
    expect(report.workers[0].architectStatus).toBe('approved')
  })

  it('includes cost data when available in worker state', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'Setup', status: 'converged', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      worker_id: 1, task: 'Setup',
      cost: {
        total_usd: 1.25,
        total_input_tokens: 500000,
        total_output_tokens: 100000,
        api_duration_ms: 120000,
      },
    }))

    const report = getReport('/tmp/test')
    expect(report.workers[0].cost).toEqual({
      total_usd: 1.25,
      total_input_tokens: 500000,
      total_output_tokens: 100000,
      api_duration_ms: 120000,
    })
  })

  it('aggregates total cost across all workers in summary', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'Task A', status: 'converged', worker: 1 },
      { id: 2, name: 'Task B', status: 'converged', worker: 2 },
    ])
    vi.mocked(state.readWorkerState)
      .mockReturnValueOnce(makeWorkerState({
        worker_id: 1, task: 'Task A',
        cost: { total_usd: 1.50, total_input_tokens: 600000, total_output_tokens: 120000, api_duration_ms: 90000 },
      }))
      .mockReturnValueOnce(makeWorkerState({
        worker_id: 2, task: 'Task B',
        cost: { total_usd: 2.00, total_input_tokens: 800000, total_output_tokens: 160000, api_duration_ms: 110000 },
      }))

    const report = getReport('/tmp/test')
    expect(report.summary.totalCostUsd).toBeCloseTo(3.50)
    expect(report.summary.totalInputTokens).toBe(1400000)
    expect(report.summary.totalOutputTokens).toBe(280000)
  })

  it('summary includes task counts by status', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'A', status: 'converged', worker: 1 },
      { id: 2, name: 'B', status: 'converged', worker: 2 },
      { id: 3, name: 'C', status: 'in-progress', worker: 3 },
      { id: 4, name: 'D', status: 'pending', worker: null },
      { id: 5, name: 'E', status: 'pathology', worker: 4 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(null)

    const report = getReport('/tmp/test')
    expect(report.summary.totalTasks).toBe(5)
    expect(report.summary.converged).toBe(2)
    expect(report.summary.inProgress).toBe(1)
    expect(report.summary.pending).toBe(1)
    expect(report.summary.pathology).toBe(1)
  })

  it('handles workers with no cost data gracefully', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'Task A', status: 'converged', worker: 1 },
      { id: 2, name: 'Task B', status: 'converged', worker: 2 },
    ])
    vi.mocked(state.readWorkerState)
      .mockReturnValueOnce(makeWorkerState({
        worker_id: 1, task: 'Task A',
        cost: { total_usd: 1.50, total_input_tokens: 600000, total_output_tokens: 120000, api_duration_ms: 90000 },
      }))
      .mockReturnValueOnce(makeWorkerState({ worker_id: 2, task: 'Task B' })) // no cost

    const report = getReport('/tmp/test')
    expect(report.workers[1].cost).toBeUndefined()
    expect(report.summary.totalCostUsd).toBeCloseTo(1.50)
  })

  it('deduplicates cost when one worker handled multiple tasks', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'Task A', status: 'converged', worker: 1 },
      { id: 2, name: 'Task B', status: 'converged', worker: 1 }, // same worker
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      worker_id: 1, task: 'Task B',
      cost: { total_usd: 2.00, total_input_tokens: 800000, total_output_tokens: 160000, api_duration_ms: 120000 },
    }))

    const report = getReport('/tmp/test')
    expect(report.workers).toHaveLength(2)
    expect(report.summary.totalCostUsd).toBeCloseTo(2.00)
    expect(report.summary.totalInputTokens).toBe(800000)
  })

  it('handles null worker state gracefully', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'Orphan task', status: 'in-progress', worker: 99 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(null)

    const report = getReport('/tmp/test')
    expect(report.workers).toHaveLength(1)
    expect(report.workers[0].taskName).toBe('Orphan task')
    expect(report.workers[0].generations).toBe(0)
    expect(report.workers[0].cost).toBeUndefined()
  })

  it('handles invalid started_at gracefully', () => {
    vi.mocked(state.readTasks).mockReturnValue([
      { id: 1, name: 'bad-time', status: 'in-progress', worker: 1 },
    ])
    vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
      started_at: 'not-a-date',
    }))
    const report = getReport('/tmp/test')
    expect(report.workers[0].elapsedMinutes).toBe(0)
  })

  describe('printReport', () => {
    it('writes formatted output to console', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(state.readTasks).mockReturnValue([
        { id: 1, name: 'Setup', status: 'converged', worker: 1 },
      ])
      vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
        worker_id: 1, task: 'Setup', generation: 3,
        cost: { total_usd: 0.75, total_input_tokens: 300000, total_output_tokens: 60000, api_duration_ms: 45000 },
      }))

      printReport('/tmp/test')

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('Setup')
      expect(output).toContain('$0.75')
      expect(output).toContain('300,000')
      consoleSpy.mockRestore()
    })

    it('prints "No workers" when none assigned', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(state.readTasks).mockReturnValue([
        { id: 1, name: 'pending', status: 'pending', worker: null },
      ])

      printReport('/tmp/test')

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('No workers have been assigned')
      consoleSpy.mockRestore()
    })

    it('shows [ARCH:✓] for approved workers', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(state.readTasks).mockReturnValue([
        { id: 1, name: 'task', status: 'converged', worker: 1 },
      ])
      vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
        architect_review: { status: 'approved', reviewed_at: new Date().toISOString(), notes: '' },
      }))

      printReport('/tmp/test')
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('[ARCH:✓]')
      consoleSpy.mockRestore()
    })

    it('shows [ARCH:✗] for rejected workers', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(state.readTasks).mockReturnValue([
        { id: 1, name: 'task', status: 'in-progress', worker: 1 },
      ])
      vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
        converged: false,
        architect_review: { status: 'rejected', reviewed_at: new Date().toISOString(), notes: 'bad' },
      }))

      printReport('/tmp/test')
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('[ARCH:✗]')
      consoleSpy.mockRestore()
    })

    it('does not print cost summary when totalCostUsd is 0', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(state.readTasks).mockReturnValue([
        { id: 1, name: 'task', status: 'converged', worker: 1 },
      ])
      vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState())

      printReport('/tmp/test')
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).not.toContain('Total cost:')
      consoleSpy.mockRestore()
    })

    it('formats duration with hours', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(state.readTasks).mockReturnValue([
        { id: 1, name: 'task', status: 'converged', worker: 1 },
      ])
      vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
        started_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 min ago
      }))

      printReport('/tmp/test')
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('1h 30m')
      consoleSpy.mockRestore()
    })

    it('formats duration without hours when < 60 min', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.mocked(state.readTasks).mockReturnValue([
        { id: 1, name: 'task', status: 'converged', worker: 1 },
      ])
      vi.mocked(state.readWorkerState).mockReturnValue(makeWorkerState({
        started_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 min ago
      }))

      printReport('/tmp/test')
      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toMatch(/\b25m\b/)
      expect(output).not.toMatch(/\d+h/)
      consoleSpy.mockRestore()
    })
  })
})
