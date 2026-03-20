import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTeam } from '../../src/commands/team'
import * as tmux from '../../src/core/tmux'
import * as state from '../../src/core/state'
import * as caffeinate from '../../src/core/caffeinate'
import * as configModule from '../../src/core/config'
import { execSync } from 'child_process'

vi.mock('../../src/core/tmux')
vi.mock('../../src/core/state')
vi.mock('../../src/core/caffeinate')
vi.mock('../../src/core/config')
vi.mock('child_process')

describe('ralph team', () => {
  beforeEach(() => {
    vi.mocked(tmux.sessionExists).mockReturnValue(false)
    vi.mocked(tmux.createSession).mockReturnValue(undefined)
    vi.mocked(tmux.splitPane).mockReturnValue(undefined)
    vi.mocked(tmux.applyLayout).mockReturnValue(undefined)
    vi.mocked(tmux.sendKeys).mockReturnValue(undefined)
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2, 3])
    vi.mocked(caffeinate.startCaffeinate).mockReturnValue(undefined)
    vi.mocked(state.initWorkerState).mockReturnValue(undefined)
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
  })

  it('creates a tmux session', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })

  it('splits N-1 worker panes plus 1 status pane and applies tiled layout', () => {
    runTeam(3, '/tmp/test-project')
    // N-1 splits for workers + 1 split for status pane = N splits total
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

  it('launches claude with /ralph-kage-bunshin-loop in each worker pane', () => {
    runTeam(3, '/tmp/test-project')
    const claudeCalls = vi.mocked(tmux.sendKeys).mock.calls
      .map(c => c[2])
      .filter(cmd => cmd.includes('claude'))
    expect(claudeCalls).toHaveLength(3)
    claudeCalls.forEach(cmd => expect(cmd).toContain('/ralph-kage-bunshin-loop'))
  })

  it('kills and recreates the session when one already exists', () => {
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    runTeam(2, '/tmp/test-project')
    expect(tmux.killSession).toHaveBeenCalledWith('ralph-test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })
})
