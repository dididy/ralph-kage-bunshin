import { describe, it, expect, vi } from 'vitest'
import { createSession, splitPane, sendKeys, TmuxError, applyLayout, killSession, sessionExists, getPaneCommands, findIdlePanes, findStatusPane, getPaneTitles, setPaneTitle } from '../../src/core/tmux'
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

  it('getPaneCommands parses pane index and command', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0 zsh\n1 claude\n2 node\n'))
    const cmds = getPaneCommands('ralph-test')
    expect(cmds.get(0)).toBe('zsh')
    expect(cmds.get(1)).toBe('claude')
    expect(cmds.get(2)).toBe('node')
  })

  it('getPaneCommands returns empty map on error', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('no server') })
    expect(getPaneCommands('ralph-test').size).toBe(0)
  })

  it('findIdlePanes returns only shell panes', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0 zsh\n1 claude\n2 bash\n3 node\n'))
    const idle = findIdlePanes('ralph-test')
    expect(idle).toEqual([0, 2])
  })

  it('getPaneTitles parses pane titles', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0 worker-1\n1 ralph-status\n'))
    const titles = getPaneTitles('ralph-test')
    expect(titles.get(0)).toBe('worker-1')
    expect(titles.get(1)).toBe('ralph-status')
  })

  it('findStatusPane prefers title over command', () => {
    const mockExec = vi.mocked(execFileSync)
    // First call: getPaneTitles (list-panes with pane_title)
    // Second call: not needed since title match found
    mockExec.mockReturnValue(Buffer.from('0 zsh\n1 ralph-status\n2 node\n'))
    const pane = findStatusPane('ralph-test')
    expect(pane).toBe(1)
  })

  it('findStatusPane falls back to command when no title match', () => {
    const mockExec = vi.mocked(execFileSync)
    // getPaneTitles → no 'ralph-status' title
    // listPanes → pane indices
    // getPaneCommands → commands
    let callCount = 0
    mockExec.mockImplementation((_cmd: unknown, args: unknown) => {
      callCount++
      const argArr = args as string[]
      if (argArr.includes('#{pane_index} #{pane_title}')) {
        return Buffer.from('0 default\n1 default\n')
      }
      if (argArr.includes('#{pane_index}')) {
        return Buffer.from('0\n1\n')
      }
      if (argArr.includes('#{pane_index} #{pane_current_command}')) {
        return Buffer.from('0 claude\n1 node\n')
      }
      return Buffer.from('')
    })
    const pane = findStatusPane('ralph-test')
    expect(pane).toBe(1)
  })

  it('setPaneTitle runs select-pane with -T flag', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    setPaneTitle('ralph-test', 2, 'ralph-status')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['select-pane', '-t', 'ralph-test.2', '-T', 'ralph-status']),
      expect.any(Object)
    )
  })
})
