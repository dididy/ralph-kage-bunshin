import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { sendMessage, readMessages, markRead, countUnread, listMessages, pruneMailbox } from '../../src/core/mailbox'
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

  it('markRead throws on non-.json filename', () => {
    expect(() => markRead(tmpDir, 'somefile.txt')).toThrow('Invalid mailbox filename')
  })

  it('markRead silently handles ENOENT (already renamed by another worker)', () => {
    // Should not throw when file doesn't exist
    expect(() => markRead(tmpDir, 'nonexistent.json')).not.toThrow()
  })

  it('countUnread returns count of unread messages', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'msg1', body: '' })
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'msg2', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    markRead(tmpDir, files[0])

    expect(countUnread(tmpDir)).toBe(1)
  })

  it('countUnread returns 0 when mailbox directory does not exist', () => {
    expect(countUnread(path.join(tmpDir, 'nonexistent'))).toBe(0)
  })

  it('listMessages returns all messages including read ones', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'msg1', body: '' })
    sendMessage(tmpDir, { from: 2, to: 1, type: 'decision', subject: 'msg2', body: '' })
    expect(listMessages(tmpDir)).toHaveLength(2)
  })

  it('listMessages returns empty array when directory does not exist', () => {
    expect(listMessages(path.join(tmpDir, 'nonexistent'))).toEqual([])
  })

  it('listMessages marks read status correctly', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'msg1', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    markRead(tmpDir, files[0])

    sendMessage(tmpDir, { from: 2, to: 'all', type: 'info', subject: 'msg2', body: '' })

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(2)
    const readMsg = msgs.find(m => m.subject === 'msg1')
    const unreadMsg = msgs.find(m => m.subject === 'msg2')
    expect(readMsg?.read).toBe(true)
    expect(unreadMsg?.read).toBe(false)
  })

  it('listMessages skips invalid JSON files', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'bad-message.json'), 'not valid json')

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('listMessages skips messages with invalid structure', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'invalid-structure.json'), JSON.stringify({
      from: 'not-a-number', // invalid
      to: 'all',
      type: 'info',
      subject: 'test',
      body: '',
      timestamp: new Date().toISOString(),
    }))

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('listMessages skips messages with invalid type', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'bad-type.json'), JSON.stringify({
      from: 1,
      to: 'all',
      type: 'unknown_type', // invalid
      subject: 'test',
      body: '',
      timestamp: new Date().toISOString(),
    }))

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('listMessages skips messages with non-string subject', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'bad-subject.json'), JSON.stringify({
      from: 1,
      to: 'all',
      type: 'info',
      subject: 123,
      body: '',
      timestamp: new Date().toISOString(),
    }))

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('listMessages skips messages with non-string body', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'bad-body.json'), JSON.stringify({
      from: 1,
      to: 'all',
      type: 'info',
      subject: 'test',
      body: null,
      timestamp: new Date().toISOString(),
    }))

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('listMessages skips messages with non-string timestamp', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'bad-timestamp.json'), JSON.stringify({
      from: 1,
      to: 'all',
      type: 'info',
      subject: 'test',
      body: '',
      timestamp: 12345,
    }))

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('listMessages skips null JSON values', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'null-message.json'), 'null')

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('listMessages skips messages with invalid to field', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(path.join(mailboxDir, 'bad-to.json'), JSON.stringify({
      from: 1,
      to: true, // invalid: not 'all' nor number
      type: 'info',
      subject: 'test',
      body: '',
      timestamp: new Date().toISOString(),
    }))

    const msgs = listMessages(tmpDir)
    expect(msgs).toHaveLength(0)
  })

  it('pruneMailbox deletes old .read files', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })

    // Create an old .read file
    const oldFile = path.join(mailboxDir, 'old-message.json.read')
    fs.writeFileSync(oldFile, JSON.stringify({ from: 1, to: 'all', type: 'info', subject: 'old', body: '', timestamp: '2020-01-01T00:00:00.000Z' }))
    // Set mtime to 30 days ago
    const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    fs.utimesSync(oldFile, oldTime, oldTime)

    pruneMailbox(tmpDir, 7)
    expect(fs.existsSync(oldFile)).toBe(false)
  })

  it('pruneMailbox keeps recent .read files', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    fs.mkdirSync(mailboxDir, { recursive: true })

    const recentFile = path.join(mailboxDir, 'recent-message.json.read')
    fs.writeFileSync(recentFile, JSON.stringify({ from: 1, to: 'all', type: 'info', subject: 'recent', body: '', timestamp: new Date().toISOString() }))

    pruneMailbox(tmpDir, 7)
    expect(fs.existsSync(recentFile)).toBe(true)
  })

  it('pruneMailbox does not delete unread .json files', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'active', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)

    pruneMailbox(tmpDir, 0) // keepDays=0 would delete all .read files
    // Unread .json should still exist
    expect(fs.readdirSync(mailboxDir)).toHaveLength(files.length)
  })

  it('pruneMailbox handles non-existent directory', () => {
    expect(() => pruneMailbox(path.join(tmpDir, 'nonexistent'))).not.toThrow()
  })

  it('sendMessage creates mailbox directory if it does not exist', () => {
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    expect(fs.existsSync(mailboxDir)).toBe(false)

    sendMessage(tmpDir, { from: 1, to: 2, type: 'info', subject: 'test', body: '' })
    expect(fs.existsSync(mailboxDir)).toBe(true)
  })

  it('sendMessage generates unique filenames', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'a', body: '' })
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'b', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    expect(files).toHaveLength(2)
    expect(files[0]).not.toBe(files[1])
  })

  it('markRead rethrows non-ENOENT errors', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'info', subject: 'test', body: '' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    const filename = files[0]

    // Make the rename fail with a non-ENOENT error by removing the directory
    const filePath = path.join(mailboxDir, filename)
    fs.unlinkSync(filePath)
    fs.rmdirSync(mailboxDir)
    // Now mailboxDir doesn't exist, rename will fail with ENOENT on the dir
    // We need a different approach: write the file back but make the target unwritable
    fs.mkdirSync(mailboxDir, { recursive: true })
    fs.writeFileSync(filePath, '{}')
    // Create a file at the .read target path as a directory to cause ENOTDIR
    const readPath = filePath + '.read'
    fs.mkdirSync(readPath, { recursive: true })
    expect(() => markRead(tmpDir, filename)).toThrow()
    fs.rmdirSync(readPath)
  })

  it('sendMessage accepts broadcast type', () => {
    sendMessage(tmpDir, { from: 1, to: 'all', type: 'broadcast', subject: 'api broken', body: 'use v2' })
    const mailboxDir = path.join(tmpDir, '.ralph', 'mailbox')
    const files = fs.readdirSync(mailboxDir)
    expect(files).toHaveLength(1)
    const msg = JSON.parse(fs.readFileSync(path.join(mailboxDir, files[0]), 'utf-8'))
    expect(msg.type).toBe('broadcast')
  })

  it('readMessages filters to specific worker', () => {
    sendMessage(tmpDir, { from: 1, to: 2, type: 'info', subject: 'for-2', body: '' })
    sendMessage(tmpDir, { from: 1, to: 3, type: 'info', subject: 'for-3', body: '' })

    const msgs = readMessages(tmpDir, 2)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].subject).toBe('for-2')
  })
})
