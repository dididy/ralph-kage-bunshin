import { readTasks, readWorkerState, resetExpiredLeases, resetStuckTasks } from '../core/state'
import { countUnread, listMessages, pruneMailbox } from '../core/mailbox'
import { notify } from '../core/notify'
import { loadConfig } from '../core/config'
import { runRecover } from './recover'

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
  const assignedTasks = tasks.filter(t => t.worker !== null)

  const workers: WorkerStatus[] = assignedTasks.map(task => {
    const state = readWorkerState(projectDir, task.worker!)
    if (!state) {
      console.warn(`[WARN] Could not read state for worker-${task.worker}`)
      return {
        workerId: task.worker!, task: task.name,
        generation: 0, converged: false,
        hasPathology: false, pathologyType: null, elapsedMinutes: 0,
        architectStatus: null,
      }
    }

    const elapsed = Math.floor(
      (Date.now() - new Date(state.started_at).getTime()) / 60000
    )
    const pathologyType = state.pathology.stagnation ? 'Stagnation'
      : state.pathology.oscillation ? 'Oscillation'
      : state.pathology.wonder_loop ? 'WonderLoop'
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

export function printStatus(
  projectDir: string,
  notifiedConverged = new Set<number>(),
  notifiedPathology = new Set<number>(),
  autoRecover = false,
  sessionName?: string,
): void {
  const expiredIds = resetExpiredLeases(projectDir)
  for (const id of expiredIds) {
    console.log(`  [LEASE] Task ${id} lease expired — reset to pending`)
  }
  if (expiredIds.length > 0 && autoRecover) {
    console.log(`  [RECOVER] Auto-recovering ${expiredIds.length} expired task(s)...`)
    runRecover(projectDir, sessionName)
  }

  const stuckIds = resetStuckTasks(projectDir)
  for (const id of stuckIds) {
    console.log(`  [STUCK] Task ${id} stuck (no update >10min) — reset to pending`)
  }
  if (stuckIds.length > 0 && autoRecover) {
    console.log(`  [RECOVER] Auto-recovering ${stuckIds.length} stuck task(s)...`)
    runRecover(projectDir, sessionName)
  }

  if (autoRecover) {
    pruneMailbox(projectDir)
  }

  const { workers, maxElapsedMinutes } = getStatus(projectDir)
  const config = loadConfig()

  console.log('\nWorker status:')
  for (const w of workers) {
    const icon = w.converged ? '[DONE]' : w.hasPathology ? '[WARN]' : '[RUN] '
    const pathInfo = w.hasPathology ? ` (${w.pathologyType})` : ''
    const archInfo = w.architectStatus === 'approved' ? ' [ARCH:✓]'
      : w.architectStatus === 'rejected' ? ' [ARCH:✗]'
      : w.architectStatus === 'pending' ? ' [ARCH:?]'
      : ''
    console.log(`  ${icon} worker-${w.workerId} [${w.task}] gen.${w.generation}${pathInfo}${archInfo}`)

    if (w.converged && !notifiedConverged.has(w.workerId)) {
      notify({ title: 'Ralph', message: `CONVERGED: worker-${w.workerId} [${w.task}]`, config })
      notifiedConverged.add(w.workerId)
    } else if (w.hasPathology && !notifiedPathology.has(w.workerId)) {
      notify({ title: 'Ralph', message: `PATHOLOGY: worker-${w.workerId} ${w.pathologyType}`, config })
      notifiedPathology.add(w.workerId)
    }
  }

  const unread = countUnread(projectDir)
  if (unread > 0) {
    console.log(`\nMailbox: ${unread} unread message${unread === 1 ? '' : 's'} (run ralph status --messages to view)`)
  }

  const h = Math.floor(maxElapsedMinutes / 60)
  const m = maxElapsedMinutes % 60
  console.log(`\nElapsed: ${h}h ${m}m\n`)
}

export function printMessages(projectDir: string): void {
  const msgs = listMessages(projectDir)
  if (msgs.length === 0) {
    console.log('No messages in mailbox.')
    return
  }
  console.log(`\nMailbox (${msgs.length} message${msgs.length === 1 ? '' : 's'}):\n`)
  for (const m of msgs) {
    const read = m.read ? '[read]' : '[unread]'
    const to = m.to === 'all' ? 'all' : `worker-${m.to}`
    console.log(`  ${read} worker-${m.from} → ${to} [${m.type}] ${m.subject}`)
    console.log(`         ${m.timestamp}`)
    if (m.body) console.log(`         ${m.body}`)
    console.log()
  }
}
