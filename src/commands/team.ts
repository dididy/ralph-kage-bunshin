import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { createSession, splitPane, applyLayout, sendKeys, sessionExists, killSession, listPanes, setPaneTitle } from '../core/tmux'
import { startCaffeinate } from '../core/caffeinate'
import { loadConfig, getFakechatPort } from '../core/config'
import { shellQuote } from '../core/shell'

/**
 * Prepare worker panes with environment variables but do NOT launch Claude.
 * The watcher will launch Claude sessions on these panes when assigning tasks.
 */
export function prepareWorkerPanes(
  sessionName: string,
  workerCount: number,
  paneIndices: number[],
  projectDir: string,
): void {
  const envPath = path.join(projectDir, '.ralph', '.env')

  for (let i = 0; i < workerCount; i++) {
    const workerId = i + 1
    const paneIdx = paneIndices[i]

    setPaneTitle(sessionName, paneIdx, `ralph-worker-${workerId}`)
    sendKeys(sessionName, paneIdx, `cd ${shellQuote(projectDir)}`)

    if (fs.existsSync(envPath)) {
      sendKeys(sessionName, paneIdx, `source ${shellQuote(envPath)}`)
    }

    sendKeys(sessionName, paneIdx, `export RALPH_WORKER_ID='${workerId}'`)
    sendKeys(sessionName, paneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
  }
}

export function ensureFakechatPortInEnv(envPath: string, fakechatPort: string): void {
  fs.mkdirSync(path.dirname(envPath), { recursive: true })
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  if (!envContent.includes('FAKECHAT_PORT=')) {
    fs.appendFileSync(envPath, `${envContent && !envContent.endsWith('\n') ? '\n' : ''}export FAKECHAT_PORT='${fakechatPort}'\n`)
  }
  fs.chmodSync(envPath, 0o600)
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

  // Write watcher FAKECHAT_PORT to .env
  const fakechatPort = getFakechatPort(config)
  const envPath = path.join(projectDir, '.ralph', '.env')
  ensureFakechatPortInEnv(envPath, fakechatPort)

  const sessionName = `ralph-${path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_')}`

  // Kill old session BEFORE cleaning up worker dirs — prevents workers from writing to dirs being deleted
  if (sessionExists(sessionName)) {
    killSession(sessionName)
  }

  // Clean up stale worker directories from previous runs with more workers
  cleanupStaleWorkers(projectDir, workerCount)
  createSession(sessionName)

  // Create workerCount + 1 (watcher) panes total — session starts with 1
  const totalPanes = workerCount + 1
  for (let i = 1; i < totalPanes; i++) {
    splitPane(sessionName)
  }
  applyLayout(sessionName, 'tiled')

  // Confirm actual pane indices after layout
  const panes = listPanes(sessionName)
  if (panes.length < workerCount + 1) {
    throw new Error(`Expected ${workerCount + 1} panes after layout, got ${panes.length}`)
  }

  // Worker panes: first workerCount panes (empty shells — watcher will launch Claude)
  const workerPanes = panes.slice(0, workerCount)
  // Watcher pane: last pane
  const watcherPaneIdx = panes[panes.length - 1]

  // Prepare worker panes with env vars but do NOT launch Claude
  prepareWorkerPanes(sessionName, workerCount, workerPanes, projectDir)

  // Watcher pane — runs Claude with fakechat for orchestrating workers
  setPaneTitle(sessionName, watcherPaneIdx, 'ralph-watcher')
  sendKeys(sessionName, watcherPaneIdx, `cd ${shellQuote(projectDir)}`)
  sendKeys(sessionName, watcherPaneIdx, `export FAKECHAT_PORT='${fakechatPort}'`)
  sendKeys(sessionName, watcherPaneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
  sendKeys(sessionName, watcherPaneIdx, `export RALPH_WORKER_COUNT='${workerCount}'`)
  sendKeys(sessionName, watcherPaneIdx, `claude -n "ralph-watcher" --channels plugin:fakechat@claude-plugins-official --dangerously-skip-permissions "/ralph-kage-bunshin-watcher"`)

  console.log(`\n[OK] Ralph team started: ${sessionName} (${workerCount} worker panes + 1 watcher)`)
  console.log(`Attaching to session...\n`)
  execFileSync('tmux', ['attach-session', '-t', sessionName], { stdio: 'inherit' })
}
