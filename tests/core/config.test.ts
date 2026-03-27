import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadConfig, getFakechatPort } from '../../src/core/config'
import fs from 'fs'

vi.mock('fs')

describe('config', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns defaults when config.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const config = loadConfig()
    expect(config.notifications.macos).toBe(true)
    expect(config.caffeinate).toBe(true)
    expect(config.notifications.slack_webhook).toBe('')
  })

  it('parses and returns config when config.json exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: false, slack_webhook: 'https://hooks.slack.com/test', discord_webhook: '' },
      caffeinate: false
    }))
    const config = loadConfig()
    expect(config.notifications.macos).toBe(false)
    expect(config.notifications.slack_webhook).toBe('https://hooks.slack.com/test')
    expect(config.caffeinate).toBe(false)
  })

  it('parses config with optional stuckThresholdMs', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      stuckThresholdMs: 300000,
    }))
    const config = loadConfig()
    expect(config.stuckThresholdMs).toBe(300000)
  })

  it('returns defaults when config has invalid shape', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ invalid: true }) as any)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid shape'))
    spy.mockRestore()
  })

  it('returns defaults when config is invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('not json' as any)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'))
    spy.mockRestore()
  })

  it('returns defaults when stuckThresholdMs is not a number', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      stuckThresholdMs: 'bad',
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    spy.mockRestore()
  })

  it('returns defaults when stuckThresholdMs is negative', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      stuckThresholdMs: -1000,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    spy.mockRestore()
  })

  it('returns defaults when stuckThresholdMs exceeds 24 hours', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      stuckThresholdMs: 25 * 60 * 60 * 1000,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.stuckThresholdMs).toBeUndefined()
    spy.mockRestore()
  })

  it('returns defaults when notifications is null', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: null,
      caffeinate: true,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    spy.mockRestore()
  })

  it('returns defaults when slack_webhook is not a string', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: 123, discord_webhook: '' },
      caffeinate: true,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    expect(config.notifications.slack_webhook).toBe('')
    spy.mockRestore()
  })

  it('returns defaults when discord_webhook is not a string', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: null },
      caffeinate: true,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    spy.mockRestore()
  })

  it('returns defaults when macos is not a boolean', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: 'yes', slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
    spy.mockRestore()
  })
})

describe('getFakechatPort', () => {
  const baseConfig = {
    notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
    caffeinate: true,
  }

  it('returns config port when set', () => {
    const config = { ...baseConfig, notifications: { ...baseConfig.notifications, fakechat_port: '9999' } }
    expect(getFakechatPort(config)).toBe('9999')
  })

  it('returns default 8787 when no config or env', () => {
    const originalEnv = process.env.FAKECHAT_PORT
    delete process.env.FAKECHAT_PORT
    expect(getFakechatPort(baseConfig)).toBe('8787')
    if (originalEnv) process.env.FAKECHAT_PORT = originalEnv
  })
})

describe('isValidConfig — fakechat_port validation', () => {
  it('returns defaults when fakechat_port is not numeric', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '', fakechat_port: 'hello' },
      caffeinate: true,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.notifications.fakechat_port).toBeUndefined()
    spy.mockRestore()
  })

  it('returns defaults when fakechat_port is 0', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '', fakechat_port: '0' },
      caffeinate: true,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.notifications.fakechat_port).toBeUndefined()
    spy.mockRestore()
  })

  it('returns defaults when fakechat_port exceeds 65535', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '', fakechat_port: '99999' },
      caffeinate: true,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.notifications.fakechat_port).toBeUndefined()
    spy.mockRestore()
  })

  it('accepts valid port 8787', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '', fakechat_port: '8787' },
      caffeinate: true,
    }))
    const config = loadConfig()
    expect(config.notifications.fakechat_port).toBe('8787')
  })
})
