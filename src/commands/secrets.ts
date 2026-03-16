import fs from 'fs'
import path from 'path'

function getEnvPath(projectDir: string): string {
  return path.join(projectDir, '.ralph', '.env')
}

function ensureGitignored(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore')
  const entry = '.ralph/.env'
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n${entry}\n`)
    }
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`)
  }
}

function readEnv(projectDir: string): Record<string, string> {
  const envPath = getEnvPath(projectDir)
  if (!fs.existsSync(envPath)) return {}
  const result: Record<string, string> = {}
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    let val = trimmed.slice(eq + 1).trim()
    // Strip surrounding quotes and unescape \\ and \" inside double-quoted values
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\\\/g, '\x00').replace(/\\"/g, '"').replace(/\x00/g, '\\')
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1)
    }
    result[trimmed.slice(0, eq)] = val
  }
  return result
}

function formatEnvLine(key: string, value: string): string {
  // Quote value if it contains spaces, #, or special chars
  const needsQuoting = /[\s#"'\\$`]/.test(value)
  return needsQuoting ? `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : `${key}=${value}`
}

function writeEnv(projectDir: string, env: Record<string, string>): void {
  const dir = path.join(projectDir, '.ralph')
  fs.mkdirSync(dir, { recursive: true })
  const content = Object.entries(env).map(([k, v]) => formatEnvLine(k, v)).join('\n') + '\n'
  fs.writeFileSync(getEnvPath(projectDir), content, { mode: 0o600 })
  ensureGitignored(projectDir)
}

export function setSecret(projectDir: string, key: string, value: string): void {
  if (!key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid secret key: "${key}" — must start with a letter or underscore, followed by letters, digits, or underscores (POSIX shell variable naming)`)
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`Invalid secret value: cannot contain newlines`)
  }
  const env = readEnv(projectDir)
  env[key] = value
  writeEnv(projectDir, env)
  console.log(`[OK] ${key} set`)
}

export function unsetSecret(projectDir: string, key: string): void {
  const env = readEnv(projectDir)
  if (!(key in env)) {
    console.error(`Key not found: ${key}`)
    return
  }
  delete env[key]
  writeEnv(projectDir, env)
  console.log(`[OK] ${key} removed`)
}

export function listSecrets(projectDir: string): void {
  const env = readEnv(projectDir)
  const keys = Object.keys(env)
  if (keys.length === 0) {
    console.log('No secrets set. Use: ralph secrets set KEY=value')
    return
  }
  keys.forEach(k => console.log(`  ${k}=***`))
}

export function createEnvTemplate(projectDir: string, keys: string[]): void {
  if (keys.length === 0) return
  const existing = readEnv(projectDir)
  for (const key of keys) {
    if (!(key in existing)) existing[key] = ''
  }
  writeEnv(projectDir, existing)
}
