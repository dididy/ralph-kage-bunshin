import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function exec(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()
}

function gitAvailable(projectDir: string): boolean {
  try {
    exec(['rev-parse', '--git-dir'], projectDir)
    return true
  } catch {
    return false
  }
}

/**
 * Create a git worktree for a worker at .ralph/workers/worker-N/worktree
 * on a new branch feat/worker-N-<taskSlug>.
 * Returns the worktree path, or null if git is not available.
 */
export function createWorktree(projectDir: string, workerId: number, taskName: string): string | null {
  if (!gitAvailable(projectDir)) {
    console.warn('[WARN] git not available — isolated task will run in main directory')
    return null
  }

  const slug = taskName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  const branch = `feat/worker-${workerId}-${slug}`
  const worktreePath = path.join(projectDir, '.ralph', 'workers', `worker-${workerId}`, 'worktree')

  // Remove stale worktree if it exists
  if (fs.existsSync(worktreePath)) {
    try {
      exec(['worktree', 'remove', '--force', worktreePath], projectDir)
    } catch {
      fs.rmSync(worktreePath, { recursive: true, force: true })
    }
  }

  // Delete branch if it already exists (from a previous crashed run)
  try {
    exec(['branch', '-D', branch], projectDir)
  } catch {
    // branch didn't exist — fine
  }

  exec(['worktree', 'add', '-b', branch, worktreePath], projectDir)
  console.log(`[WORKTREE] Created: ${worktreePath} on branch ${branch}`)
  return worktreePath
}

/**
 * Remove the worktree for a worker and delete its branch.
 * Called after the worker converges and changes are merged/PR'd.
 */
export function removeWorktree(projectDir: string, workerId: number, taskName: string): void {
  const slug = taskName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  const branch = `feat/worker-${workerId}-${slug}`
  const worktreePath = path.join(projectDir, '.ralph', 'workers', `worker-${workerId}`, 'worktree')

  if (fs.existsSync(worktreePath)) {
    try {
      exec(['worktree', 'remove', '--force', worktreePath], projectDir)
      console.log(`[WORKTREE] Removed: ${worktreePath}`)
    } catch (e) {
      console.warn(`[WARN] Could not remove worktree ${worktreePath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  try {
    exec(['branch', '-D', branch], projectDir)
    console.log(`[WORKTREE] Branch deleted: ${branch}`)
  } catch {
    // branch already gone — fine
  }
}

/**
 * Get the worktree path for a worker if it exists, otherwise return projectDir.
 */
export function getWorktreePath(projectDir: string, workerId: number): string {
  const worktreePath = path.join(projectDir, '.ralph', 'workers', `worker-${workerId}`, 'worktree')
  return fs.existsSync(worktreePath) ? worktreePath : projectDir
}
