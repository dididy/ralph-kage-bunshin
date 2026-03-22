import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadConfig, saveConfig } from '../../src/core/config'
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

  it('parses config with optional leaseDurationMs and stuckThresholdMs', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      leaseDurationMs: 60000,
      stuckThresholdMs: 300000,
    }))
    const config = loadConfig()
    expect(config.leaseDurationMs).toBe(60000)
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

  it('returns defaults when leaseDurationMs is not a number', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      leaseDurationMs: 'bad',
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true) // defaults
    expect(config.leaseDurationMs).toBeUndefined()
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

  it('returns defaults when leaseDurationMs is zero or negative', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      leaseDurationMs: 0,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.caffeinate).toBe(true) // defaults
    expect(config.leaseDurationMs).toBeUndefined()
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

  it('returns defaults when leaseDurationMs exceeds 24 hours', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
      leaseDurationMs: 25 * 60 * 60 * 1000,
    }))
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = loadConfig()
    expect(config.leaseDurationMs).toBeUndefined()
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

  it('saveConfig writes JSON to ~/.ralph/config.json', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    saveConfig({ notifications: { macos: false, slack_webhook: '', discord_webhook: '' }, caffeinate: false })
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      expect.stringContaining('"caffeinate": false')
    )
  })

  it('saveConfig throws on invalid config object', () => {
    expect(() => saveConfig({ invalid: true } as any)).toThrow('Invalid config object')
  })
})
