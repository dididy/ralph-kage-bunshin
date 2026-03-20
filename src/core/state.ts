import fs from 'fs'
import path from 'path'
import type { Task, WorkerState } from '../types'
import { loadConfig } from './config'

export function readTasks(projectDir: string): Task[] {
  const filePath = path.join(projectDir, '.ralph', 'tasks.json')
  if (!fs.existsSync(filePath)) return []
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (!Array.isArray(data.tasks)) {
      console.warn(`[WARN] ${filePath}: expected data.tasks to be an array, got ${typeof data.tasks}`)
      return []
    }
    const VALID_STATUSES = new Set(['pending', 'in-progress', 'converged', 'pathology'])
    const valid = (data.tasks as unknown[]).filter((t, i) => {
      if (typeof t !== 'object' || t === null) {
        console.warn(`[WARN] ${filePath}: task[${i}] is not an object — skipped`)
        return false
      }
      const task = t as Record<string, unknown>
      if (typeof task.id !== 'number') {
        console.warn(`[WARN] ${filePath}: task[${i}].id must be a number — skipped`)
        return false
      }
      if (typeof task.name !== 'string') {
        console.warn(`[WARN] ${filePath}: task[${i}].name must be a string — skipped`)
        return false
      }
      if (!VALID_STATUSES.has(task.status as string)) {
        console.warn(`[WARN] ${filePath}: task[${i}].status "${task.status}" is invalid — skipped`)
        return false
      }
      if (task.worker !== null && typeof task.worker !== 'number') {
        console.warn(`[WARN] ${filePath}: task[${i}].worker must be number or null — skipped`)
        return false
      }
      if (task.depends_on !== undefined && (!Array.isArray(task.depends_on) || !(task.depends_on as unknown[]).every(d => typeof d === 'number'))) {
        console.warn(`[WARN] ${filePath}: task[${i}].depends_on must be number[] — skipped`)
        return false
      }
      return true
    })
    return valid as Task[]
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

const WORKER_STATE_REQUIRED_FIELDS = [
  'worker_id', 'generation', 'converged', 'pathology',
  'dod_checklist', 'last_results', 'started_at', 'updated_at',
] as const

export function readWorkerState(projectDir: string, workerId: number): WorkerState | null {
  const filePath = path.join(projectDir, '.ralph', 'workers', `worker-${workerId}`, 'state.json')
  if (!fs.existsSync(filePath)) return null
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    const missing = WORKER_STATE_REQUIRED_FIELDS.filter(f => !(f in data))
    if (missing.length > 0) {
      console.warn(`[WARN] ${filePath}: missing required fields: ${missing.join(', ')}`)
      return null
    }
    if (typeof data.task !== 'string') {
      console.warn(`[WARN] ${filePath}: field 'task' must be a string, got ${typeof data.task}`)
      return null
    }
    return data as WorkerState
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

export function createInitialWorkerState(workerId: number): WorkerState {
  const now = new Date().toISOString()
  return {
    worker_id: workerId,
    task: 'pending',
    generation: 0,
    consecutive_failures: 0,
    last_results: [],
    pathology: { stagnation: false, oscillation: false, wonder_loop: false },
    dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
    converged: false,
    started_at: now,
    updated_at: now,
  }
}

export function initWorkerState(projectDir: string, workerId: number): void {
  writeWorkerState(projectDir, workerId, createInitialWorkerState(workerId))
}

export function updateTaskStatus(projectDir: string, taskId: number, status: Task['status']): void {
  const tasks = readTasks(projectDir)
  const updated = tasks.map(t => t.id === taskId ? { ...t, status } : t)
  writeTasks(projectDir, updated)
}

export const LEASE_DURATION_MS = 30 * 60 * 1000 // 30 minutes

function warnMissingDependencies(tasks: Task[]): void {
  const taskIds = new Set(tasks.map(t => t.id))
  for (const t of tasks) {
    if (!t.depends_on) continue
    for (const dep of t.depends_on) {
      if (!taskIds.has(dep)) {
        console.warn(`[WARN] task ${t.id} depends_on unknown task id ${dep}`)
      }
    }
  }
}

// Returns pending tasks whose dependencies are all converged (or have no dependencies)
export function getClaimableTasks(projectDir: string): Task[] {
  const tasks = readTasks(projectDir)
  warnMissingDependencies(tasks)
  const convergedIds = new Set(tasks.filter(t => t.status === 'converged').map(t => t.id))
  return tasks.filter(t => {
    if (t.status !== 'pending') return false
    if (!t.depends_on || t.depends_on.length === 0) return true
    return t.depends_on.every(dep => convergedIds.has(dep))
  })
}

export function claimTask(projectDir: string, taskId: number, workerId: number): void {
  const tasks = readTasks(projectDir)
  warnMissingDependencies(tasks)
  const convergedIds = new Set(tasks.filter(t => t.status === 'converged').map(t => t.id))
  const now = new Date()
  const leaseDurationMs = loadConfig().leaseDurationMs ?? LEASE_DURATION_MS
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
      lease_expires_at: new Date(now.getTime() + leaseDurationMs).toISOString(),
    }
  })
  writeTasks(projectDir, updated)
}

export function renewLease(projectDir: string, taskId: number, workerId: number): void {
  const tasks = readTasks(projectDir)
  const leaseDurationMs = loadConfig().leaseDurationMs ?? LEASE_DURATION_MS
  const updated = tasks.map(t => {
    if (t.id !== taskId) return t
    // Only renew if this worker still owns the task and it's in-progress
    if (t.status !== 'in-progress' || Number(t.worker) !== Number(workerId)) return t
    return {
      ...t,
      lease_expires_at: new Date(Date.now() + leaseDurationMs).toISOString(),
    }
  })
  writeTasks(projectDir, updated)
}

export const STUCK_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

export function resetStuckTasks(projectDir: string): number[] {
  const tasks = readTasks(projectDir)
  const now = Date.now()
  const stuckIds: number[] = []
  const stuckThresholdMs = loadConfig().stuckThresholdMs ?? STUCK_THRESHOLD_MS

  const updated = tasks.map(t => {
    if (t.status !== 'in-progress' || t.worker === null) return t
    const state = readWorkerState(projectDir, Number(t.worker))
    if (!state) return t
    const lastUpdate = new Date(state.updated_at).getTime()
    if (now - lastUpdate > stuckThresholdMs) {
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
