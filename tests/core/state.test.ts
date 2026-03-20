import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readTasks, writeTasks, readWorkerState, writeWorkerState, updateTaskStatus, claimTask, renewLease, resetExpiredLeases, getClaimableTasks } from '../../src/core/state'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('state', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns an empty array when tasks.json does not exist', () => {
    const tasks = readTasks(tmpDir)
    expect(tasks).toEqual([])
  })

  it('reads and parses tasks.json', () => {
    const data = { tasks: [{ id: 1, name: 'test-task', status: 'pending', worker: null }] }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    const tasks = readTasks(tmpDir)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].name).toBe('test-task')
  })

  it('writes WorkerState to state.json', () => {
    const state = {
      worker_id: 1, task: 'test-task', generation: 0,
      consecutive_failures: 0, last_results: [] as ('pass' | 'fail')[],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
      converged: false, started_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    writeWorkerState(tmpDir, 1, state)
    const saved = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.ralph', 'workers', 'worker-1', 'state.json'), 'utf-8')
    )
    expect(saved.worker_id).toBe(1)
  })

  it('reads state.json and returns WorkerState', () => {
    const state = {
      worker_id: 2, task: 'recipe-task', generation: 3,
      consecutive_failures: 0, last_results: ['pass'] as ('pass' | 'fail')[],
      pathology: { stagnation: false, oscillation: false, wonder_loop: false },
      dod_checklist: { npm_test: true, npm_build: false, tasks_complete: false },
      converged: false, started_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    writeWorkerState(tmpDir, 2, state)
    const loaded = readWorkerState(tmpDir, 2)
    expect(loaded?.generation).toBe(3)
    expect(loaded?.dod_checklist.npm_test).toBe(true)
  })

  describe('lease', () => {
    it('claimTask sets claimed_at and lease_expires_at 5 minutes out', () => {
      const data = { tasks: [{ id: 1, name: 'auth', status: 'pending', worker: null }] }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))

      const before = new Date()
      claimTask(tmpDir, 1, 2)
      const after = new Date()

      const tasks = readTasks(tmpDir)
      const t = tasks[0]
      expect(t.status).toBe('in-progress')
      expect(t.worker).toBe(2)
      expect(t.claimed_at).toBeDefined()
      expect(t.lease_expires_at).toBeDefined()

      const claimedAt = new Date(t.claimed_at!)
      const expiresAt = new Date(t.lease_expires_at!)
      expect(claimedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(claimedAt.getTime()).toBeLessThanOrEqual(after.getTime())
      // lease is 30 minutes from claimed_at
      const diff = expiresAt.getTime() - claimedAt.getTime()
      expect(diff).toBe(30 * 60 * 1000)
    })

    it('renewLease updates lease_expires_at to now + 30 minutes', () => {
      const oldExpiry = new Date(Date.now() + 60 * 1000).toISOString() // 1 min from now
      const data = {
        tasks: [{
          id: 1, name: 'auth', status: 'in-progress', worker: 2,
          claimed_at: new Date().toISOString(),
          lease_expires_at: oldExpiry,
        }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))

      const before = new Date()
      renewLease(tmpDir, 1, 2)
      const after = new Date()

      const tasks = readTasks(tmpDir)
      const t = tasks[0]
      const newExpiry = new Date(t.lease_expires_at!)
      // should be ~30 min from now
      const diff = newExpiry.getTime() - before.getTime()
      expect(diff).toBeGreaterThanOrEqual(30 * 60 * 1000)
      expect(diff).toBeLessThanOrEqual(30 * 60 * 1000 + (after.getTime() - before.getTime()) + 1000)
    })

    it('resetExpiredLeases resets expired tasks to pending and returns their ids', () => {
      const expired = new Date(Date.now() - 1000).toISOString() // 1 second ago
      const valid = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      const data = {
        tasks: [
          { id: 1, name: 'expired-task', status: 'in-progress', worker: 1, claimed_at: new Date().toISOString(), lease_expires_at: expired },
          { id: 2, name: 'valid-task', status: 'in-progress', worker: 2, claimed_at: new Date().toISOString(), lease_expires_at: valid },
          { id: 3, name: 'pending-task', status: 'pending', worker: null },
        ]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))

      const expiredIds = resetExpiredLeases(tmpDir)
      expect(expiredIds).toEqual([1])

      const tasks = readTasks(tmpDir)
      expect(tasks[0].status).toBe('pending')
      expect(tasks[0].worker).toBeNull()
      expect(tasks[0].claimed_at).toBeUndefined()
      expect(tasks[0].lease_expires_at).toBeUndefined()
      expect(tasks[1].status).toBe('in-progress')
      expect(tasks[2].status).toBe('pending')
    })

    it('resetExpiredLeases returns empty array when no leases expired', () => {
      const valid = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      const data = {
        tasks: [{ id: 1, name: 'task', status: 'in-progress', worker: 1, claimed_at: new Date().toISOString(), lease_expires_at: valid }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      expect(resetExpiredLeases(tmpDir)).toEqual([])
    })
  })

  describe('depends_on', () => {
    it('getClaimableTasks returns pending tasks with no depends_on', () => {
      const data = {
        tasks: [
          { id: 1, name: 'setup', status: 'pending', worker: null },
          { id: 2, name: 'auth', status: 'pending', worker: null, depends_on: [1] },
        ]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      const claimable = getClaimableTasks(tmpDir)
      expect(claimable).toHaveLength(1)
      expect(claimable[0].id).toBe(1)
    })

    it('getClaimableTasks includes tasks whose depends_on are all converged', () => {
      const data = {
        tasks: [
          { id: 1, name: 'setup', status: 'converged', worker: 1 },
          { id: 2, name: 'auth', status: 'pending', worker: null, depends_on: [1] },
        ]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      const claimable = getClaimableTasks(tmpDir)
      expect(claimable).toHaveLength(1)
      expect(claimable[0].id).toBe(2)
    })

    it('claimTask blocks claiming when depends_on tasks are not yet converged', () => {
      const data = {
        tasks: [
          { id: 1, name: 'setup', status: 'in-progress', worker: 1 },
          { id: 2, name: 'auth', status: 'pending', worker: null, depends_on: [1] },
        ]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      claimTask(tmpDir, 2, 3)
      const tasks = readTasks(tmpDir)
      // task 2 remains pending — dependency (task 1) is still in-progress
      expect(tasks[1].status).toBe('pending')
      expect(tasks[1].worker).toBeNull()
    })

    it('claimTask succeeds when all depends_on tasks are converged', () => {
      const data = {
        tasks: [
          { id: 1, name: 'setup', status: 'converged', worker: 1 },
          { id: 2, name: 'auth', status: 'pending', worker: null, depends_on: [1] },
        ]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      claimTask(tmpDir, 2, 3)
      const tasks = readTasks(tmpDir)
      expect(tasks[1].status).toBe('in-progress')
      expect(tasks[1].worker).toBe(3)
    })
  })

  it('updateTaskStatus changes only the target task status', () => {
    const data = {
      tasks: [
        { id: 1, name: 'task-1', status: 'pending', worker: 1 },
        { id: 2, name: 'task-2', status: 'pending', worker: 2 },
      ]
    }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    updateTaskStatus(tmpDir, 1, 'in-progress')
    const tasks = readTasks(tmpDir)
    expect(tasks[0].status).toBe('in-progress')
    expect(tasks[1].status).toBe('pending')
  })
})
