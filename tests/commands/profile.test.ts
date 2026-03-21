import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listProfiles, applyProfile } from '../../src/commands/profile'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('fs')

const PROFILES_DIR = path.join(os.homedir(), '.ralph', 'profiles')

describe('profile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('listProfiles', () => {
    it('returns empty array when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      expect(listProfiles()).toEqual([])
    })

    it('parses JSON files from profiles directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['react-fsd.json'] as any)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'react-fsd',
        description: 'FSD + React 19',
        stack: { frontend: 'react' },
        claude_md_additions: ['rule1'],
        initial_structure: ['src/'],
      }) as any)
      const profiles = listProfiles()
      expect(profiles).toHaveLength(1)
      expect(profiles[0].name).toBe('react-fsd')
    })

    it('skips unparseable files with warning', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['bad.json'] as any)
      vi.mocked(fs.readFileSync).mockReturnValue('not json' as any)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const profiles = listProfiles()
      expect(profiles).toHaveLength(0)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('could not parse'))
      spy.mockRestore()
    })

    it('skips invalid profile structure with warning', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['invalid.json'] as any)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test',
        // missing description, stack, etc.
      }) as any)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const profiles = listProfiles()
      expect(profiles).toHaveLength(0)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('skipping invalid profile'))
      spy.mockRestore()
    })

    it('filters non-json files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['readme.md', 'profile.json'] as any)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'valid',
        description: 'Valid profile',
        stack: {},
        claude_md_additions: [],
        initial_structure: [],
      }) as any)
      const profiles = listProfiles()
      expect(profiles).toHaveLength(1)
    })

    it('validates claude_md_additions are all strings', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['bad-rules.json'] as any)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test',
        description: 'test',
        stack: {},
        claude_md_additions: [123], // not strings
        initial_structure: [],
      }) as any)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(listProfiles()).toHaveLength(0)
      spy.mockRestore()
    })

    it('validates initial_structure are all strings', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['bad-dirs.json'] as any)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test',
        description: 'test',
        stack: {},
        claude_md_additions: [],
        initial_structure: [42], // not strings
      }) as any)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(listProfiles()).toHaveLength(0)
      spy.mockRestore()
    })

    it('rejects array stack', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['arr-stack.json'] as any)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test',
        description: 'test',
        stack: ['not', 'an', 'object'],
        claude_md_additions: [],
        initial_structure: [],
      }) as any)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(listProfiles()).toHaveLength(0)
      spy.mockRestore()
    })
  })

  describe('applyProfile', () => {
    it('throws on invalid profile name (path traversal)', () => {
      expect(() => applyProfile('../evil', '/tmp/proj')).toThrow('Invalid profile name')
    })

    it('throws when profile file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      expect(() => applyProfile('missing', '/tmp/proj')).toThrow('Profile not found')
    })

    it('throws on invalid profile JSON content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('not json' as any)
      expect(() => applyProfile('bad', '/tmp/proj')).toThrow('Invalid profile file')
    })

    it('throws on profile missing required fields', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test',
        // missing other fields
      }) as any)
      expect(() => applyProfile('incomplete', '/tmp/proj')).toThrow('Invalid profile file')
    })

    it('throws on empty string in initial_structure', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test',
        description: 'test',
        stack: {},
        claude_md_additions: [],
        initial_structure: ['src/', ''],
      }) as any)
      expect(() => applyProfile('bad-dirs', '/tmp/proj')).toThrow('empty string')
    })

    it('throws on path traversal in initial_structure', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'test',
        description: 'test',
        stack: {},
        claude_md_additions: [],
        initial_structure: ['../../etc'],
      }) as any)
      expect(() => applyProfile('traversal', '/tmp/proj')).toThrow('Invalid directory in profile')
    })

    it('creates directories from initial_structure', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('profiles')) return true
        if (typeof p === 'string' && p.includes('CLAUDE.md')) return false
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'react-app',
        description: 'React app setup',
        stack: { frontend: 'react' },
        claude_md_additions: [],
        initial_structure: ['src/components', 'src/hooks'],
      }) as any)
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      applyProfile('react-app', '/tmp/proj')
      expect(fs.mkdirSync).toHaveBeenCalledTimes(2)
      spy.mockRestore()
    })

    it('appends claude_md_additions to existing CLAUDE.md', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'react-app',
        description: 'React app setup',
        stack: { frontend: 'react' },
        claude_md_additions: ['use strict mode', 'always test'],
        initial_structure: [],
      }) as any)
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
      vi.mocked(fs.appendFileSync).mockReturnValue(undefined)

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      applyProfile('react-app', '/tmp/proj')
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        path.join('/tmp/proj', 'CLAUDE.md'),
        expect.stringContaining('use strict mode'),
      )
      spy.mockRestore()
    })

    it('creates CLAUDE.md when it does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('profiles')) return true
        if (typeof p === 'string' && p.includes('CLAUDE.md')) return false
        return true
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'react-app',
        description: 'React app setup',
        stack: {},
        claude_md_additions: ['rule1'],
        initial_structure: [],
      }) as any)
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined)

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      applyProfile('react-app', '/tmp/proj')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/tmp/proj', 'CLAUDE.md'),
        expect.stringContaining('rule1'),
      )
      spy.mockRestore()
    })

    it('skips CLAUDE.md when no additions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'minimal',
        description: 'Minimal',
        stack: {},
        claude_md_additions: [],
        initial_structure: [],
      }) as any)
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      applyProfile('minimal', '/tmp/proj')
      expect(fs.appendFileSync).not.toHaveBeenCalled()
      expect(fs.writeFileSync).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    it('logs success message', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        name: 'my-profile',
        description: 'desc',
        stack: {},
        claude_md_additions: [],
        initial_structure: [],
      }) as any)
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any)

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      applyProfile('my-profile', '/tmp/proj')
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('my-profile'))
      spy.mockRestore()
    })
  })
})
