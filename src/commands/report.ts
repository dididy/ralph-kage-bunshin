import { readTasks, readWorkerState } from '../core/state'
import type { WorkerState } from '../types'

export interface WorkerReport {
  workerId: number
  taskName: string
  generations: number
  converged: boolean
  elapsedMinutes: number
  architectStatus: 'approved' | 'rejected' | null
  cost?: WorkerState['cost']
}

export interface ReportSummary {
  totalTasks: number
  converged: number
  inProgress: number
  pending: number
  pathology: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
}

export interface Report {
  workers: WorkerReport[]
  summary: ReportSummary
}

export function getReport(projectDir: string): Report {
  const tasks = readTasks(projectDir)
  const assignedTasks = tasks.flatMap(t =>
    t.worker !== null ? [{ ...t, worker: t.worker }] : []
  )

  // Cache worker states to avoid reading the same state.json multiple times
  // and to deduplicate cost when one worker handled multiple tasks
  const stateCache = new Map<number, WorkerState | null>()
  function getCachedState(workerId: number): WorkerState | null {
    if (!stateCache.has(workerId)) {
      stateCache.set(workerId, readWorkerState(projectDir, workerId))
    }
    return stateCache.get(workerId) ?? null
  }

  const workers: WorkerReport[] = assignedTasks.map(task => {
    const ws = getCachedState(task.worker)
    if (!ws) {
      return {
        workerId: task.worker,
        taskName: task.name,
        generations: 0,
        converged: false,
        elapsedMinutes: 0,
        architectStatus: null,
      }
    }

    // Use claimed_at from task (most reliable), fall back to state.started_at
    const claimedAt = task.claimed_at ? new Date(task.claimed_at).getTime() : NaN
    const startTime = !isNaN(claimedAt) ? claimedAt : new Date(ws.started_at).getTime()
    const elapsed = isNaN(startTime) ? 0 : Math.floor((Date.now() - startTime) / 60000)

    return {
      workerId: ws.worker_id,
      taskName: task.name,
      generations: ws.generation,
      converged: ws.converged,
      elapsedMinutes: elapsed,
      architectStatus: ws.architect_review?.status ?? null,
      cost: ws.cost,
    }
  })

  // Deduplicate cost: count each worker's cost only once even if they handled multiple tasks
  const seenWorkerIds = new Set<number>()
  let totalCostUsd = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  for (const w of workers) {
    if (w.cost && !seenWorkerIds.has(w.workerId)) {
      seenWorkerIds.add(w.workerId)
      totalCostUsd += w.cost.total_usd
      totalInputTokens += w.cost.total_input_tokens
      totalOutputTokens += w.cost.total_output_tokens
    }
  }

  const summary: ReportSummary = {
    totalTasks: tasks.length,
    converged: tasks.filter(t => t.status === 'converged').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    pathology: tasks.filter(t => t.status === 'pathology').length,
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
  }

  return { workers, summary }
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function printReport(projectDir: string): void {
  const { workers, summary } = getReport(projectDir)

  console.log('\n=== Ralph Report ===\n')

  // Task summary
  console.log(`Tasks: ${summary.totalTasks} total — ${summary.converged} converged, ${summary.inProgress} in-progress, ${summary.pending} pending, ${summary.pathology} pathology\n`)

  // Per-worker table
  if (workers.length === 0) {
    console.log('No workers have been assigned yet.\n')
    return
  }

  console.log('Workers:')
  for (const w of workers) {
    const status = w.converged ? '[DONE]' : '[RUN] '
    const arch = w.architectStatus === 'approved' ? ' [ARCH:✓]'
      : w.architectStatus === 'rejected' ? ' [ARCH:✗]'
      : ''
    console.log(`  ${status} worker-${w.workerId} [${w.taskName}] gen.${w.generations} ${formatDuration(w.elapsedMinutes)}${arch}`)

    if (w.cost) {
      console.log(`         Cost: $${w.cost.total_usd.toFixed(2)} | In: ${formatNumber(w.cost.total_input_tokens)} | Out: ${formatNumber(w.cost.total_output_tokens)} tokens`)
    }
  }

  // Cost summary
  if (summary.totalCostUsd > 0) {
    console.log(`\nTotal cost: $${summary.totalCostUsd.toFixed(2)}`)
    console.log(`Total tokens: ${formatNumber(summary.totalInputTokens)} in / ${formatNumber(summary.totalOutputTokens)} out`)
  }

  console.log()
}
