import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listProfiles, applyProfile } from '../../src/commands/profile'
import fs from 'fs'
import path from 'path'

vi.mock('fs')

describe('profile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('listProfiles returns empty array when directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    expect(listProfiles()).toEqual([])
  })

  it('listProfiles parses JSON files from profiles directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['react-fsd.json'] as any)
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      name: 'react-fsd',
      description: 'FSD + React 19',
      stack: {},
      claude_md_additions: [],
      initial_structure: [],
    }) as any)
    const profiles = listProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('react-fsd')
  })

  it('listProfiles skips unparseable files with warning', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['bad.json'] as any)
    vi.mocked(fs.readFileSync).mockReturnValue('not json' as any)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const profiles = listProfiles()
    expect(profiles).toHaveLength(0)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('applyProfile throws on invalid profile name (path traversal)', () => {
    expect(() => applyProfile('../evil', '/tmp/proj')).toThrow('Invalid profile name')
  })

  it('applyProfile throws when profile file not found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    expect(() => applyProfile('missing', '/tmp/proj')).toThrow('Profile not found')
  })
})
