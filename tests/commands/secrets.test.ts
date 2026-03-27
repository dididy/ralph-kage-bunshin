import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setSecret, unsetSecret, listSecrets, createEnvTemplate } from '../../src/commands/secrets'
import fs from 'fs'

vi.mock('fs')

describe('secrets', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.chmodSync).mockReturnValue(undefined)
    vi.mocked(fs.appendFileSync).mockReturnValue(undefined)
  })

  describe('setSecret', () => {
    it('writes KEY=value to .ralph/.env', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'SUPABASE_URL', 'https://example.com')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('SUPABASE_URL=https://example.com'),
        expect.objectContaining({ mode: 0o600 })
      )
    })

    it('throws on invalid key name', () => {
      expect(() => setSecret('/proj', '123invalid', 'val')).toThrow('Invalid secret key')
      expect(() => setSecret('/proj', '', 'val')).toThrow('Invalid secret key')
      expect(() => setSecret('/proj', 'has-dash', 'val')).toThrow('Invalid secret key')
      expect(() => setSecret('/proj', 'has space', 'val')).toThrow('Invalid secret key')
    })

    it('allows underscore-prefixed keys', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      expect(() => setSecret('/proj', '_PRIVATE', 'val')).not.toThrow()
    })

    it('throws on value with newlines', () => {
      expect(() => setSecret('/proj', 'KEY', 'line1\nline2')).toThrow('cannot contain newlines')
      expect(() => setSecret('/proj', 'KEY', 'line1\rline2')).toThrow('cannot contain newlines')
    })

    it('quotes values with spaces', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'KEY', 'hello world')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('KEY="hello world"'),
        expect.any(Object)
      )
    })

    it('escapes quotes in values', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'KEY', 'say "hi"')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('KEY="say \\"hi\\""'),
        expect.any(Object)
      )
    })

    it('escapes backslashes in values', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'KEY', 'path\\to')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('KEY="path\\\\to"'),
        expect.any(Object)
      )
    })

    it('escapes dollar signs to prevent shell variable expansion', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'KEY', 'hello$PATH')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('KEY="hello\\$PATH"'),
        expect.any(Object)
      )
    })

    it('escapes backticks to prevent command substitution', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'KEY', 'val`cmd`')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('KEY="val\\`cmd\\`"'),
        expect.any(Object)
      )
    })

    it('adds .ralph/.env to .gitignore if not present', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('.gitignore')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue('node_modules\n' as any)
      setSecret('/proj', 'KEY', 'val')
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('.ralph/.env')
      )
    })

    it('does not duplicate .gitignore entry', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('.gitignore')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue('.ralph/.env\n' as any)
      setSecret('/proj', 'KEY', 'val')
      expect(fs.appendFileSync).not.toHaveBeenCalled()
    })

    it('creates .gitignore if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'KEY', 'val')
      // writeFileSync called for both .env and .gitignore
      const gitignoreCalls = vi.mocked(fs.writeFileSync).mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('.gitignore')
      )
      expect(gitignoreCalls).toHaveLength(1)
    })

    it('sets chmod 0600 on .env file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      setSecret('/proj', 'KEY', 'val')
      expect(fs.chmodSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        0o600
      )
    })

    it('updates existing key value', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('.env') && !p.includes('.gitignore')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue('KEY=old\nOTHER=keep\n' as any)
      setSecret('/proj', 'KEY', 'new')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('KEY=new'),
        expect.any(Object)
      )
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('OTHER=keep'),
        expect.any(Object)
      )
    })
  })

  describe('unsetSecret', () => {
    it('removes key from .ralph/.env', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('FOO=bar\nBAZ=qux\n' as any)
      unsetSecret('/proj', 'FOO')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.not.stringContaining('FOO='),
        expect.objectContaining({ mode: 0o600 })
      )
    })

    it('logs error when key not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('OTHER=val\n' as any)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      unsetSecret('/proj', 'MISSING')
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Key not found'))
      expect(fs.writeFileSync).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('listSecrets', () => {
    it('prints keys with *** values', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('SUPABASE_URL=secret\nGITHUB_TOKEN=tok\n' as any)
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      listSecrets('/proj')
      expect(spy).toHaveBeenCalledWith('  SUPABASE_URL=***')
      expect(spy).toHaveBeenCalledWith('  GITHUB_TOKEN=***')
      spy.mockRestore()
    })

    it('prints help text when no secrets set', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      listSecrets('/proj')
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('No secrets set'))
      spy.mockRestore()
    })
  })

  describe('createEnvTemplate', () => {
    it('writes empty values for new keys', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      createEnvTemplate('/proj', ['SUPABASE_URL', 'GITHUB_TOKEN'])
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('SUPABASE_URL='),
        expect.objectContaining({ mode: 0o600 })
      )
    })

    it('does nothing with empty keys array', () => {
      createEnvTemplate('/proj', [])
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('preserves existing values', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('.env') && !p.includes('.gitignore')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue('EXISTING=val\n' as any)
      createEnvTemplate('/proj', ['EXISTING', 'NEW_KEY'])
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        expect.stringContaining('EXISTING=val'),
        expect.any(Object)
      )
    })
  })

  describe('readEnv parsing', () => {
    it('parses double-quoted values', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('KEY="hello world"\n' as any)
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      listSecrets('/proj')
      expect(spy).toHaveBeenCalledWith('  KEY=***')
      spy.mockRestore()
    })

    it('parses single-quoted values', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue("KEY='hello world'\n" as any)
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      listSecrets('/proj')
      expect(spy).toHaveBeenCalledWith('  KEY=***')
      spy.mockRestore()
    })

    it('skips comments and empty lines', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('# comment\n\nKEY=val\n' as any)
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      listSecrets('/proj')
      expect(spy).toHaveBeenCalledTimes(1) // only KEY=***
      expect(spy).toHaveBeenCalledWith('  KEY=***')
      spy.mockRestore()
    })

    it('skips lines without =', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('no_equals_here\nKEY=val\n' as any)
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      listSecrets('/proj')
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })
  })
})
