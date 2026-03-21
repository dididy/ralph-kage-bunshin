import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTeam, launchWorkers } from '../../src/commands/team'
import * as tmux from '../../src/core/tmux'
import * as state from '../../src/core/state'
import * as caffeinate from '../../src/core/caffeinate'
import * as configModule from '../../src/core/config'
import fs from 'fs'

vi.mock('../../src/core/tmux')
vi.mock('../../src/core/state')
vi.mock('../../src/core/caffeinate')
vi.mock('../../src/core/config')
vi.mock('fs')

describe('ralph team', () => {
  beforeEach(() => {
    vi.mocked(tmux.sessionExists).mockReturnValue(false)
    vi.mocked(tmux.createSession).mockReturnValue(undefined)
    vi.mocked(tmux.splitPane).mockReturnValue(undefined)
    vi.mocked(tmux.applyLayout).mockReturnValue(undefined)
    vi.mocked(tmux.sendKeys).mockReturnValue(undefined)
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2, 3])
    vi.mocked(tmux.setPaneTitle).mockReturnValue(undefined)
    vi.mocked(tmux.killSession).mockReturnValue(undefined)
    vi.mocked(caffeinate.startCaffeinate).mockReturnValue(undefined)
    vi.mocked(state.initWorkerState).mockReturnValue(undefined)
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  it('creates a tmux session', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })

  it('splits N-1 worker panes plus 1 status pane and applies tiled layout', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.splitPane).toHaveBeenCalledTimes(3)
    expect(tmux.applyLayout).toHaveBeenCalledWith(expect.any(String), 'tiled')
  })

  it('injects RALPH_WORKER_ID env var into each worker pane', () => {
    runTeam(3, '/tmp/test-project')
    const allCalls = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCalls).toContain("export RALPH_WORKER_ID='1'")
    expect(allCalls).toContain("export RALPH_WORKER_ID='2'")
    expect(allCalls).toContain("export RALPH_WORKER_ID='3'")
  })

  it('does not pre-assign workers in tasks.json', () => {
    runTeam(3, '/tmp/test-project')
    expect(state.writeTasks).not.toHaveBeenCalled()
  })

  it('launches claude with session name and /ralph-kage-bunshin-loop in each worker pane', () => {
    runTeam(3, '/tmp/test-project')
    const claudeCalls = vi.mocked(tmux.sendKeys).mock.calls
      .map(c => c[2])
      .filter(cmd => cmd.includes('claude'))
    expect(claudeCalls).toHaveLength(3)
    claudeCalls.forEach(cmd => {
      expect(cmd).toContain('/ralph-kage-bunshin-loop')
      expect(cmd).toMatch(/-n ['"]ralph-worker-\d+['"]/)
    })
  })

  it('kills and recreates the session when one already exists', () => {
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    runTeam(2, '/tmp/test-project')
    expect(tmux.killSession).toHaveBeenCalledWith('ralph-test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })

  it('does not start caffeinate when config.caffeinate is false', () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: false,
    })
    runTeam(1, '/tmp/test-project')
    expect(caffeinate.startCaffeinate).not.toHaveBeenCalled()
  })

  it('throws when not enough panes after layout', () => {
    vi.mocked(tmux.listPanes).mockReturnValue([0]) // too few
    expect(() => runTeam(3, '/tmp/test-project')).toThrow('Expected')
  })

  it('sets status pane title to ralph-status', () => {
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2, 3])
    runTeam(3, '/tmp/test-project')
    expect(tmux.setPaneTitle).toHaveBeenCalledWith(expect.any(String), 3, 'ralph-status')
  })

  it('sends watch command to status pane', () => {
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2, 3])
    runTeam(3, '/tmp/test-project')
    const statusCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(statusCalls.some(c => c[2].includes('ralph status --watch'))).toBe(true)
  })

  it('sources .env when it exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    runTeam(1, '/tmp/test-project')
    const allCalls = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCalls.some(c => c.includes('source'))).toBe(true)
  })

  it('sanitizes project dir name for session', () => {
    runTeam(1, '/tmp/my project!!!')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-my_project___')
  })

  describe('launchWorkers', () => {
    it('throws when not enough panes for workers', () => {
      vi.mocked(tmux.listPanes).mockReturnValue([0])
      expect(() => launchWorkers('session', [1, 2], '/proj')).toThrow('Not enough panes')
    })
  })
})
