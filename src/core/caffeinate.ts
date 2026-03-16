import { spawn } from 'child_process'

let caffeinateProcess: ReturnType<typeof spawn> | null = null

export function startCaffeinate(): void {
  if (process.platform !== 'darwin') return
  if (caffeinateProcess) return
  caffeinateProcess = spawn('caffeinate', ['-i'], {
    detached: true,
    stdio: 'ignore',
  })
  caffeinateProcess.unref()
}

export function stopCaffeinate(): void {
  if (caffeinateProcess) {
    caffeinateProcess.kill()
    caffeinateProcess = null
  }
}
