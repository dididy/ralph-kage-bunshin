import { describe, it, expect, vi } from 'vitest'
import { createSession, splitPane, sendKeys, TmuxError, applyLayout, killSession, sessionExists, listPanes, killPane, getActivePaneIndex, getPaneCommands, findIdlePanes, getPaneTitles, setPaneTitle } from '../../src/core/tmux'
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

  it('runs the split-window command (horizontal by default)', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    splitPane('ralph-test')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['split-window', '-h']),
      expect.any(Object)
    )
  })

  it('runs the split-window command vertically', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    splitPane('ralph-test', true)
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['split-window', '-v']),
      expect.any(Object)
    )
  })

  it('sends keys to a pane', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    sendKeys('ralph-test', 0, 'echo hello')
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['send-keys', '-t', 'ralph-test.0', 'echo hello', 'Enter']),
      expect.any(Object)
    )
  })

  it('throws TmuxError when tmux command fails', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('tmux not found') })
    expect(() => createSession('test')).toThrow(TmuxError)
  })

  it('TmuxError includes command info', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('tmux not found') })
    try {
      createSession('test')
    } catch (e) {
      expect(e).toBeInstanceOf(TmuxError)
      expect((e as TmuxError).message).toContain('new-session')
    }
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

  it('listPanes returns pane indices', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0\n1\n2\n'))
    const panes = listPanes('ralph-test')
    expect(panes).toEqual([0, 1, 2])
  })

  it('listPanes returns empty array on error', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('no server') })
    expect(listPanes('ralph-test')).toEqual([])
  })

  it('killPane does not throw when pane is already gone', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('pane not found') })
    expect(() => killPane('ralph-test', 5)).not.toThrow()
  })

  it('killPane calls kill-pane with correct target', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    killPane('ralph-test', 2)
    expect(mockExec).toHaveBeenCalledWith(
      'tmux',
      expect.arrayContaining(['kill-pane', '-t', 'ralph-test.2']),
      expect.any(Object)
    )
  })

  it('getActivePaneIndex returns pane number', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('3\n'))
    expect(getActivePaneIndex('ralph-test')).toBe(3)
  })

  it('getActivePaneIndex returns null on NaN output', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('abc\n'))
    expect(getActivePaneIndex('ralph-test')).toBeNull()
  })

  it('getActivePaneIndex returns null on error', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('no server') })
    expect(getActivePaneIndex('ralph-test')).toBeNull()
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

  it('getPaneCommands skips lines without space', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0 zsh\nbadline\n1 node\n'))
    const cmds = getPaneCommands('ralph-test')
    expect(cmds.size).toBe(2)
  })

  it('findIdlePanes returns only shell panes', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0 zsh\n1 claude\n2 bash\n3 node\n'))
    const idle = findIdlePanes('ralph-test')
    expect(idle).toEqual([0, 2])
  })

  it('findIdlePanes detects fish and sh shells', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0 fish\n1 sh\n2 node\n'))
    const idle = findIdlePanes('ralph-test')
    expect(idle).toEqual([0, 1])
  })

  it('getPaneTitles parses pane titles', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('0 worker-1\n1 ralph-status\n'))
    const titles = getPaneTitles('ralph-test')
    expect(titles.get(0)).toBe('worker-1')
    expect(titles.get(1)).toBe('ralph-status')
  })

  it('getPaneTitles returns empty map on error', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('fail') })
    expect(getPaneTitles('ralph-test').size).toBe(0)
  })

  it('getPaneCommands skips lines with NaN pane index', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('abc zsh\n1 node\n'))
    const cmds = getPaneCommands('ralph-test')
    expect(cmds.size).toBe(1)
    expect(cmds.get(1)).toBe('node')
  })

  it('getPaneTitles skips lines without space', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('badline\n0 title\n'))
    const titles = getPaneTitles('ralph-test')
    expect(titles.size).toBe(1)
  })

  it('getPaneTitles skips lines with NaN pane index', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from('xyz title\n1 ralph-status\n'))
    const titles = getPaneTitles('ralph-test')
    expect(titles.size).toBe(1)
    expect(titles.get(1)).toBe('ralph-status')
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

  it('setPaneTitle does not throw when tmux does not support -T', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockImplementation(() => { throw new Error('unknown option -T') })
    expect(() => setPaneTitle('ralph-test', 0, 'title')).not.toThrow()
  })
})
