import path from 'path'
import fs from 'fs'
import { readTasks, resetExpiredLeases, resetStuckTasks, readWorkerState, initWorkerState, getClaimableTasks } from '../core/state'
import { sessionExists, createSession, splitPane, applyLayout, killPane, listPanes, sendKeys, getActivePaneIndex, findIdlePanes, findStatusPane, findArchitectPane, getPaneCommands, getPaneTitles, setPaneTitle, sendRawKeys, sleepSync } from '../core/tmux'
import { launchWorkers, getWorkerFakechatPort, cleanupStaleWorkers } from './team'
import { loadConfig } from '../core/config'
import { getFakechatPort } from '../core/notify'
import { startCaffeinate } from '../core/caffeinate'
import { shellQuote } from '../core/shell'

/**
 * Find pane indices that can be recycled for new workers.
 * Priority: idle shell panes first, then orphaned worker panes (whose task
 * was reset to pending/null), then converged worker panes.
 * Never returns the status pane.
 */
function findRecyclablePanes(
  session: string,
  projectDir: string,
  neededCount: number,
): number[] {
  const statusPane = findStatusPane(session)
  const architectPane = findArchitectPane(session)
  const cmds = getPaneCommands(session)

  // Idle shell panes (worker exited, shell remains)
  const idlePanes: number[] = []
  for (const [paneIdx, cmd] of cmds) {
    if (paneIdx === statusPane || paneIdx === architectPane) continue
    if (/^(zsh|bash|fish|sh)$/.test(cmd)) {
      idlePanes.push(paneIdx)
    }
  }

  if (idlePanes.length >= neededCount) {
    return idlePanes.slice(0, neededCount)
  }

  const tasks = readTasks(projectDir)
  // Workers that currently own an in-progress task
  const activeWorkerIds = new Set(
    tasks
      .flatMap(t => t.status === 'in-progress' && t.worker !== null ? [t.worker] : [])
  )

  // Build reverse map: worker ID → pane index (from pane titles)
  const titles = getPaneTitles(session)
  const workerIdToPane = new Map<number, number>()
  for (const [paneIdx, title] of titles) {
    const match = title.match(/^ralph-worker-(\d+)$/)
    if (match) workerIdToPane.set(parseInt(match[1], 10), paneIdx)
  }

  const recyclable = new Set(idlePanes)

  // Find orphaned worker panes: pane title says ralph-worker-N but that worker
  // no longer owns any in-progress task (task was reset by expire/stuck detection).
  // These panes still have a running Claude process that is working on a task
  // it no longer owns — they must be killed and recycled.
  for (const [workerId, paneIdx] of workerIdToPane) {
    if (recyclable.size >= neededCount) break
    if (paneIdx === statusPane) continue
    if (recyclable.has(paneIdx)) continue
    if (activeWorkerIds.has(workerId)) continue
    // This worker's pane exists but it doesn't own any in-progress task → orphaned
    recyclable.add(paneIdx)
  }

  // Also check converged workers
  for (const task of tasks) {
    if (recyclable.size >= neededCount) break
    if (task.worker === null) continue
    if (activeWorkerIds.has(task.worker)) continue
    const state = readWorkerState(projectDir, task.worker)
    if (!state?.converged) continue
    const candidatePane = workerIdToPane.get(task.worker)
    if (candidatePane !== undefined && candidatePane !== statusPane && !recyclable.has(candidatePane)) {
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

  // Only spawn workers for claimable tasks (dependencies met), minus active workers
  const claimableTasks = getClaimableTasks(projectDir)
  const activeWorkerCount = tasks.filter(t => t.status === 'in-progress' && t.worker !== null).length
  const neededWorkers = Math.max(0, claimableTasks.length - activeWorkerCount)

  if (neededWorkers === 0) {
    const blockedCount = pendingTasks.length - claimableTasks.length
    console.log(`[RECOVER] No workers needed — ${activeWorkerCount} active, ${claimableTasks.length} claimable, ${blockedCount} blocked by dependencies.`)
    return
  }

  console.log(`[RECOVER] ${claimableTasks.length} claimable, ${activeWorkerCount} active → spawning ${neededWorkers} worker(s)`)

  const existingWorkerIds = tasks
    .map(t => t.worker)
    .filter((w): w is number => typeof w === 'number')
  const maxExistingId = existingWorkerIds.length > 0 ? Math.max(...existingWorkerIds) : 0
  const newWorkerIds = Array.from({ length: neededWorkers }, (_, i) => maxExistingId + i + 1)

  const envPath = path.join(projectDir, '.ralph', '.env')

  // Write architect FAKECHAT_PORT to .env as fallback; each worker overrides with its own port (8787+N)
  fs.mkdirSync(path.join(projectDir, '.ralph'), { recursive: true })
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  if (!envContent.includes('FAKECHAT_PORT=')) {
    const fakechatPort = getFakechatPort(config)
    fs.appendFileSync(envPath, `${envContent && !envContent.endsWith('\n') ? '\n' : ''}export FAKECHAT_PORT='${fakechatPort}'\n`)
  }
  if (fs.existsSync(envPath)) {
    fs.chmodSync(envPath, 0o600)
  }

  // Try to reuse panes in the existing session
  if (existingSession && sessionExists(existingSession)) {
    // Clean up excess idle panes first (keep at most neededWorkers)
    cleanupIdlePanes(existingSession, neededWorkers)

    // Re-scan after cleanup
    const recyclablePanes = findRecyclablePanes(existingSession, projectDir, neededWorkers)

    const launchOnPane = (paneIdx: number, workerId: number) => {
      const workerPort = getWorkerFakechatPort(workerId)
      initWorkerState(projectDir, workerId, { preserveStartedAt: true, fakechatPort: workerPort })
      setPaneTitle(existingSession, paneIdx, `ralph-worker-${workerId}`)
      sendKeys(existingSession, paneIdx, `cd ${shellQuote(projectDir)}`)
      if (fs.existsSync(envPath)) {
        sendKeys(existingSession, paneIdx, `source ${shellQuote(envPath)}`)
      }
      sendKeys(existingSession, paneIdx, `export RALPH_WORKER_ID='${workerId}'`)
      sendKeys(existingSession, paneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
      sendKeys(existingSession, paneIdx, `export FAKECHAT_PORT='${workerPort}'`)
      sendKeys(existingSession, paneIdx, `claude -n "ralph-worker-${workerId}" --channels plugin:fakechat@claude-plugins-official --dangerously-skip-permissions "/ralph-kage-bunshin-loop"`)
    }

    let launched = 0
    const cmds = getPaneCommands(existingSession)

    // Build explicit paneIdx → workerId mapping (order of recyclablePanes = order of newWorkerIds)
    const paneToWorkerId = new Map<number, number>()
    for (let i = 0; i < recyclablePanes.length && i < newWorkerIds.length; i++) {
      paneToWorkerId.set(recyclablePanes[i], newWorkerIds[i])
    }

    // Phase 1: Terminate all orphaned worker processes (before any pane index changes)
    const panesToRecycle: Array<{ paneIdx: number; isIdle: boolean }> = []
    for (const paneIdx of recyclablePanes) {
      if (panesToRecycle.length >= neededWorkers) break
      const cmd = cmds.get(paneIdx) ?? ''
      const isIdle = /^(zsh|bash|fish|sh)$/.test(cmd)
      if (!isIdle) {
        console.log(`[RECOVER] Terminating orphaned worker on pane ${paneIdx}`)
        // Send Ctrl+C twice to interrupt, then 'exit' to drop to shell
        sendRawKeys(existingSession, paneIdx, 'C-c')
        sendRawKeys(existingSession, paneIdx, 'C-c')
        try { sendKeys(existingSession, paneIdx, 'exit') } catch (e) {
          console.warn(`[RECOVER] Could not send exit to pane ${paneIdx}: ${e instanceof Error ? e.message : e}`)
        }
      }
      panesToRecycle.push({ paneIdx, isIdle })
    }

    // Brief pause to let Ctrl+C + exit take effect on terminated panes
    if (panesToRecycle.some(p => !p.isIdle)) {
      sleepSync(1)
    }

    // Phase 2: Kill terminated panes, then resolve idle pane indices
    // tmux renumbers pane indices after each kill, so we must:
    // 1. Kill non-idle panes first (reverse order to minimize shift)
    // 2. Re-scan idle panes by command detection after kills
    // 3. Split fresh panes for killed ones

    const killTargets = panesToRecycle
      .filter(p => !p.isIdle)
      .sort((a, b) => b.paneIdx - a.paneIdx)
    const idleCount = panesToRecycle.filter(p => p.isIdle).length

    const freshPaneForWorker = new Map<number, number>()

    // Kill non-idle panes in reverse order FIRST
    for (const { paneIdx } of killTargets) {
      const workerId = paneToWorkerId.get(paneIdx)!
      console.log(`[RECOVER] Replacing pane ${paneIdx} for worker ${workerId}`)
      killPane(existingSession, paneIdx)
    }

    if (killTargets.length > 0) {
      applyLayout(existingSession, 'tiled')
    }

    // Re-scan idle panes AFTER kills (indices may have shifted)
    // Assign idle panes to the first N new worker IDs that need them
    if (idleCount > 0) {
      const statusPane = findStatusPane(existingSession)
      const currentIdle = findIdlePanes(existingSession).filter(p => p !== statusPane)
      let idleAssigned = 0
      for (let i = 0; i < panesToRecycle.length && idleAssigned < currentIdle.length; i++) {
        if (!panesToRecycle[i].isIdle) continue
        const workerId = newWorkerIds[i]
        const idlePaneIdx = currentIdle[idleAssigned]
        console.log(`[RECOVER] Reusing idle pane ${idlePaneIdx} for worker ${workerId}`)
        freshPaneForWorker.set(workerId, idlePaneIdx)
        idleAssigned++
      }
    }

    // Split fresh panes for killed ones
    for (const { paneIdx } of killTargets) {
      const workerId = paneToWorkerId.get(paneIdx)!
      splitPane(existingSession)
      applyLayout(existingSession, 'tiled')
      const newPaneIdx = getActivePaneIndex(existingSession)
      if (newPaneIdx === null) {
        console.warn(`[RECOVER] Could not get pane index after split — skipping worker ${workerId}`)
        continue
      }
      freshPaneForWorker.set(workerId, newPaneIdx)
    }

    // Phase 3: Launch workers on their assigned panes
    for (let i = 0; i < panesToRecycle.length; i++) {
      const workerId = newWorkerIds[i]
      const paneIdx = freshPaneForWorker.get(workerId)
      if (paneIdx === undefined) continue
      launchOnPane(paneIdx, workerId)
      launched++
    }

    // Spawn new panes for remaining workers (if recyclable wasn't enough)
    for (let i = launched; i < neededWorkers; i++) {
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
      // Clean up stale worker directories — keep up to the highest new worker ID
      const maxId = Math.max(...newWorkerIds)
      cleanupStaleWorkers(projectDir, maxId)
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
  for (let i = 1; i < neededWorkers; i++) {
    splitPane(recoverSession)
    applyLayout(recoverSession, 'tiled')
  }

  launchWorkers(recoverSession, newWorkerIds, projectDir)

  // Clean up stale worker directories from previous runs — keep up to the highest active worker ID
  const maxNewId = Math.max(...newWorkerIds)
  cleanupStaleWorkers(projectDir, maxNewId)

  console.log(`\n[OK] Recovery started: ${recoverSession} (${neededWorkers} worker${neededWorkers === 1 ? '' : 's'})`)
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
  const architectPane = findArchitectPane(session)
  const idle = findIdlePanes(session).filter(p => p !== statusPane && p !== architectPane)
  const toKill = idle.slice(keepCount).sort((a, b) => b - a) // kill highest index first to avoid index shift
  for (const paneIdx of toKill) {
    console.log(`[RECOVER] Cleaning up excess idle pane ${paneIdx}`)
    killPane(session, paneIdx)
  }
  if (toKill.length > 0) {
    applyLayout(session, 'tiled')
  }
}
