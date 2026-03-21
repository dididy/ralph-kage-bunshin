import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn, execFileSync } from 'child_process'
import fs from 'fs'

vi.mock('child_process')
vi.mock('fs')

describe('caffeinate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    // Default: no PID file exists
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT') })
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    // Default: ps check returns caffeinate
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('caffeinate'))
  })

  it('spawns caffeinate -i detached', async () => {
    const mockProcess = { unref: vi.fn(), pid: 123 }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    expect(spawn).toHaveBeenCalledWith('caffeinate', ['-i'], expect.objectContaining({ detached: true }))
    expect(mockProcess.unref).toHaveBeenCalled()
  })

  it('does not spawn twice if already running', async () => {
    const mockProcess = { unref: vi.fn(), pid: 123 }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    startCaffeinate()
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('stopCaffeinate kills the process and removes PID file', async () => {
    const mockProcess = { unref: vi.fn(), pid: 123, kill: vi.fn() }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate, stopCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    stopCaffeinate()
    expect(mockProcess.kill).toHaveBeenCalled()
    expect(fs.unlinkSync).toHaveBeenCalled()
  })

  it('writes PID file after spawning', async () => {
    const mockProcess = { unref: vi.fn(), pid: 456 }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('caffeinate.pid'),
      '456',
    )
  })

  it('kills stale PID from previous run before spawning', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('789')
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('caffeinate'))
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const mockProcess = { unref: vi.fn(), pid: 111 }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    expect(killSpy).toHaveBeenCalledWith(789, 'SIGTERM')
    killSpy.mockRestore()
  })

  it('does not kill stale PID if process is not caffeinate', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('789')
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('node'))
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const mockProcess = { unref: vi.fn(), pid: 111 }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    expect(killSpy).not.toHaveBeenCalled()
    killSpy.mockRestore()
  })

  it('does not kill stale PID if ps command fails (process gone)', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('789')
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('no such process') })
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const mockProcess = { unref: vi.fn(), pid: 111 }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    expect(killSpy).not.toHaveBeenCalled()
    killSpy.mockRestore()
  })
})
