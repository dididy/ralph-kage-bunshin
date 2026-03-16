import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Profile } from '../types'

const PROFILES_DIR = path.join(os.homedir(), '.ralph', 'profiles')

export function listProfiles(): Profile[] {
  if (!fs.existsSync(PROFILES_DIR)) return []
  return fs.readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf-8')) as Profile
      } catch {
        console.warn(`[WARN] could not parse profile ${f}`)
        return null
      }
    })
    .filter((p): p is Profile => p !== null)
}

export function applyProfile(profileName: string, projectDir: string): void {
  const filePath = path.join(PROFILES_DIR, `${profileName}.json`)
  const relative = path.relative(PROFILES_DIR, filePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid profile name')
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile not found: ${profileName}`)
  }

  let profile: Profile
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (
      typeof parsed?.name !== 'string' ||
      typeof parsed?.description !== 'string' ||
      typeof parsed?.stack !== 'object' || parsed?.stack === null || Array.isArray(parsed?.stack) ||
      !Array.isArray(parsed?.claude_md_additions) || !parsed.claude_md_additions.every((r: unknown) => typeof r === 'string') ||
      !Array.isArray(parsed?.initial_structure)
    ) {
      throw new Error('missing required fields')
    }
    profile = parsed as Profile
  } catch (e) {
    throw new Error(`Invalid profile file "${profileName}": ${e instanceof Error ? e.message : e}`)
  }

  const resolvedProject = path.resolve(projectDir)
  for (const dir of profile.initial_structure) {
    const resolved = path.resolve(projectDir, dir)
    const rel = path.relative(resolvedProject, resolved)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Invalid directory in profile: ${dir}`)
    }
    fs.mkdirSync(resolved, { recursive: true })
  }

  const claudeMdPath = path.join(projectDir, 'CLAUDE.md')

  if (profile.claude_md_additions.length > 0) {
    const additions = profile.claude_md_additions.map(r => `- ${r}`).join('\n')
    const section = `\n## ${profile.name} profile rules\n${additions}\n`

    if (fs.existsSync(claudeMdPath)) {
      fs.appendFileSync(claudeMdPath, section)
    } else {
      fs.writeFileSync(claudeMdPath, section)
    }
  }

  console.log(`[OK] Profile applied: ${profile.name}`)
}
