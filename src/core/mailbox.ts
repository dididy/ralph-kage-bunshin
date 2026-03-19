import fs from 'fs'
import path from 'path'

export interface MailboxMessage {
  from: number
  to: number | 'all'
  type: 'task_complete' | 'blocked' | 'decision' | 'info'
  subject: string
  body: string
  timestamp: string
}

function mailboxDir(projectDir: string): string {
  return path.join(projectDir, '.ralph', 'mailbox')
}

const VALID_MESSAGE_TYPES = new Set(['task_complete', 'blocked', 'decision', 'info'])

function isValidMailboxMessage(m: unknown): m is MailboxMessage {
  if (typeof m !== 'object' || m === null) return false
  const msg = m as Record<string, unknown>
  if (typeof msg.from !== 'number') return false
  if (msg.to !== 'all' && typeof msg.to !== 'number') return false
  if (!VALID_MESSAGE_TYPES.has(msg.type as string)) return false
  if (typeof msg.subject !== 'string') return false
  if (typeof msg.body !== 'string') return false
  if (typeof msg.timestamp !== 'string') return false
  return true
}

export function sendMessage(projectDir: string, msg: Omit<MailboxMessage, 'timestamp'>): void {
  const dir = mailboxDir(projectDir)
  fs.mkdirSync(dir, { recursive: true })
  const timestamp = new Date().toISOString()
  const rand = Math.random().toString(36).slice(2, 7)
  const filename = `${timestamp.replace(/[:.]/g, '-')}-worker-${msg.from}-${rand}.json`
  const full: MailboxMessage = { ...msg, timestamp }
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(full, null, 2))
}

export function listMessages(projectDir: string): (MailboxMessage & { filename: string; read: boolean })[] {
  const dir = mailboxDir(projectDir)
  if (!fs.existsSync(dir)) return []

  // Include both unread (.json) and read (.json.read) files
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') || f.endsWith('.json.read'))
    .sort()

  const msgs: (MailboxMessage & { filename: string; read: boolean })[] = []
  for (const filename of files) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf-8'))
      if (!isValidMailboxMessage(parsed)) {
        console.warn(`[WARN] Skipping invalid mailbox message: ${filename}`)
        continue
      }
      msgs.push({ ...parsed, filename, read: filename.endsWith('.read') })
    } catch {
      console.warn(`[WARN] Skipping malformed mailbox file: ${filename}`)
    }
  }
  return msgs
}

export function readMessages(projectDir: string, workerId: number): (MailboxMessage & { filename: string; read: boolean })[] {
  return listMessages(projectDir).filter(m =>
    !m.read && (m.to === 'all' || m.to === workerId)
  )
}

export function markRead(projectDir: string, filename: string): void {
  // Guard against path traversal — basename must equal original and be a plain .json name
  const safe = path.basename(filename)
  if (safe !== filename || !safe.endsWith('.json') || safe.includes('\\')) {
    throw new Error(`Invalid mailbox filename: ${filename}`)
  }
  const dir = mailboxDir(projectDir)
  const from = path.join(dir, safe)
  const to = path.join(dir, safe + '.read')
  try {
    fs.renameSync(from, to)
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return // already renamed by another worker
    console.warn(`[WARN] Failed to mark mailbox file as read: ${filename} (${code})`)
    throw e
  }
}

export function countUnread(projectDir: string): number {
  const dir = mailboxDir(projectDir)
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length
}

export function pruneMailbox(projectDir: string, keepDays = 7): void {
  const dir = mailboxDir(projectDir)
  if (!fs.existsSync(dir)) return
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
  for (const filename of fs.readdirSync(dir)) {
    if (!filename.endsWith('.json.read')) continue
    const filePath = path.join(dir, filename)
    try {
      const { mtimeMs } = fs.statSync(filePath)
      if (mtimeMs < cutoff) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // ignore errors for individual files
    }
  }
}
