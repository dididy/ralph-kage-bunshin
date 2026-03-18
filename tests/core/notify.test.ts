import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notify } from '../../src/core/notify'
import { execFileSync } from 'child_process'

vi.mock('child_process')

const baseConfig = {
  notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
  caffeinate: true,
}

describe('notify', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockClear()
  })

  it('sends macOS notification via osascript', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    notify({ title: 'Ralph', message: 'CONVERGED', config: baseConfig })
    expect(mockExec).toHaveBeenCalledWith(
      'osascript',
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('sends a curl POST request when slack_webhook is configured', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    notify({
      title: 'Ralph', message: 'CONVERGED',
      config: { ...baseConfig, notifications: { macos: false, slack_webhook: 'https://hooks.slack.com/test', discord_webhook: '' } }
    })
    expect(mockExec).toHaveBeenCalledWith(
      'curl',
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('does not run osascript when macos is false', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    notify({ title: 'Ralph', message: 'test', config: { ...baseConfig, notifications: { macos: false, slack_webhook: '', discord_webhook: '' } } })
    expect(mockExec).not.toHaveBeenCalledWith(
      'osascript',
      expect.any(Array),
      expect.any(Object)
    )
  })
})
