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

  it('macOS 알림을 osascript로 실행한다', () => {
    const mockExec = vi.mocked(execFileSync)
    mockExec.mockReturnValue(Buffer.from(''))
    notify({ title: 'Ralph', message: 'CONVERGED', config: baseConfig })
    expect(mockExec).toHaveBeenCalledWith(
      'osascript',
      expect.any(Array),
      expect.any(Object)
    )
  })

  it('slack_webhook이 설정되면 curl POST 요청을 보낸다', () => {
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

  it('macos가 false이면 osascript를 실행하지 않는다', () => {
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
