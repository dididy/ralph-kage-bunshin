import path from 'path'
import fs from 'fs'
import { createSession, splitPane, applyLayout, sendKeys, sessionExists, killSession, listPanes, setPaneTitle } from '../core/tmux'
import { initWorkerState } from '../core/state'
import { startCaffeinate } from '../core/caffeinate'
import { loadConfig } from '../core/config'
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

    initWorkerState(projectDir, workerId)
    setPaneTitle(sessionName, paneIdx, `ralph-worker-${workerId}`)

    sendKeys(sessionName, paneIdx, `cd ${shellQuote(projectDir)}`)

    if (fs.existsSync(envPath)) {
      sendKeys(sessionName, paneIdx, `source ${shellQuote(envPath)}`)
    }

    // Inject worker ID and project dir so the worker can identify itself and create worktrees
    sendKeys(sessionName, paneIdx, `export RALPH_WORKER_ID='${workerId}'`)
    sendKeys(sessionName, paneIdx, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
    sendKeys(sessionName, paneIdx, `claude -n "ralph-worker-${workerId}" --dangerously-skip-permissions "/ralph-kage-bunshin-loop"`)
  }
}

export function runTeam(workerCount: number, projectDir: string): void {
  const config = loadConfig()

  if (config.caffeinate) {
    startCaffeinate()
  }

  const sessionName = `ralph-${path.basename(projectDir).replace(/[^A-Za-z0-9_-]/g, '_')}`

  if (sessionExists(sessionName)) {
    killSession(sessionName)
  }
  createSession(sessionName)

  // Create workerCount + 1 (status) panes total — session starts with 1
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

  // Worker panes: first workerCount panes
  const workerPanes = panes.slice(0, workerCount)
  // Status pane: last pane
  const statusPaneIdx = panes[panes.length - 1]

  const workerIds = Array.from({ length: workerCount }, (_, i) => i + 1)
  launchWorkersOnPanes(sessionName, workerIds, workerPanes, projectDir)

  // Status pane — set title for reliable identification by recover
  setPaneTitle(sessionName, statusPaneIdx, 'ralph-status')
  sendKeys(sessionName, statusPaneIdx, `cd ${shellQuote(projectDir)}`)
  sendKeys(sessionName, statusPaneIdx, `ralph status --watch`)

  console.log(`\n[OK] Ralph team started: ${sessionName} (${workerCount} workers + 1 status pane)`)
  console.log(`\nTo watch workers:`)
  console.log(`  tmux attach -t '${sessionName}'\n`)
}
