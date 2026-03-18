import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadConfig, saveConfig } from '../../src/core/config'
import fs from 'fs'

vi.mock('fs')

describe('config', () => {
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

  it('saveConfig writes JSON to ~/.ralph/config.json', () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    saveConfig({ notifications: { macos: false, slack_webhook: '', discord_webhook: '' }, caffeinate: false })
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      expect.stringContaining('"caffeinate": false')
    )
  })

  it('loadConfig returns defaults when config has invalid shape', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ invalid: true }) as any)
    const config = loadConfig()
    expect(config.caffeinate).toBe(true)
  })
})
