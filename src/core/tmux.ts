import { execFileSync } from 'child_process'

export class TmuxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TmuxError'
  }
}

function exec(args: string[]): void {
  try {
    execFileSync('tmux', args, { stdio: 'pipe' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new TmuxError(`tmux command failed: ${args.join(' ')}\n${msg}`)
  }
}

export function createSession(name: string): void {
  exec(['new-session', '-d', '-s', name])
}

export function splitPane(session: string, vertical = false): void {
  const flag = vertical ? '-v' : '-h'
  exec(['split-window', flag, '-t', session])
}

export function applyLayout(session: string, layout: 'even-horizontal' | 'even-vertical' | 'tiled' = 'tiled'): void {
  exec(['select-layout', '-t', session, layout])
}

/**
 * Send keystrokes to a tmux pane, followed by Enter.
 * WARNING: `command` is sent verbatim as keystrokes — shell-quote any user-supplied
 * strings before passing them here to prevent injection via special characters.
 */
export function sendKeys(session: string, pane: number, command: string): void {
  exec(['send-keys', '-t', `${session}.${pane}`, command, 'Enter'])
}

export function killSession(session: string): void {
  exec(['kill-session', '-t', session])
}

export function sessionExists(name: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', name], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
