import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sendMessage, readMessages, markRead, countUnread, listMessages } from '../../src/core/mailbox'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('mailbox', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-mailbox-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('sendMessage writes a JSON file in .ralph/mailbox/', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'task_complete', subject: 'auth done', body: 'src/auth.ts complete' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/\.json$/)
    const msg = JSON.parse(fs.readFileSync(path.join(mailboxDir, files[0]), 'utf-8'))
    expect(msg.from).toBe(1)
    expect(msg.to).toBe('all')
    expect(msg.type).toBe('task_complete')
    expect(msg.subject).toBe('auth done')
    expect(msg.body).toBe('src/auth.ts complete')
    expect(msg.timestamp).toBeDefined()
  })

  it('readMessages returns messages addressed to workerId or "all"', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'broadcast', body: '' })
    sendMessage(tmpDir, { from: 2, to: 3, type: 'blocked', subject: 'help needed', body: 'stuck on DB' })
    sendMessage(tmpDir, { from: 1, to: 2, type: 'decision', subject: 'for worker 2', body: 'use postgres' })

    const msgs = readMessages(tmpDir, 3)
    expect(msgs).toHaveLength(2) // 'all' + to:3
    expect(msgs.map(m => m.subject)).toContain('broadcast')
    expect(msgs.map(m => m.subject)).toContain('help needed')
  })

  it('readMessages does not return already-read messages (.read files)', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'old news', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    fs.renameSync(path.join(mailboxDir, files[0]), path.join(mailboxDir, files[0] + '.read'))

    const msgs = readMessages(tmpDir, 1)
    expect(msgs).toHaveLength(0)
  })

  it('markRead renames file to add .read extension', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'test', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    const filename = files[0]

    markRead(tmpDir, filename)

    const after = fs.readdirSync(mailboxDir)
    expect(after).toContain(filename + '.read')
    expect(after).not.toContain(filename)
  })

  it('markRead throws on path traversal attempt', () => {
    expect(() => markRead(tmpDir, '../workers/worker-1/state.json')).toThrow('Invalid mailbox filename')
    expect(() => markRead(tmpDir, 'foo/bar.json')).toThrow('Invalid mailbox filename')
    expect(() => markRead(tmpDir, '..\\state.json')).toThrow('Invalid mailbox filename')
  })

  it('countUnread returns count of unread messages', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'msg1', body: '' })
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'msg2', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    markRead(tmpDir, files[0])

    expect(countUnread(tmpDir)).toBe(1)
  })

  it('listMessages returns all messages including read ones', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'msg1', body: '' })
    sendMessage(tmpDir, { from: 2, to: 1, type: 'decision', subject: 'msg2', body: '' })
    expect(listMessages(tmpDir)).toHaveLength(2)
  })
})
