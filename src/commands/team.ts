import path from 'path'
import fs from 'fs'
import { createSession, splitPane, applyLayout, sendKeys, sessionExists, killSession, listPanes, setPaneTitle } from '../core/tmux'
import { initWorkerState } from '../core/state'
import { startCaffeinate } from '../core/caffeinate'
import { loadConfig } from '../core/config'
import { getFakechatPort } from '../core/notify'
import { shellQuote } from '../core/shell'

export function launchWorkers(
  sessionName: string,
  workerIds: number[],
  projectDir: string,
): void {
  const panes = listPanes(sessionName)
  if (panes.length < workerIds.length) {
    throw new Error(`Not enough panes (${panes.length}) for workers (${workerIds.length})`)
  }
  launchWorkersOnPanes(sessionName, workerIds, panes.slice(0, workerIds.length), projectDir)
}

/** Base port for worker fakechat channels. Worker N gets port BASE + N. */
export const WORKER_FAKECHAT_BASE_PORT = 8787

export function getWorkerFakechatPort(workerId: number): number {
  return WORKER_FAKECHAT_BASE_PORT + workerId
}

export function launchWorkersOnPanes(
  sessionName: string,
  workerIds: number[],
  paneIndices: number[],
  projectDir: string,
): void {
  const envPath = path.join(projectDir, '.ralph', '.env')

  for (let i = 0; i < workerIds.length; i++) {
    const workerId = workerIds[i]
    const paneIdx = paneIndices[i]
    const workerPort = getWorkerFakechatPort(workerId)

    initWorkerState(projectDir, workerId, { fakechatPort: workerPort })
    setPaneTitle(sessionName, paneIdx, `ralph-worker-${workerId}`)

    sendKeys(sessionName, paneIdx, `cd ${shellQuote(projectDir)}`)

    if (fs.existsSync(envPath)) {
      sendKeys(sessionName, paneIdx, `source ${shellQuote(envPath)}`)
    }

    // Inject worker ID, project dir, and worker-specific fakechat port
    sendKeys(sessionName, paneIdx, `export RALPH_WORKER_ID='${workerId}'`)
    sendKeys(sessionName, paneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
    sendKeys(sessionName, paneIdx, `export FAKECHAT_PORT='${workerPort}'`)
    sendKeys(sessionName, paneIdx, `claude -n "ralph-worker-${workerId}" --channels plugin:fakechat@claude-plugins-official --dangerously-skip-permissions "/ralph-kage-bunshin-loop"`)
  }
}

export function cleanupStaleWorkers(projectDir: string, activeWorkerCount: number): void {
  const workersDir = path.join(projectDir, '.ralph', 'workers')
  if (!fs.existsSync(workersDir)) return

  const entries = fs.readdirSync(workersDir)
  for (const entry of entries) {
    const match = entry.match(/^worker-(\d+)$/)
    if (!match) continue
    const id = parseInt(match[1], 10)
    if (id > activeWorkerCount) {
      const workerPath = path.join(workersDir, entry)
      fs.rmSync(workerPath, { recursive: true, force: true })
      console.log(`[CLEANUP] Removed stale worker directory: ${entry}`)
    }
  }
}

export function runTeam(workerCount: number, projectDir: string): void {
  const config = loadConfig()

  if (config.caffeinate) {
    startCaffeinate()
  }

  // Write architect FAKECHAT_PORT to .env as fallback; each worker overrides with its own port (8787+N)
  const fakechatPort = getFakechatPort(config)
  const envPath = path.join(projectDir, '.ralph', '.env')
  fs.mkdirSync(path.join(projectDir, '.ralph'), { recursive: true })
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  if (!envContent.includes('FAKECHAT_PORT=')) {
    fs.appendFileSync(envPath, `${envContent && !envContent.endsWith('\n') ? '\n' : ''}export FAKECHAT_PORT='${fakechatPort}'\n`)
  }
  // Enforce restrictive permissions — .env may contain secrets
  fs.chmodSync(envPath, 0o600)

  const sessionName = `ralph-${path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_')}`

  // Kill old session BEFORE cleaning up worker dirs — prevents workers from writing to dirs being deleted
  if (sessionExists(sessionName)) {
    killSession(sessionName)
  }

  // Clean up stale worker directories from previous runs with more workers
  cleanupStaleWorkers(projectDir, workerCount)
  createSession(sessionName)

  // Create workerCount + 2 (status + architect) panes total — session starts with 1
  const totalPanes = workerCount + 2
  for (let i = 1; i < totalPanes; i++) {
    splitPane(sessionName)
  }
  applyLayout(sessionName, 'tiled')

  // Confirm actual pane indices after layout
  const panes = listPanes(sessionName)
  if (panes.length < workerCount + 2) {
    throw new Error(`Expected ${workerCount + 2} panes after layout, got ${panes.length}`)
  }

  // Worker panes: first workerCount panes
  const workerPanes = panes.slice(0, workerCount)
  // Architect pane: second to last
  const architectPaneIdx = panes[panes.length - 2]
  // Status pane: last pane
  const statusPaneIdx = panes[panes.length - 1]

  const workerIds = Array.from({ length: workerCount }, (_, i) => i + 1)
  launchWorkersOnPanes(sessionName, workerIds, workerPanes, projectDir)

  // Architect pane — runs Claude with fakechat for receiving worker notifications
  setPaneTitle(sessionName, architectPaneIdx, 'ralph-architect')
  sendKeys(sessionName, architectPaneIdx, `cd ${shellQuote(projectDir)}`)
  sendKeys(sessionName, architectPaneIdx, `export FAKECHAT_PORT='${fakechatPort}'`)
  sendKeys(sessionName, architectPaneIdx, `claude --channels plugin:fakechat@claude-plugins-official --dangerously-skip-permissions`)

  // Status pane — set title for reliable identification by recover
  setPaneTitle(sessionName, statusPaneIdx, 'ralph-status')
  sendKeys(sessionName, statusPaneIdx, `cd ${shellQuote(projectDir)}`)
  sendKeys(sessionName, statusPaneIdx, `ralph status --watch`)

  console.log(`\n[OK] Ralph team started: ${sessionName} (${workerCount} workers + 1 architect + 1 status pane)`)
  console.log(`\nTo watch workers:`)
  console.log(`  tmux attach -t '${sessionName}'\n`)
}
