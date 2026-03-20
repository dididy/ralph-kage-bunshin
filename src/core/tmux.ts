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

export function listPanes(session: string): number[] {
  try {
    const out = execFileSync('tmux', ['list-panes', '-t', session, '-F', '#{pane_index}'], { stdio: 'pipe' })
    return out.toString().trim().split('\n').map(Number).filter(n => !isNaN(n))
  } catch {
    return []
  }
}

export function killPane(session: string, pane: number): void {
  try {
    exec(['kill-pane', '-t', `${session}.${pane}`])
  } catch {
    // pane may already be gone
  }
}

export function setPaneTitle(session: string, pane: number, title: string): void {
  try {
    exec(['select-pane', '-t', `${session}.${pane}`, '-T', title])
  } catch {
    // non-critical — older tmux versions may not support -T
  }
}

export function getActivePaneIndex(session: string): number | null {
  try {
    const out = execFileSync('tmux', ['display-message', '-t', session, '-p', '#{pane_index}'], { stdio: 'pipe' })
    const n = parseInt(out.toString().trim(), 10)
    return isNaN(n) ? null : n
  } catch {
    return null
  }
}

/**
 * Get the current foreground command running in each pane.
 * Returns a map of paneIndex → command name (e.g. "zsh", "node", "claude").
 */
export function getPaneCommands(session: string): Map<number, string> {
  const result = new Map<number, string>()
  try {
    const out = execFileSync('tmux', [
      'list-panes', '-t', session, '-F', '#{pane_index} #{pane_current_command}',
    ], { stdio: 'pipe' })
    for (const line of out.toString().trim().split('\n')) {
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx === -1) continue
      const idx = parseInt(line.slice(0, spaceIdx), 10)
      const cmd = line.slice(spaceIdx + 1)
      if (!isNaN(idx)) result.set(idx, cmd)
    }
  } catch { /* ignore */ }
  return result
}

/**
 * Find pane indices running an idle shell (zsh/bash/fish/sh).
 * Excludes the status pane (identified by running `ralph` or `node` with --watch).
 */
export function findIdlePanes(session: string): number[] {
  const cmds = getPaneCommands(session)
  const idle: number[] = []
  for (const [paneIdx, cmd] of cmds) {
    if (/^(zsh|bash|fish|sh)$/.test(cmd)) {
      idle.push(paneIdx)
    }
  }
  return idle
}

/**
 * Get pane titles for each pane in the session.
 */
export function getPaneTitles(session: string): Map<number, string> {
  const result = new Map<number, string>()
  try {
    const out = execFileSync('tmux', [
      'list-panes', '-t', session, '-F', '#{pane_index} #{pane_title}',
    ], { stdio: 'pipe' })
    for (const line of out.toString().trim().split('\n')) {
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx === -1) continue
      const idx = parseInt(line.slice(0, spaceIdx), 10)
      const title = line.slice(spaceIdx + 1)
      if (!isNaN(idx)) result.set(idx, title)
    }
  } catch { /* ignore */ }
  return result
}

/**
 * Find the status pane by title first ('ralph-status'), then fall back to
 * command detection ('node' or 'watch'). Title-based detection is reliable
 * because `team.ts` sets it explicitly; command-based is a fallback for
 * sessions created before this change.
 */
export function findStatusPane(session: string): number | null {
  // Primary: match by pane title
  const titles = getPaneTitles(session)
  for (const [paneIdx, title] of titles) {
    if (title === 'ralph-status') return paneIdx
  }
  // Fallback: match by foreground command
  const panes = listPanes(session)
  const cmds = getPaneCommands(session)
  for (const paneIdx of panes) {
    const cmd = cmds.get(paneIdx) ?? ''
    if (cmd === 'node' || cmd === 'watch') return paneIdx
  }
  return null
}
