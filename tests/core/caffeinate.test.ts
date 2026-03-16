import { describe, it, expect, vi, beforeEach } from 'vitest'
import { spawn } from 'child_process'

vi.mock('child_process')

describe('caffeinate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
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

  it('stopCaffeinate kills the process', async () => {
    const mockProcess = { unref: vi.fn(), pid: 123, kill: vi.fn() }
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    const { startCaffeinate, stopCaffeinate } = await import('../../src/core/caffeinate')
    startCaffeinate()
    stopCaffeinate()
    expect(mockProcess.kill).toHaveBeenCalled()
  })
})
