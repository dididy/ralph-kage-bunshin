import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTeam } from '../../src/commands/team'
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
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.appendFileSync).mockReturnValue(undefined)
    vi.mocked(fs.chmodSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([] as any)
    vi.mocked(fs.rmSync).mockReturnValue(undefined)
  })

  it('creates a tmux session', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })

  it('splits panes for workers and watcher then applies tiled layout', () => {
    runTeam(3, '/tmp/test-project')
    // 3 workers + 1 watcher = 4 panes; session starts with 1, so 3 splits
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

  it('does not launch claude on worker panes (watcher does this)', () => {
    runTeam(3, '/tmp/test-project')
    // Worker panes are 0, 1, 2 — none should have claude commands
    const workerCalls = vi.mocked(tmux.sendKeys).mock.calls
      .filter(c => c[1] !== 3) // exclude watcher pane
      .map(c => c[2])
    expect(workerCalls.every(cmd => !cmd.includes('claude'))).toBe(true)
  })

  it('does not pre-assign workers in tasks.json', () => {
    runTeam(3, '/tmp/test-project')
    expect(state.writeTasks).not.toHaveBeenCalled()
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

  it('sets watcher pane title to ralph-watcher', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.setPaneTitle).toHaveBeenCalledWith(expect.any(String), 3, 'ralph-watcher')
  })

  it('launches claude with fakechat and watcher skill on watcher pane', () => {
    runTeam(3, '/tmp/test-project')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(watcherCalls.some(c => c[2].includes('claude') && c[2].includes('/ralph-kage-bunshin-watcher'))).toBe(true)
    expect(watcherCalls.some(c => c[2].includes('--channels plugin:fakechat@claude-plugins-official'))).toBe(true)
  })

  it('exports RALPH_WORKER_COUNT to watcher pane', () => {
    runTeam(3, '/tmp/test-project')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(watcherCalls.some(c => c[2].includes("RALPH_WORKER_COUNT='3'"))).toBe(true)
  })

  it('exports FAKECHAT_PORT to watcher pane', () => {
    runTeam(3, '/tmp/test-project')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(watcherCalls.some(c => c[2].includes("FAKECHAT_PORT="))).toBe(true)
  })

  it('sources .env when it exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    runTeam(1, '/tmp/test-project')
    const allCalls = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCalls.some(c => c.includes('source'))).toBe(true)
  })

  it('sanitizes project dir name for session', () => {
    runTeam(1, '/tmp/my project!!!')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-my_project___')
  })

  it('writes FAKECHAT_PORT to .env and enforces chmod 0600', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    runTeam(1, '/tmp/test-project')
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('FAKECHAT_PORT')
    )
    expect(fs.chmodSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      0o600
    )
  })

  describe('cleanupStaleWorkers', () => {
    it('removes worker directories with ID > workerCount', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['worker-1', 'worker-2', 'worker-5'] as any)
      runTeam(2, '/tmp/test-project')
      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('worker-5'),
        { recursive: true, force: true }
      )
      expect(fs.rmSync).not.toHaveBeenCalledWith(
        expect.stringContaining('worker-1'),
        expect.anything()
      )
      expect(fs.rmSync).not.toHaveBeenCalledWith(
        expect.stringContaining('worker-2'),
        expect.anything()
      )
    })

    it('does nothing when no stale workers exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['worker-1', 'worker-2'] as any)
      runTeam(2, '/tmp/test-project')
      expect(fs.rmSync).not.toHaveBeenCalled()
    })

    it('skips when workers directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      runTeam(1, '/tmp/test-project')
      expect(fs.readdirSync).not.toHaveBeenCalledWith(
        expect.stringContaining('workers')
      )
    })
  })

})
