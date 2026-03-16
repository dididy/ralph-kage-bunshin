import { describe, it, expect, vi } from 'vitest'
import { createSession, splitPane, sendKeys, TmuxError, applyLayout, killSession, sessionExists } from '../../src/core/tmux'
import { execFileSync } from 'child_process'

vi.mock('child_process')

describe('tmux', () => {
  it('세션 생성 명령을 올바르게 실행한다', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    createSession('ralph-test')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['new-session', '-d', '-s', 'ralph-test']),
      expect.any(Object)
    )
  })

  it('pane 분할 명령을 실행한다', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    splitPane('ralph-test')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['split-window']),
      expect.any(Object)
    )
  })

  it('pane에 명령을 전송한다', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    sendKeys('ralph-test', 0, 'echo hello')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['send-keys']),
      expect.any(Object)
    )
  })

  it('tmux 명령 실패 시 TmuxError를 던진다', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('tmux not found') })
    expect(() => createSession('test')).toThrow(TmuxError)
  })

  it('applyLayout 명령을 실행한다', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    applyLayout('ralph-test', 'tiled')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['select-layout', '-t', 'ralph-test', 'tiled']),
      expect.any(Object)
    )
  })

  it('killSession 명령을 실행한다', () => {
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
