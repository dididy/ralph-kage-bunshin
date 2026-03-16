import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWorktree, removeWorktree, getWorktreePath } from '../../src/core/worktree'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

vi.mock('child_process')
vi.mock('fs')

describe('worktree', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('createWorktree', () => {
    it('returns null when git is not available', () => {
      vi.mocked(execFileSync).mockImplementation(() => { throw new Error('git not found') })
      const result = createWorktree('/proj', 1, 'Auth module')
      expect(result).toBeNull()
    })

    it('creates worktree with slugified branch name', () => {
      const calls: string[][] = []
      vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
        calls.push(args as string[])
        return Buffer.from('')
      })
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = createWorktree('/proj', 2, 'Auth module — login + register')
      expect(result).toBe(path.join('/proj', '.ralph', 'workers', 'worker-2', 'worktree'))
      // last call should be worktree add
      const addCall = calls.find(a => a[0] === 'worktree' && a[1] === 'add')
      expect(addCall).toBeDefined()
      expect(addCall![2]).toBe('-b')
      expect(addCall![3]).toMatch(/^feat\/worker-2-auth-module/)
    })

    it('removes stale worktree before creating a new one', () => {
      const calls: string[][] = []
      vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
        calls.push(args as string[])
        return Buffer.from('')
      })
      vi.mocked(fs.existsSync).mockReturnValue(true) // stale worktree exists
      vi.mocked(fs.rmSync).mockReturnValue(undefined)

      createWorktree('/proj', 1, 'setup')
      const removeCall = calls.find(a => a[0] === 'worktree' && a[1] === 'remove')
      expect(removeCall).toBeDefined()
    })
  })

  describe('getWorktreePath', () => {
    it('returns worktree path when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const result = getWorktreePath('/proj', 1)
      expect(result).toBe(path.join('/proj', '.ralph', 'workers', 'worker-1', 'worktree'))
    })

    it('returns projectDir when worktree does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      const result = getWorktreePath('/proj', 1)
      expect(result).toBe('/proj')
    })
  })

  describe('removeWorktree', () => {
    it('removes worktree and deletes branch', () => {
      const calls: string[][] = []
      vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
        calls.push(args as string[])
        return Buffer.from('')
      })
      vi.mocked(fs.existsSync).mockReturnValue(true)

      removeWorktree('/proj', 1, 'Auth module')
      const removeCall = calls.find(a => a[0] === 'worktree' && a[1] === 'remove')
      const branchDelete = calls.find(a => a[0] === 'branch' && a[1] === '-D')
      expect(removeCall).toBeDefined()
      expect(branchDelete).toBeDefined()
      expect(branchDelete![2]).toMatch(/^feat\/worker-1-auth-module/)
    })

    it('does not throw when worktree path does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
      expect(() => removeWorktree('/proj', 1, 'Auth module')).not.toThrow()
    })
  })
})
