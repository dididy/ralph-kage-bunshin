import fs from 'fs'
import path from 'path'
import os from 'os'
import { createInterface } from 'readline'
import { spawnSync } from 'child_process'

const SKILLS_DEST = path.join(os.homedir(), '.claude', 'skills')

function confirm(question: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

export async function installSkills(opts: { force: boolean }): Promise<void> {
  // skills/ dir is relative to the installed package root
  const pkgRoot = path.resolve(new URL(import.meta.url).pathname, '..', '..')
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

    if (exists && !opts.force) {
      const overwrite = await confirm(`[WARN] ${skillName} already exists. Overwrite? (y/N) `)
      if (!overwrite) {
        console.log(`  skipped: ${skillName}`)
        continue
      }
    }

    fs.mkdirSync(skillDir, { recursive: true })
    fs.copyFileSync(path.join(skillsSrc, file), dest)
    console.log(`  [OK] ${file} → ${dest}`)
  }

  console.log(`\nDone. Skills installed to ${SKILLS_DEST}`)

  console.log('\nInstalling e2e-skills (dididy/e2e-skills)...')
  const result = spawnSync('npx', ['skills', 'install', 'dididy/e2e-skills'], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('[WARN] e2e-skills installation failed. You can install manually: npx skills install dididy/e2e-skills')
  }
}
