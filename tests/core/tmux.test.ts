import { describe, it, expect, vi } from 'vitest'
import { createSession, splitPane, sendKeys, TmuxError, applyLayout, killSession, sessionExists } from '../../src/core/tmux'
import { execFileSync } from 'child_process'

vi.mock('child_process')

describe('tmux', () => {
  it('runs the correct command to create a session', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    createSession('ralph-test')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['new-session', '-d', '-s', 'ralph-test']),
      expect.any(Object)
    )
  })

  it('runs the split-window command', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    splitPane('ralph-test')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['split-window']),
      expect.any(Object)
    )
  })

  it('sends keys to a pane', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    sendKeys('ralph-test', 0, 'echo hello')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['send-keys']),
      expect.any(Object)
    )
  })

  it('throws TmuxError when tmux command fails', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('tmux not found') })
    expect(() => createSession('test')).toThrow(TmuxError)
  })

  it('runs the select-layout command', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    applyLayout('ralph-test', 'tiled')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['select-layout', '-t', 'ralph-test', 'tiled']),
      expect.any(Object)
    )
  })

  it('runs the kill-session command', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    killSession('ralph-test')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['kill-session', '-t', 'ralph-test']),
      expect.any(Object)
    )
  })

  it('sessionExists returns true when session exists', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    expect(sessionExists('ralph-test')).toBe(true)
  })

  it('sessionExists returns false when session does not exist', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('no server') })
    expect(sessionExists('ralph-test')).toBe(false)
  })
})
