import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readTasks, writeTasks, readWorkerState, writeWorkerState, updateTaskStatus, claimTask, renewLease, resetExpiredLeases, resetStuckTasks, getClaimableTasks, createInitialWorkerState, initWorkerState } from '../../src/core/state'
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

  it('returns empty array for malformed JSON', () => {
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), 'not json')
    expect(readTasks(tmpDir)).toEqual([])
  })

  it('returns empty array when tasks is not an array', () => {
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify({ tasks: 'bad' }))
    expect(readTasks(tmpDir)).toEqual([])
  })

  it('skips tasks with non-number id', () => {
    const data = { tasks: [
      { id: 'bad', name: 'task', status: 'pending', worker: null },
      { id: 1, name: 'good', status: 'pending', worker: null },
    ] }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    const tasks = readTasks(tmpDir)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].name).toBe('good')
  })

  it('skips tasks with non-string name', () => {
    const data = { tasks: [{ id: 1, name: 123, status: 'pending', worker: null }] }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    expect(readTasks(tmpDir)).toHaveLength(0)
  })

  it('skips tasks with invalid status', () => {
    const data = { tasks: [{ id: 1, name: 'task', status: 'unknown', worker: null }] }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    expect(readTasks(tmpDir)).toHaveLength(0)
  })

  it('skips tasks with non-number worker (not null)', () => {
    const data = { tasks: [{ id: 1, name: 'task', status: 'pending', worker: 'bad' }] }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    expect(readTasks(tmpDir)).toHaveLength(0)
  })

  it('skips tasks with invalid depends_on', () => {
    const data = { tasks: [{ id: 1, name: 'task', status: 'pending', worker: null, depends_on: ['bad'] }] }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    expect(readTasks(tmpDir)).toHaveLength(0)
  })

  it('skips non-object task entries', () => {
    const data = { tasks: [null, 42, 'string', { id: 1, name: 'good', status: 'pending', worker: null }] }
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
    expect(readTasks(tmpDir)).toHaveLength(1)
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

  it('readWorkerState returns null when file does not exist', () => {
    expect(readWorkerState(tmpDir, 999)).toBeNull()
  })

  it('readWorkerState returns null for malformed JSON', () => {
    const dir = path.join(tmpDir, '.ralph', 'workers', 'worker-1')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'state.json'), 'not json')
    expect(readWorkerState(tmpDir, 1)).toBeNull()
  })

  it('readWorkerState returns null when required fields are missing', () => {
    const dir = path.join(tmpDir, '.ralph', 'workers', 'worker-1')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ worker_id: 1 }))
    expect(readWorkerState(tmpDir, 1)).toBeNull()
  })

  it('readWorkerState returns null when task field is not a string', () => {
    const dir = path.join(tmpDir, '.ralph', 'workers', 'worker-1')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
      worker_id: 1, task: 123, generation: 0, converged: false,
      pathology: {}, dod_checklist: {}, last_results: [],
      started_at: '', updated_at: '', consecutive_failures: 0,
    }))
    expect(readWorkerState(tmpDir, 1)).toBeNull()
  })

  it('createInitialWorkerState returns correct structure', () => {
    const state = createInitialWorkerState(5)
    expect(state.worker_id).toBe(5)
    expect(state.task).toBe('pending')
    expect(state.generation).toBe(0)
    expect(state.converged).toBe(false)
    expect(state.pathology.stagnation).toBe(false)
  })

  it('initWorkerState writes initial state to disk', () => {
    initWorkerState(tmpDir, 3)
    const loaded = readWorkerState(tmpDir, 3)
    expect(loaded).not.toBeNull()
    expect(loaded!.worker_id).toBe(3)
    expect(loaded!.task).toBe('pending')
  })

  describe('lease', () => {
    it('claimTask sets claimed_at and lease_expires_at 30 minutes out', () => {
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
      const diff = expiresAt.getTime() - claimedAt.getTime()
      expect(diff).toBe(30 * 60 * 1000)
    })

    it('claimTask does not claim non-pending tasks', () => {
      const data = { tasks: [{ id: 1, name: 'auth', status: 'in-progress', worker: 1 }] }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      claimTask(tmpDir, 1, 2)
      const tasks = readTasks(tmpDir)
      expect(tasks[0].worker).toBe(1) // unchanged
    })

    it('renewLease updates lease_expires_at to now + 30 minutes', () => {
      const oldExpiry = new Date(Date.now() + 60 * 1000).toISOString()
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
      const diff = newExpiry.getTime() - before.getTime()
      expect(diff).toBeGreaterThanOrEqual(30 * 60 * 1000)
      expect(diff).toBeLessThanOrEqual(30 * 60 * 1000 + (after.getTime() - before.getTime()) + 1000)
    })

    it('renewLease does not renew for different worker', () => {
      const data = {
        tasks: [{
          id: 1, name: 'auth', status: 'in-progress', worker: 2,
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 60000).toISOString(),
        }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))

      const oldExpiry = readTasks(tmpDir)[0].lease_expires_at
      renewLease(tmpDir, 1, 999) // wrong worker
      const newExpiry = readTasks(tmpDir)[0].lease_expires_at
      expect(newExpiry).toBe(oldExpiry)
    })

    it('renewLease does not renew for non-in-progress task', () => {
      const data = {
        tasks: [{
          id: 1, name: 'done', status: 'converged', worker: 2,
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 60000).toISOString(),
        }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))

      const oldExpiry = readTasks(tmpDir)[0].lease_expires_at
      renewLease(tmpDir, 1, 2) // correct worker but wrong status
      const newExpiry = readTasks(tmpDir)[0].lease_expires_at
      expect(newExpiry).toBe(oldExpiry)
    })

    it('resetExpiredLeases resets expired tasks to pending and returns their ids', () => {
      const expired = new Date(Date.now() - 1000).toISOString()
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

    it('resetExpiredLeases does not expire tasks without lease_expires_at', () => {
      const data = {
        tasks: [{ id: 1, name: 'task', status: 'in-progress', worker: 1 }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      expect(resetExpiredLeases(tmpDir)).toEqual([])
    })

    it('resetStuckTasks resets tasks whose worker has not updated in over 10 minutes', () => {
      const data = {
        tasks: [
          { id: 1, name: 'stuck-task', status: 'in-progress', worker: 1, claimed_at: new Date().toISOString(), lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
          { id: 2, name: 'active-task', status: 'in-progress', worker: 2, claimed_at: new Date().toISOString(), lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
        ]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))

      const stuckState = {
        worker_id: 1, task: 'stuck-task', generation: 2,
        consecutive_failures: 0, last_results: [] as ('pass' | 'fail')[],
        pathology: { stagnation: false, oscillation: false, wonder_loop: false },
        dod_checklist: { npm_test: false, npm_build: false, tasks_complete: false },
        converged: false,
        started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      }
      writeWorkerState(tmpDir, 1, stuckState)

      const activeState = {
        ...stuckState, worker_id: 2, task: 'active-task',
        updated_at: new Date(Date.now() - 60 * 1000).toISOString(),
      }
      writeWorkerState(tmpDir, 2, activeState)

      const stuckIds = resetStuckTasks(tmpDir)
      expect(stuckIds).toEqual([1])

      const tasks = readTasks(tmpDir)
      expect(tasks[0].status).toBe('pending')
      expect(tasks[0].worker).toBeNull()
      expect(tasks[1].status).toBe('in-progress')
      expect(tasks[1].worker).toBe(2)
    })

    it('resetStuckTasks skips tasks with null worker', () => {
      const data = {
        tasks: [{ id: 1, name: 'task', status: 'in-progress', worker: null }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      expect(resetStuckTasks(tmpDir)).toEqual([])
    })

    it('resetStuckTasks skips tasks with missing worker state', () => {
      const data = {
        tasks: [{ id: 1, name: 'task', status: 'in-progress', worker: 99 }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      expect(resetStuckTasks(tmpDir)).toEqual([])
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

    it('getClaimableTasks returns tasks with empty depends_on', () => {
      const data = {
        tasks: [{ id: 1, name: 'setup', status: 'pending', worker: null, depends_on: [] }]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      expect(getClaimableTasks(tmpDir)).toHaveLength(1)
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
      expect(tasks[1].status).toBe('pending')
      expect(tasks[1].worker).toBeNull()
    })

    it('warns when depends_on references non-existent task id', () => {
      const data = {
        tasks: [
          { id: 1, name: 'setup', status: 'pending', worker: null, depends_on: [999] },
        ]
      }
      fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.ralph', 'tasks.json'), JSON.stringify(data))
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      getClaimableTasks(tmpDir)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('depends_on unknown task id 999'))
      spy.mockRestore()
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

  it('writeTasks produces a valid file readable by readTasks (atomic write roundtrip)', () => {
    const tasks = [
      { id: 1, name: 'a', status: 'pending' as const, worker: null },
      { id: 2, name: 'b', status: 'converged' as const, worker: 1 },
    ]
    writeTasks(tmpDir, tasks)
    const loaded = readTasks(tmpDir)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].name).toBe('a')
    expect(loaded[1].worker).toBe(1)
    const ralphDir = path.join(tmpDir, '.ralph')
    const files = fs.readdirSync(ralphDir)
    expect(files.filter(f => f.startsWith('.tmp'))).toHaveLength(0)
  })

  it('atomicWrite cleans up temp file on write failure', () => {
    // Create the .ralph dir first so mkdirSync succeeds
    fs.mkdirSync(path.join(tmpDir, '.ralph'), { recursive: true })

    // Make the directory read-only to cause writeFileSync to fail on the temp file
    const ralphDir = path.join(tmpDir, '.ralph')
    fs.chmodSync(ralphDir, 0o555)

    try {
      expect(() => writeTasks(tmpDir, [{ id: 1, name: 'a', status: 'pending', worker: null }])).toThrow()
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(ralphDir, 0o755)
    }

    // No temp files should remain
    const files = fs.readdirSync(ralphDir)
    expect(files.filter(f => f.startsWith('.tmp'))).toHaveLength(0)
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
