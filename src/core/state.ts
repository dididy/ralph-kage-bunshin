import fs from 'fs'
import path from 'path'
import type { Task, WorkerState } from '../types'

export function readTasks(projectDir: string): Task[] {
  const filePath = path.join(projectDir, '.ralph', 'tasks.json')
  if (!fs.existsSync(filePath)) return []
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return data.tasks ?? []
  } catch {
    console.warn(`[WARN] could not parse ${filePath}`)
    return []
  }
}

export function writeTasks(projectDir: string, tasks: Task[]): void {
  const dir = path.join(projectDir, '.ralph')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'tasks.json'), JSON.stringify({ tasks }, null, 2))
}

export function readWorkerState(projectDir: string, workerId: number): WorkerState | null {
  const filePath = path.join(projectDir, '.ralph', 'workers', `worker-${workerId}`, 'state.json')
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    console.warn(`[WARN] could not parse ${filePath}`)
    return null
  }
}

export function writeWorkerState(projectDir: string, workerId: number, state: WorkerState): void {
  const dir = path.join(projectDir, '.ralph', 'workers', `worker-${workerId}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2))
}

export function updateTaskStatus(projectDir: string, taskId: number, status: Task['status']): void {
  const tasks = readTasks(projectDir)
  const updated = tasks.map(t => t.id === taskId ? { ...t, status } : t)
  writeTasks(projectDir, updated)
}

const LEASE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

// Returns pending tasks whose dependencies are all converged (or have no dependencies)
export function getClaimableTasks(projectDir: string): Task[] {
  const tasks = readTasks(projectDir)
  const convergedIds = new Set(tasks.filter(t => t.status === 'converged').map(t => t.id))
  return tasks.filter(t => {
    if (t.status !== 'pending') return false
    if (!t.depends_on || t.depends_on.length === 0) return true
    return t.depends_on.every(dep => convergedIds.has(dep))
  })
}

export function claimTask(projectDir: string, taskId: number, workerId: number): void {
  const tasks = readTasks(projectDir)
  const convergedIds = new Set(tasks.filter(t => t.status === 'converged').map(t => t.id))
  const now = new Date()
  const updated = tasks.map(t => {
    if (t.id !== taskId) return t
    // Only claim if pending — any other status (in-progress, converged, pathology) is protected
    if (t.status !== 'pending') return t
    // Block claim if dependencies are not yet converged
    if (t.depends_on && t.depends_on.length > 0) {
      if (!t.depends_on.every(dep => convergedIds.has(dep))) return t
    }
    return {
      ...t,
      status: 'in-progress' as const,
      worker: Number(workerId),
      claimed_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + LEASE_DURATION_MS).toISOString(),
    }
  })
  writeTasks(projectDir, updated)
}

export function renewLease(projectDir: string, taskId: number, workerId: number): void {
  const tasks = readTasks(projectDir)
  const updated = tasks.map(t => {
    if (t.id !== taskId) return t
    // Only renew if this worker still owns the task and it's in-progress
    if (t.status !== 'in-progress' || Number(t.worker) !== Number(workerId)) return t
    return {
      ...t,
      lease_expires_at: new Date(Date.now() + LEASE_DURATION_MS).toISOString(),
    }
  })
  writeTasks(projectDir, updated)
}

const STUCK_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

export function resetStuckTasks(projectDir: string): number[] {
  const tasks = readTasks(projectDir)
  const now = Date.now()
  const stuckIds: number[] = []

  const updated = tasks.map(t => {
    if (t.status !== 'in-progress' || t.worker === null) return t
    const state = readWorkerState(projectDir, Number(t.worker))
    if (!state) return t
    const lastUpdate = new Date(state.updated_at).getTime()
    if (now - lastUpdate > STUCK_THRESHOLD_MS) {
      stuckIds.push(t.id)
      const { claimed_at: _ca, lease_expires_at: _le, ...rest } = t
      return { ...rest, status: 'pending' as const, worker: null }
    }
    return t
  })

  if (stuckIds.length > 0) {
    writeTasks(projectDir, updated)
  }

  return stuckIds
}

export function resetExpiredLeases(projectDir: string): number[] {
  const tasks = readTasks(projectDir)
  const now = Date.now()
  const expiredIds: number[] = []

  const updated = tasks.map(t => {
    const expiry = t.lease_expires_at ? new Date(t.lease_expires_at).getTime() : NaN
    if (t.status === 'in-progress' && !isNaN(expiry) && expiry < now) {
      expiredIds.push(t.id)
      const { claimed_at: _ca, lease_expires_at: _le, ...rest } = t
      return { ...rest, status: 'pending' as const, worker: null }
    }
    return t
  })

  if (expiredIds.length > 0) {
    writeTasks(projectDir, updated)
  }

  return expiredIds
}
