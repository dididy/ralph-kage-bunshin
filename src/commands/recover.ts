import path from 'path'
import { readTasks } from '../core/state'
import { resetExpiredLeases } from '../core/state'
import { sessionExists, createSession, splitPane, applyLayout } from '../core/tmux'
import { launchWorkers } from './team'
import { loadConfig } from '../core/config'
import { startCaffeinate } from '../core/caffeinate'

export function runRecover(projectDir: string): void {
  // Reset any expired leases back to pending
  const expiredIds = resetExpiredLeases(projectDir)
  if (expiredIds.length > 0) {
    console.log(`[RECOVER] Reset ${expiredIds.length} expired lease(s): tasks ${expiredIds.join(', ')}`)
  }

  // Count pending tasks
  const tasks = readTasks(projectDir)
  const pendingCount = tasks.filter(t => t.status === 'pending').length

  if (pendingCount === 0) {
    const inProgressCount = tasks.filter(t => t.status === 'in-progress').length
    if (inProgressCount > 0) {
      console.log(`[RECOVER] No pending tasks — ${inProgressCount} still in-progress. Nothing to recover.`)
    } else {
      console.log(`[RECOVER] All tasks converged. Nothing to recover.`)
    }
    return
  }

  const config = loadConfig()
  if (config.caffeinate) {
    startCaffeinate()
  }

  // Find the highest existing worker ID to avoid collisions
  const existingWorkerIds = tasks
    .map(t => t.worker)
    .filter((w): w is number => w !== null)
  const maxExistingId = existingWorkerIds.length > 0 ? Math.max(...existingWorkerIds) : 0

  // Assign new worker IDs starting after the highest existing one
  const newWorkerIds = Array.from({ length: pendingCount }, (_, i) => maxExistingId + i + 1)

  const sessionName = `ralph-${path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_')}-recover`

  if (sessionExists(sessionName)) {
    console.log(`[RECOVER] Session ${sessionName} already exists — skipping (workers may still be running)`)
    return
  }

  createSession(sessionName)
  for (let i = 1; i < pendingCount; i++) {
    splitPane(sessionName)
    applyLayout(sessionName, 'tiled')
  }

  launchWorkers(sessionName, newWorkerIds, projectDir)

  console.log(`\n[OK] Recovery started: ${sessionName} (${pendingCount} worker${pendingCount === 1 ? '' : 's'})`)
  console.log(`\nTo watch workers:`)
  console.log(`  tmux attach -t '${sessionName}'`)
  console.log(`\nTo monitor status:`)
  console.log(`  ralph status --watch\n`)
}
