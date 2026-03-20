import path from 'path'
import fs from 'fs'
import { readTasks, resetExpiredLeases, resetStuckTasks, readWorkerState, initWorkerState } from '../core/state'
import { sessionExists, createSession, splitPane, applyLayout, killPane, listPanes, sendKeys, getActivePaneIndex, findIdlePanes, findStatusPane, getPaneCommands } from '../core/tmux'
import { launchWorkers } from './team'
import { loadConfig } from '../core/config'
import { startCaffeinate } from '../core/caffeinate'
import { shellQuote } from '../core/shell'

/**
 * Find pane indices that can be recycled for new workers.
 * Priority: idle shell panes first, then converged worker panes.
 * Never returns the status pane.
 */
function findRecyclablePanes(
  session: string,
  projectDir: string,
  neededCount: number,
): number[] {
  const statusPane = findStatusPane(session)
  const cmds = getPaneCommands(session)

  // Idle shell panes (worker exited, shell remains)
  const idlePanes: number[] = []
  for (const [paneIdx, cmd] of cmds) {
    if (paneIdx === statusPane) continue
    if (/^(zsh|bash|fish|sh)$/.test(cmd)) {
      idlePanes.push(paneIdx)
    }
  }

  if (idlePanes.length >= neededCount) {
    return idlePanes.slice(0, neededCount)
  }

  // Also check for converged workers whose claude process is still idle at prompt
  const tasks = readTasks(projectDir)
  const activeWorkerIds = new Set(
    tasks
      .filter(t => t.status === 'in-progress' && t.worker !== null)
      .map(t => t.worker as number)
  )

  const panes = listPanes(session)
  const workerPanes = panes.filter(p => p !== statusPane)

  const recyclable = new Set(idlePanes)
  for (const task of tasks) {
    if (recyclable.size >= neededCount) break
    if (task.worker === null) continue
    if (activeWorkerIds.has(task.worker)) continue
    const state = readWorkerState(projectDir, task.worker)
    if (!state?.converged) continue
    // Try to find this worker's pane by initial mapping (worker N → pane N-1)
    const candidatePane = task.worker - 1
    if (workerPanes.includes(candidatePane) && !recyclable.has(candidatePane)) {
      recyclable.add(candidatePane)
    }
  }

  return [...recyclable].slice(0, neededCount)
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
    // Even if no pending tasks, clean up excess idle panes
    if (existingSession && sessionExists(existingSession)) {
      cleanupIdlePanes(existingSession, 0)
    }
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
    // Clean up excess idle panes first (keep at most pendingTasks.length)
    cleanupIdlePanes(existingSession, pendingTasks.length)

    // Re-scan after cleanup
    const recyclablePanes = findRecyclablePanes(existingSession, projectDir, pendingTasks.length)

    const launchOnPane = (paneIdx: number, workerId: number) => {
      initWorkerState(projectDir, workerId)
      sendKeys(existingSession, paneIdx, `cd ${shellQuote(projectDir)}`)
      if (fs.existsSync(envPath)) {
        sendKeys(existingSession, paneIdx, `source ${shellQuote(envPath)}`)
      }
      sendKeys(existingSession, paneIdx, `export RALPH_WORKER_ID='${workerId}'`)
      sendKeys(existingSession, paneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
      sendKeys(existingSession, paneIdx, `claude -p --dangerously-skip-permissions "/ralph-kage-bunshin-loop"`)
    }

    let launched = 0
    const cmds = getPaneCommands(existingSession)

    // Recycle existing panes
    for (let i = 0; i < recyclablePanes.length && launched < pendingTasks.length; i++) {
      const paneIdx = recyclablePanes[i]
      const workerId = newWorkerIds[launched]
      const cmd = cmds.get(paneIdx) ?? ''

      if (/^(zsh|bash|fish|sh)$/.test(cmd)) {
        // Idle shell — reuse directly
        console.log(`[RECOVER] Reusing idle pane ${paneIdx} for worker ${workerId}`)
        launchOnPane(paneIdx, workerId)
      } else {
        // Active process (converged claude) — kill and replace
        console.log(`[RECOVER] Recycling converged pane ${paneIdx} for worker ${workerId}`)
        killPane(existingSession, paneIdx)
        splitPane(existingSession)
        applyLayout(existingSession, 'tiled')
        const newPaneIdx = getActivePaneIndex(existingSession)
        if (newPaneIdx === null) {
          console.warn(`[RECOVER] Could not get pane index after split — skipping worker ${workerId}`)
          continue
        }
        launchOnPane(newPaneIdx, workerId)
      }
      launched++
    }

    // Spawn new panes for remaining tasks
    for (let i = launched; i < pendingTasks.length; i++) {
      const workerId = newWorkerIds[i]
      splitPane(existingSession)
      applyLayout(existingSession, 'tiled')
      const newPaneIdx = getActivePaneIndex(existingSession)
      if (newPaneIdx === null) {
        console.warn(`[RECOVER] Could not get pane index after split — skipping worker ${workerId}`)
        continue
      }
      console.log(`[RECOVER] Spawning new pane for worker ${workerId}`)
      launchOnPane(newPaneIdx, workerId)
      launched++
    }

    if (launched > 0) {
      console.log(`[OK] Recovery started in existing session: ${existingSession} (${launched} worker(s))`)
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

/**
 * Remove idle shell panes beyond `keepCount`.
 * Never removes the status pane.
 */
function cleanupIdlePanes(session: string, keepCount: number): void {
  const statusPane = findStatusPane(session)
  const idle = findIdlePanes(session).filter(p => p !== statusPane)
  const toKill = idle.slice(keepCount).sort((a, b) => b - a) // kill highest index first to avoid index shift
  for (const paneIdx of toKill) {
    console.log(`[RECOVER] Cleaning up excess idle pane ${paneIdx}`)
    killPane(session, paneIdx)
  }
  if (toKill.length > 0) {
    applyLayout(session, 'tiled')
  }
}
