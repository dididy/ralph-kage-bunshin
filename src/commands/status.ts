import { readTasks, readWorkerState } from '../core/state'

export interface WorkerStatus {
  workerId: number
  task: string
  generation: number
  converged: boolean
  hasPathology: boolean
  pathologyType: string | null
  elapsedMinutes: number
  architectStatus: 'approved' | 'rejected' | 'pending' | null
}

export interface RalphStatus {
  workers: WorkerStatus[]
  maxElapsedMinutes: number
}

export function getStatus(projectDir: string): RalphStatus {
  const tasks = readTasks(projectDir)
  const assignedTasks = tasks.flatMap(t =>
    t.worker !== null ? [{ ...t, worker: t.worker }] : []
  )

  const workers: WorkerStatus[] = assignedTasks.map(task => {
    const state = readWorkerState(projectDir, task.worker)
    if (!state) {
      console.warn(`[WARN] Could not read state for worker-${task.worker}`)
      return {
        workerId: task.worker, task: task.name,
        generation: 0, converged: false,
        hasPathology: false, pathologyType: null, elapsedMinutes: 0,
        architectStatus: null,
      }
    }

    // Use claimed_at from task (most reliable), fall back to state.started_at
    const claimedAt = task.claimed_at ? new Date(task.claimed_at).getTime() : NaN
    const startTime = !isNaN(claimedAt) ? claimedAt : new Date(state.started_at).getTime()
    const elapsed = isNaN(startTime) ? 0 : Math.floor((Date.now() - startTime) / 60000)
    const pathologyType = state.pathology.stagnation ? 'Stagnation'
      : state.pathology.oscillation ? 'Oscillation'
      : state.pathology.wonder_loop ? 'WonderLoop'
      : state.pathology.external_service_block ? 'ExternalServiceBlock'
      : null

    const architectStatus = state.architect_review?.status ?? (
      state.dod_checklist.npm_test && state.dod_checklist.npm_build && state.dod_checklist.tasks_complete
        ? 'pending'
        : null
    )

    return {
      workerId: state.worker_id,
      task: state.task,
      generation: state.generation,
      converged: state.converged,
      hasPathology: pathologyType !== null,
      pathologyType,
      elapsedMinutes: elapsed,
      architectStatus,
    }
  })

  const maxElapsed = workers.length > 0 ? Math.max(...workers.map(w => w.elapsedMinutes)) : 0

  return { workers, maxElapsedMinutes: maxElapsed } satisfies RalphStatus
}

export function printStatus(projectDir: string): void {
  const { workers, maxElapsedMinutes } = getStatus(projectDir)

  console.log('\nWorker status:')
  for (const w of workers) {
    const icon = w.converged ? '[DONE]' : w.hasPathology ? '[WARN]' : '[RUN] '
    const pathInfo = w.hasPathology ? ` (${w.pathologyType})` : ''
    const archInfo = w.architectStatus === 'approved' ? ' [ARCH:✓]'
      : w.architectStatus === 'rejected' ? ' [ARCH:✗]'
      : w.architectStatus === 'pending' ? ' [ARCH:?]'
      : ''
    console.log(`  ${icon} worker-${w.workerId} [${w.task}] gen.${w.generation}${pathInfo}${archInfo}`)
  }

  const h = Math.floor(maxElapsedMinutes / 60)
  const m = maxElapsedMinutes % 60
  console.log(`\nElapsed: ${h}h ${m}m\n`)
}
