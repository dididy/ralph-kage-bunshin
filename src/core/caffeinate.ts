import { spawn, execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const PID_PATH = path.join(os.homedir(), '.ralph', 'caffeinate.pid')

let caffeinateProcess: ReturnType<typeof spawn> | null = null

/** Kill a stale caffeinate process left behind by a previous ralph run. */
function killStalePid(): void {
  try {
    const pid = parseInt(fs.readFileSync(PID_PATH, 'utf-8').trim(), 10)
    if (!isNaN(pid) && isCaffeinateProcess(pid)) {
      process.kill(pid, 'SIGTERM')
    }
  } catch {
    // PID file missing or process already gone — fine
  }
  try { fs.unlinkSync(PID_PATH) } catch { /* ignore */ }
}

/** Verify the PID is actually a caffeinate process before killing it. */
function isCaffeinateProcess(pid: number): boolean {
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { stdio: 'pipe' }).toString().trim()
    return out === 'caffeinate'
  } catch {
    return false // process doesn't exist
  }
}

function writePid(pid: number): void {
  const dir = path.dirname(PID_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(PID_PATH, String(pid))
}

export function startCaffeinate(): void {
  if (process.platform !== 'darwin') return
  if (caffeinateProcess) return

  // Clean up any stale caffeinate from a previous crashed run
  killStalePid()

  caffeinateProcess = spawn('caffeinate', ['-i'], {
    detached: true,
    stdio: 'ignore',
  })
  caffeinateProcess.unref()

  if (caffeinateProcess.pid !== undefined) {
    writePid(caffeinateProcess.pid)
  }
}

