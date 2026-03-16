import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setSecret, unsetSecret, listSecrets, createEnvTemplate } from '../../src/commands/secrets'
import fs from 'fs'

vi.mock('fs')

describe('secrets', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('setSecret writes KEY=value to .ralph/.env', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    setSecret('/proj', 'SUPABASE_URL', 'https://example.com')
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('SUPABASE_URL=https://example.com'),
      expect.objectContaining({ mode: 0o600 })
    )
  })

  it('listSecrets prints keys with *** values', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('SUPABASE_URL=secret\nGITHUB_TOKEN=tok\n' as any)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    listSecrets('/proj')
    expect(spy).toHaveBeenCalledWith('  SUPABASE_URL=***')
    expect(spy).toHaveBeenCalledWith('  GITHUB_TOKEN=***')
    spy.mockRestore()
  })

  it('unsetSecret removes key from .ralph/.env', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('FOO=bar\nBAZ=qux\n' as any)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    unsetSecret('/proj', 'FOO')
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.not.stringContaining('FOO='),
      expect.objectContaining({ mode: 0o600 })
    )
  })

  it('createEnvTemplate writes empty values for new keys', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    createEnvTemplate('/proj', ['SUPABASE_URL', 'GITHUB_TOKEN'])
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('SUPABASE_URL='),
      expect.objectContaining({ mode: 0o600 })
    )
  })
})
