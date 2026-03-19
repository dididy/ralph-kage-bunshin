import { execFileSync } from 'child_process'
import type { RalphConfig } from '../types'

interface NotifyOptions {
  title: string
  message: string
  config: RalphConfig
}

function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function postWebhook(url: string, body: string): void {
  if (!isValidHttpsUrl(url)) return
  try {
    execFileSync('curl', [
      '-s', '--max-time', '5',
      '-X', 'POST',
      '-H', 'Content-type: application/json',
      '--data', body,
      url,
    ], { stdio: 'pipe' })
  } catch {
    // ignore webhook failures
  }
}

export function notify({ title, message, config }: NotifyOptions): void {
  if (config.notifications.macos) {
    try {
      const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`
      execFileSync('osascript', ['-e', script], { stdio: 'pipe' })
    } catch {
      // ignore macOS notification failures
    }
  }

  if (config.notifications.slack_webhook) {
    postWebhook(config.notifications.slack_webhook, JSON.stringify({ text: `${title}: ${message}` }))
  }

  if (config.notifications.discord_webhook) {
    postWebhook(config.notifications.discord_webhook, JSON.stringify({ content: `**${title}**: ${message}` }))
  }
}
