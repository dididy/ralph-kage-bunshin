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
    vi.mocked(tmux.listPanes).mockReturnValue([0, 1, 2, 3, 4])
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

  it('splits panes for workers, architect, and status then applies tiled layout', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.splitPane).toHaveBeenCalledTimes(4)
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

  it('launches claude with session name, channels flag, and /ralph-kage-bunshin-loop in each worker pane', () => {
    runTeam(3, '/tmp/test-project')
    const workerClaudeCalls = vi.mocked(tmux.sendKeys).mock.calls
      .map(c => c[2])
      .filter(cmd => cmd.includes('claude') && cmd.includes('/ralph-kage-bunshin-loop'))
    expect(workerClaudeCalls).toHaveLength(3)
    workerClaudeCalls.forEach(cmd => {
      expect(cmd).toContain('/ralph-kage-bunshin-loop')
      expect(cmd).toMatch(/-n ['"]ralph-worker-\d+['"]/)
      expect(cmd).toContain('--channels plugin:fakechat@claude-plugins-official')
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

  it('sets architect pane title to ralph-architect', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.setPaneTitle).toHaveBeenCalledWith(expect.any(String), 3, 'ralph-architect')
  })

  it('launches claude with fakechat in architect pane', () => {
    runTeam(3, '/tmp/test-project')
    const architectCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(architectCalls.some(c => c[2].includes('claude --channels plugin:fakechat@claude-plugins-official'))).toBe(true)
  })

  it('sets status pane title to ralph-status', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.setPaneTitle).toHaveBeenCalledWith(expect.any(String), 4, 'ralph-status')
  })

  it('sends watch command to status pane', () => {
    runTeam(3, '/tmp/test-project')
    const statusCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 4)
    expect(statusCalls.some(c => c[2].includes('ralph status --watch'))).toBe(true)
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

  it('sets per-worker FAKECHAT_PORT env var (8787 + workerId)', () => {
    runTeam(3, '/tmp/test-project')
    const allCalls = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCalls).toContain("export FAKECHAT_PORT='8788'")
    expect(allCalls).toContain("export FAKECHAT_PORT='8789'")
    expect(allCalls).toContain("export FAKECHAT_PORT='8790'")
  })

  it('passes fakechatPort to initWorkerState for each worker', () => {
    runTeam(3, '/tmp/test-project')
    expect(state.initWorkerState).toHaveBeenCalledWith('/tmp/test-project', 1, { fakechatPort: 8788 })
    expect(state.initWorkerState).toHaveBeenCalledWith('/tmp/test-project', 2, { fakechatPort: 8789 })
    expect(state.initWorkerState).toHaveBeenCalledWith('/tmp/test-project', 3, { fakechatPort: 8790 })
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

  describe('launchWorkers', () => {
    it('throws when not enough panes for workers', () => {
      vi.mocked(tmux.listPanes).mockReturnValue([0])
      expect(() => launchWorkers('session', [1, 2], '/proj')).toThrow('Not enough panes')
    })
  })
})
