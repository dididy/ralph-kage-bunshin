import path from 'path'
import fs from 'fs'
import { createSession, splitPane, applyLayout, sendKeys, sessionExists, killSession } from '../core/tmux'
import { writeWorkerState } from '../core/state'
import { startCaffeinate } from '../core/caffeinate'
import { loadConfig } from '../core/config'

export function launchWorkers(
  sessionName: string,
  workerIds: number[],
  projectDir: string,
): void {
  const shellQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  const envPath = path.join(projectDir, '.ralph', '.env')

  for (let i = 0; i < workerIds.length; i++) {
    const workerId = workerIds[i]

    writeWorkerState(projectDir, workerId, {
      worker_id: workerId,
      task: 'pending',
      generation: 0,
      consecutive_failures: 0,
      last_results: [],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
      converged: false,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    sendKeys(sessionName, i, `cd ${shellQuote(projectDir)}`)

    if (fs.existsSync(envPath)) {
      sendKeys(sessionName, i, `source ${shellQuote(envPath)}`)
    }

    // Inject worker ID and project dir so the worker can identify itself and create worktrees
    sendKeys(sessionName, i, `export RALPH_WORKER_ID=${workerId}`)
    sendKeys(sessionName, i, `export RALPH_PROJECT_DIR=${shellQuote(projectDir)}`)
    sendKeys(sessionName, i, `claude --dangerously-skip-permissions "/ralph-kage-bunshin-loop"`)
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

  for (let i = 1; i < workerCount; i++) {
    splitPane(sessionName)
    applyLayout(sessionName, 'tiled')
  }

  const workerIds = Array.from({ length: workerCount }, (_, i) => i + 1)
  launchWorkers(sessionName, workerIds, projectDir)

  console.log(`\n[OK] Ralph team started: ${sessionName} (${workerCount} workers)`)
  console.log(`\nTo watch workers:`)
  console.log(`  tmux attach -t '${sessionName}'`)
  console.log(`\nTo monitor status:`)
  console.log(`  ralph status --watch\n`)
}
