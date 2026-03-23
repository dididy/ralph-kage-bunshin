import path from 'path'
import fs from 'fs'
import { readTasks, resetExpiredLeases, resetStuckTasks } from '../core/state'
import { sessionExists, createSession, splitPane, applyLayout, listPanes, sendKeys, setPaneTitle } from '../core/tmux'
import { cleanupStaleWorkers } from './team'
import { loadConfig, getFakechatPort } from '../core/config'
import { startCaffeinate } from '../core/caffeinate'
import { shellQuote } from '../core/shell'

export function runRecover(projectDir: string): void {
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

  // Check if a watcher session already exists — if so, it will pick up the reset tasks automatically
  const sessionName = `ralph-${path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_')}`
  if (sessionExists(sessionName)) {
    console.log(`[RECOVER] Watcher session ${sessionName} is running — it will reassign ${pendingTasks.length} pending task(s) automatically.`)
    return
  }

  // No watcher session — start a fresh one
  const config = loadConfig()
  if (config.caffeinate) {
    startCaffeinate()
  }

  const fakechatPort = getFakechatPort(config)
  const envPath = path.join(projectDir, '.ralph', '.env')
  fs.mkdirSync(path.join(projectDir, '.ralph'), { recursive: true })
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  if (!envContent.includes('FAKECHAT_PORT=')) {
    fs.appendFileSync(envPath, `${envContent && !envContent.endsWith('\n') ? '\n' : ''}export FAKECHAT_PORT='${fakechatPort}'\n`)
  }
  if (fs.existsSync(envPath)) {
    fs.chmodSync(envPath, 0o600)
  }

  // Count how many workers we need (based on pending tasks, capped at reasonable max)
  const workerCount = Math.min(pendingTasks.length, 20)

  createSession(sessionName)

  // Create workerCount + 1 (watcher) panes total — session starts with 1
  const totalPanes = workerCount + 1
  for (let i = 1; i < totalPanes; i++) {
    splitPane(sessionName)
  }
  applyLayout(sessionName, 'tiled')

  const panes = listPanes(sessionName)
  if (panes.length < workerCount + 1) {
    throw new Error(`Expected ${workerCount + 1} panes after layout, got ${panes.length}`)
  }

  // Worker panes: first workerCount panes (empty shells — watcher will launch Claude)
  const workerPanes = panes.slice(0, workerCount)
  // Watcher pane: last pane
  const watcherPaneIdx = panes[panes.length - 1]

  // Prepare worker panes with env vars but do NOT launch Claude
  for (let i = 0; i < workerCount; i++) {
    const workerId = i + 1
    const paneIdx = workerPanes[i]
    setPaneTitle(sessionName, paneIdx, `ralph-worker-${workerId}`)
    sendKeys(sessionName, paneIdx, `cd ${shellQuote(projectDir)}`)
    if (fs.existsSync(envPath)) {
      sendKeys(sessionName, paneIdx, `source ${shellQuote(envPath)}`)
    }
    sendKeys(sessionName, paneIdx, `export RALPH_WORKER_ID='${workerId}'`)
    sendKeys(sessionName, paneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
  }

  // Watcher pane — runs Claude with fakechat for orchestrating workers
  setPaneTitle(sessionName, watcherPaneIdx, 'ralph-watcher')
  sendKeys(sessionName, watcherPaneIdx, `cd ${shellQuote(projectDir)}`)
  sendKeys(sessionName, watcherPaneIdx, `export FAKECHAT_PORT='${fakechatPort}'`)
  sendKeys(sessionName, watcherPaneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
  sendKeys(sessionName, watcherPaneIdx, `export RALPH_WORKER_COUNT='${workerCount}'`)
  sendKeys(sessionName, watcherPaneIdx, `claude -n "ralph-watcher" --channels plugin:fakechat@claude-plugins-official --dangerously-skip-permissions "/ralph-kage-bunshin-watcher"`)

  // Clean up stale worker directories
  cleanupStaleWorkers(projectDir, workerCount)

  console.log(`\n[OK] Recovery started: ${sessionName} (${workerCount} worker panes + 1 watcher)`)
  console.log(`\nTo watch workers:`)
  console.log(`  tmux attach -t '${sessionName}'\n`)
}
