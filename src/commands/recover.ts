import path from 'path'
import fs from 'fs'
import { readTasks, resetExpiredLeases, resetStuckTasks, readWorkerState } from '../core/state'
import { sessionExists, createSession, splitPane, applyLayout, killPane, listPanes, sendKeys, getActivePaneIndex } from '../core/tmux'
import { launchWorkers } from './team'
import { loadConfig } from '../core/config'
import { startCaffeinate } from '../core/caffeinate'
import { shellQuote } from '../core/shell'

/**
 * Find pane indices in the session that belong to converged/done workers.
 * We identify them by checking tasks.json — converged worker IDs map to
 * pane index (worker 1 → pane 0, worker 2 → pane 1, etc. as launched by team).
 * Since pane order may shift after kills, we track by worker ID via state.
 */
function findRecyclablePanes(
  session: string,
  projectDir: string,
  neededCount: number,
): number[] {
  const tasks = readTasks(projectDir)

  // A worker is idle only if it has NO in-progress task currently assigned to it
  const activeWorkerIds = new Set(
    tasks
      .filter(t => t.status === 'in-progress' && t.worker !== null)
      .map(t => t.worker as number)
  )

  const panes = listPanes(session)
  if (panes.length < 2) {
    // Need at least one worker pane + one status pane to recycle
    return []
  }
  // Status pane is the last pane — never recycle it
  const workerPanes = panes.slice(0, -1)

  // Build a map of workerId → paneIdx by scanning all known worker states,
  // avoiding the fragile paneIdx+1 assumption (indices shift after kills/splits)
  const workerIdToPaneIdx = new Map<number, number>()
  for (const task of tasks) {
    if (task.worker === null) continue
    const wid = task.worker
    // pane index is unknown after reordering — match by checking all panes
    // against each worker's state existence; fall back to order-based mapping
    // for workers that haven't been recycled yet (initial launch: worker N → pane N-1)
    const candidatePane = wid - 1
    if (workerPanes.includes(candidatePane)) {
      workerIdToPaneIdx.set(wid, candidatePane)
    }
  }

  const recyclable: number[] = []
  for (const [workerId, paneIdx] of workerIdToPaneIdx) {
    const state = readWorkerState(projectDir, workerId)
    // Only recycle if: worker state exists, is converged, and has no active task
    if (state?.converged && !activeWorkerIds.has(workerId)) {
      recyclable.push(paneIdx)
      if (recyclable.length >= neededCount) break
    }
  }
  return recyclable
}

export function runRecover(projectDir: string, existingSession?: string): void {
  // Reset any expired leases back to pending
  const expiredIds = resetExpiredLeases(projectDir)
  if (expiredIds.length > 0) {
    console.log(`[RECOVER] Reset ${expiredIds.length} expired lease(s): tasks ${expiredIds.join(', ')}`)
  }

  // Reset stuck tasks (in-progress but updated_at > 10 min ago)
  const stuckIds = resetStuckTasks(projectDir)
  if (stuckIds.length > 0) {
    console.log(`[RECOVER] Reset ${stuckIds.length} stuck task(s): tasks ${stuckIds.join(', ')}`)
  }

  const tasks = readTasks(projectDir)
  const pendingTasks = tasks.filter(t => t.status === 'pending')

  if (pendingTasks.length === 0) {
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

  const existingWorkerIds = tasks
    .map(t => t.worker)
    .filter((w): w is number => typeof w === 'number')
  const maxExistingId = existingWorkerIds.length > 0 ? Math.max(...existingWorkerIds) : 0
  const newWorkerIds = Array.from({ length: pendingTasks.length }, (_, i) => maxExistingId + i + 1)

  const envPath = path.join(projectDir, '.ralph', '.env')

  // Try to reuse panes in the existing session
  if (existingSession && sessionExists(existingSession)) {
    const recyclablePanes = findRecyclablePanes(existingSession, projectDir, pendingTasks.length)

    if (recyclablePanes.length > 0) {
      console.log(`[RECOVER] Recycling ${recyclablePanes.length} converged pane(s) in session ${existingSession}`)

      for (let i = 0; i < recyclablePanes.length; i++) {
        const paneIdx = recyclablePanes[i]
        const workerId = newWorkerIds[i]

        // Kill the old converged pane and open a fresh one in its place
        killPane(existingSession, paneIdx)
        splitPane(existingSession)
        applyLayout(existingSession, 'tiled')

        // After splitPane the new pane has focus — get it by active pane index
        const newPaneIdx = getActivePaneIndex(existingSession)
        if (newPaneIdx === null) continue

        sendKeys(existingSession, newPaneIdx, `cd ${shellQuote(projectDir)}`)
        if (fs.existsSync(envPath)) {
          sendKeys(existingSession, newPaneIdx, `source ${shellQuote(envPath)}`)
        }
        sendKeys(existingSession, newPaneIdx, `export RALPH_WORKER_ID='${workerId}'`)
        sendKeys(existingSession, newPaneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
        sendKeys(existingSession, newPaneIdx, `claude --dangerously-skip-permissions "/ralph-kage-bunshin-loop"`)
      }

      // If there are more pending tasks than recyclable panes, spawn extras
      const remaining = newWorkerIds.slice(recyclablePanes.length)
      if (remaining.length > 0) {
        for (const workerId of remaining) {
          splitPane(existingSession)
          applyLayout(existingSession, 'tiled')
          const newPaneIdx = getActivePaneIndex(existingSession)
          if (newPaneIdx === null) continue

          sendKeys(existingSession, newPaneIdx, `cd ${shellQuote(projectDir)}`)
          if (fs.existsSync(envPath)) {
            sendKeys(existingSession, newPaneIdx, `source ${shellQuote(envPath)}`)
          }
          sendKeys(existingSession, newPaneIdx, `export RALPH_WORKER_ID='${workerId}'`)
          sendKeys(existingSession, newPaneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
          sendKeys(existingSession, newPaneIdx, `claude --dangerously-skip-permissions "/ralph-kage-bunshin-loop"`)
        }
      }

      console.log(`[OK] Recovery started in existing session: ${existingSession}`)
      return
    }
  }

  // Fallback: create a new recover session
  const recoverSession = `ralph-${path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_')}-recover`

  if (sessionExists(recoverSession)) {
    console.log(`[RECOVER] Session ${recoverSession} already exists — skipping (workers may still be running)`)
    return
  }

  createSession(recoverSession)
  for (let i = 1; i < pendingTasks.length; i++) {
    splitPane(recoverSession)
    applyLayout(recoverSession, 'tiled')
  }

  launchWorkers(recoverSession, newWorkerIds, projectDir)

  console.log(`\n[OK] Recovery started: ${recoverSession} (${pendingTasks.length} worker${pendingTasks.length === 1 ? '' : 's'})`)
  console.log(`\nTo watch workers:`)
  console.log(`  tmux attach -t '${recoverSession}'`)
  console.log(`\nTo monitor status:`)
  console.log(`  ralph status --watch\n`)
}
