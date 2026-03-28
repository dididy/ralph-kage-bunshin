import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTeam, resolvePort } from '../../src/commands/team'
import * as tmux from '../../src/core/tmux'
import * as state from '../../src/core/state'
import * as caffeinate from '../../src/core/caffeinate'
import * as configModule from '../../src/core/config'
import fs from 'fs'
import net from 'net'
import * as childProcess from 'child_process'

vi.mock('../../src/core/tmux')
vi.mock('../../src/core/state')
vi.mock('../../src/core/caffeinate')
vi.mock('../../src/core/config')
vi.mock('fs')
vi.mock('child_process')
vi.mock('net')

describe('resolvePort', () => {
  beforeEach(() => {
    vi.mocked(net.createServer).mockReset()
  })

  it('returns the preferred port when it is free', async () => {
    vi.mocked(net.createServer).mockImplementation(() => {
      const emitter = { once: vi.fn(), listen: vi.fn(), close: vi.fn() } as any
      emitter.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'listening') setTimeout(cb, 0)
        return emitter
      })
      emitter.close.mockImplementation((cb: () => void) => cb())
      return emitter
    })
    const result = await resolvePort('8787')
    expect(result).toBe('8787')
  })

  it('returns a free OS-assigned port when preferred is in use', async () => {
    let callCount = 0
    vi.mocked(net.createServer).mockImplementation(() => {
      callCount++
      const emitter = { once: vi.fn(), listen: vi.fn(), close: vi.fn(), address: vi.fn() } as any
      if (callCount === 1) {
        // first call: isPortInUse — trigger error to indicate port is taken
        emitter.once.mockImplementation((event: string, cb: () => void) => {
          if (event === 'error') setTimeout(cb, 0)
          return emitter
        })
      } else {
        // second call: getFreePort — simulate OS port assignment
        emitter.address.mockReturnValue({ port: 54321 })
        emitter.once.mockImplementation((event: string, cb: () => void) => {
          if (event === 'listening') setTimeout(cb, 0)
          return emitter
        })
        emitter.close.mockImplementation((cb: () => void) => cb())
      }
      return emitter
    })
    const result = await resolvePort('8787')
    expect(result).toBe('54321')
  })
})

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
    vi.mocked(configModule.getFakechatPort).mockReturnValue('8787')
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.appendFileSync).mockReturnValue(undefined)
    vi.mocked(fs.chmodSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([] as any)
    vi.mocked(fs.rmSync).mockReturnValue(undefined)
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(''))

    // Default: port is free (isPortInUse returns false → preferred port used)
    vi.mocked(net.createServer).mockImplementation(() => {
      const emitter = { once: vi.fn(), listen: vi.fn(), close: vi.fn() } as any
      emitter.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'listening') setTimeout(cb, 0)
        return emitter
      })
      emitter.close.mockImplementation((cb: () => void) => cb())
      return emitter
    })
  })

  it('creates a tmux session', async () => {
    await runTeam(3, '/tmp/test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })

  it('splits panes for workers and watcher then applies tiled layout', async () => {
    await runTeam(3, '/tmp/test-project')
    // 3 workers + 1 watcher = 4 panes; session starts with 1, so 3 splits
    expect(tmux.splitPane).toHaveBeenCalledTimes(3)
    expect(tmux.applyLayout).toHaveBeenCalledWith(expect.any(String), 'tiled')
  })

  it('injects RALPH_WORKER_ID env var into each worker pane', async () => {
    await runTeam(3, '/tmp/test-project')
    const allCalls = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCalls).toContain("export RALPH_WORKER_ID='1'")
    expect(allCalls).toContain("export RALPH_WORKER_ID='2'")
    expect(allCalls).toContain("export RALPH_WORKER_ID='3'")
  })

  it('does not launch claude on worker panes (watcher does this)', async () => {
    await runTeam(3, '/tmp/test-project')
    // Worker panes are 0, 1, 2 — none should have claude commands
    const workerCalls = vi.mocked(tmux.sendKeys).mock.calls
      .filter(c => c[1] !== 3) // exclude watcher pane
      .map(c => c[2])
    expect(workerCalls.every(cmd => !cmd.includes('claude'))).toBe(true)
  })

  it('does not pre-assign workers in tasks.json', async () => {
    await runTeam(3, '/tmp/test-project')
    expect(state.writeTasks).not.toHaveBeenCalled()
  })

  it('exits with error when session already exists (same project)', async () => {
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit') })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runTeam(2, '/tmp/test-project')).rejects.toThrow('process.exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('already running'))
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('tmux kill-session'))
    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('does not kill or recreate session when same project is already running', async () => {
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runTeam(2, '/tmp/test-project')).rejects.toThrow('process.exit')
    expect(tmux.killSession).not.toHaveBeenCalled()
    expect(tmux.createSession).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it('does not start caffeinate when config.caffeinate is false', async () => {
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: false,
    })
    await runTeam(1, '/tmp/test-project')
    expect(caffeinate.startCaffeinate).not.toHaveBeenCalled()
  })

  it('throws when not enough panes after layout', async () => {
    vi.mocked(tmux.listPanes).mockReturnValue([0]) // too few
    await expect(runTeam(3, '/tmp/test-project')).rejects.toThrow('Expected')
  })

  it('sets watcher pane title to ralph-watcher', async () => {
    await runTeam(3, '/tmp/test-project')
    expect(tmux.setPaneTitle).toHaveBeenCalledWith(expect.any(String), 3, 'ralph-watcher')
  })

  it('launches claude with fakechat and watcher skill on watcher pane', async () => {
    await runTeam(3, '/tmp/test-project')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(watcherCalls.some(c => c[2].includes('claude') && c[2].includes('/ralph-kage-bunshin-watcher'))).toBe(true)
    expect(watcherCalls.some(c => c[2].includes('--channels plugin:fakechat@claude-plugins-official'))).toBe(true)
  })

  it('exports RALPH_WORKER_COUNT to watcher pane', async () => {
    await runTeam(3, '/tmp/test-project')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(watcherCalls.some(c => c[2].includes("RALPH_WORKER_COUNT='3'"))).toBe(true)
  })

  it('exports FAKECHAT_PORT to watcher pane', async () => {
    await runTeam(3, '/tmp/test-project')
    const watcherCalls = vi.mocked(tmux.sendKeys).mock.calls.filter(c => c[1] === 3)
    expect(watcherCalls.some(c => c[2].includes("FAKECHAT_PORT="))).toBe(true)
  })

  it('sources .env when it exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    await runTeam(1, '/tmp/test-project')
    const allCalls = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCalls.some(c => c.includes('source'))).toBe(true)
  })

  it('sanitizes project dir name for session', async () => {
    await runTeam(1, '/tmp/my project!!!')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-my_project___')
  })

  it('writes FAKECHAT_PORT to .env and enforces chmod 0600', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    await runTeam(1, '/tmp/test-project')
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('FAKECHAT_PORT')
    )
    expect(fs.chmodSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      0o600
    )
  })

  it('attaches to the tmux session after starting', async () => {
    await runTeam(3, '/tmp/test-project')
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'tmux',
      ['attach-session', '-t', 'ralph-test-project'],
      { stdio: 'inherit' }
    )
  })

  describe('cleanupStaleWorkers', () => {
    it('removes worker directories with ID > workerCount', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['worker-1', 'worker-2', 'worker-5'] as any)
      await runTeam(2, '/tmp/test-project')
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

    it('does nothing when no stale workers exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['worker-1', 'worker-2'] as any)
      await runTeam(2, '/tmp/test-project')
      expect(fs.rmSync).not.toHaveBeenCalled()
    })

    it('skips when workers directory does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      await runTeam(1, '/tmp/test-project')
      expect(fs.readdirSync).not.toHaveBeenCalledWith(
        expect.stringContaining('workers')
      )
    })
  })
})
