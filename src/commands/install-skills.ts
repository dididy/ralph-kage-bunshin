import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const SKILLS_DEST = path.join(os.homedir(), '.claude', 'skills')

export async function installSkills(opts: { noOverwrite: boolean }): Promise<void> {
  // skills/ dir is relative to the installed package root
  const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const skillsSrc = path.join(pkgRoot, 'skills')

  if (!fs.existsSync(skillsSrc)) {
    console.error(`[ERROR] Skills directory not found: ${skillsSrc}`)
    process.exit(1)
  }

  const files = fs.readdirSync(skillsSrc).filter(f => f.endsWith('.md'))
  if (files.length === 0) {
    console.log('No skill files found.')
    return
  }

  fs.mkdirSync(SKILLS_DEST, { recursive: true })

  for (const file of files) {
    const skillName = file.replace(/\.md$/, '')
    const skillDir = path.join(SKILLS_DEST, skillName)
    const dest = path.join(skillDir, 'SKILL.md')
    const exists = fs.existsSync(dest)

    if (exists && opts.noOverwrite) {
      console.log(`  skipped: ${skillName}`)
      continue
    }

    fs.mkdirSync(skillDir, { recursive: true })
    fs.copyFileSync(path.join(skillsSrc, file), dest)
    console.log(`  [OK] ${file} → ${dest}`)
  }

  console.log(`\nDone. Skills installed to ${SKILLS_DEST}`)

  const externalSkills = [
    { name: 'e2e-skills', ref: 'dididy/e2e-skills' },
    { name: 'ui-skills', ref: 'dididy/ui-skills' },
  ]

  for (const skill of externalSkills) {
    console.log(`\nInstalling ${skill.name} (${skill.ref})...`)
    const result = spawnSync('npx', ['skills', 'install', skill.ref], { stdio: 'inherit' })
    if (result.status !== 0) {
      console.error(`[WARN] ${skill.name} installation failed. You can install manually: npx skills install ${skill.ref}`)
    }
  }
}
