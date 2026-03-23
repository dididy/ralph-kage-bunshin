import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { Task, WorkerState } from '../types'
import { loadConfig } from './config'

/**
 * Write a file atomically: write to a temp file in the same directory,
 * then rename. rename() is atomic on POSIX, preventing partial reads
 * when multiple workers write concurrently.
 */
function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`)
  try {
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, filePath)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* best-effort cleanup */ }
    throw e
  }
}

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
  const filePath = path.join(projectDir, '.ralph', 'tasks.json')
  atomicWriteFileSync(filePath, JSON.stringify({ tasks }, null, 2))
}

const WORKER_STATE_REQUIRED_FIELDS = [
  'worker_id', 'task', 'generation', 'consecutive_failures', 'converged',
  'pathology', 'dod_checklist', 'last_results', 'started_at', 'updated_at',
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
  const filePath = path.join(projectDir, '.ralph', 'workers', `worker-${workerId}`, 'state.json')
  atomicWriteFileSync(filePath, JSON.stringify(state, null, 2))
}

export function createInitialWorkerState(workerId: number): WorkerState {
  const now = new Date().toISOString()
  return {
    worker_id: workerId,
    task: 'pending',
    generation: 0,
    consecutive_failures: 0,
    last_results: [],
    pathology: { stagnation: false, oscillation: false, wonder_loop: false, external_service_block: false },
    approach_history: [],
    dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false, visual_regression: false, skill_artifacts: false },
    converged: false,
    started_at: now,
    updated_at: now,
  }
}

export function initWorkerState(projectDir: string, workerId: number, opts?: { preserveStartedAt?: boolean; fakechatPort?: number }): void {
  const fresh = createInitialWorkerState(workerId)
  if (opts?.preserveStartedAt) {
    const existing = readWorkerState(projectDir, workerId)
    if (existing?.started_at) {
      fresh.started_at = existing.started_at
    }
  }
  if (opts?.fakechatPort) {
    fresh.fakechat_port = opts.fakechatPort
  }
  writeWorkerState(projectDir, workerId, fresh)
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
