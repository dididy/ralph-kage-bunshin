import fs from 'fs'
import path from 'path'
import os from 'os'
import type { RalphConfig } from '../types'

const CONFIG_PATH = path.join(os.homedir(), '.ralph', 'config.json')

const DEFAULT_CONFIG: RalphConfig = {
  notifications: {
    macos: true,
    slack_webhook: '',
    discord_webhook: '',
  },
  caffeinate: true,
}

function isValidConfig(c: unknown): c is RalphConfig {
  if (typeof c !== 'object' || c === null) return false
  const obj = c as Record<string, unknown>
  if (typeof obj.caffeinate !== 'boolean') return false
  if (typeof obj.notifications !== 'object' || obj.notifications === null) return false
  const n = obj.notifications as Record<string, unknown>
  if (typeof n.macos !== 'boolean') return false
  if (typeof n.slack_webhook !== 'string') return false
  if (typeof n.discord_webhook !== 'string') return false
  if ('fakechat_port' in n) {
    if (typeof n.fakechat_port !== 'string') return false
    const port = parseInt(n.fakechat_port as string, 10)
    if (isNaN(port) || port < 1 || port > 65535) return false
  }
  if ('stuckThresholdMs' in obj && (typeof obj.stuckThresholdMs !== 'number' || obj.stuckThresholdMs <= 0 || obj.stuckThresholdMs > 24 * 60 * 60 * 1000)) return false
  return true
}

export function loadConfig(): RalphConfig {
  if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    if (!isValidConfig(parsed)) {
      console.warn('[WARN] ~/.ralph/config.json has invalid shape, using defaults')
      return DEFAULT_CONFIG
    }
    return parsed
  } catch (e) {
    console.warn(`[WARN] ~/.ralph/config.json is invalid JSON (${e instanceof Error ? e.message : String(e)}), using defaults`)
    return DEFAULT_CONFIG
  }
}

export function getFakechatPort(config: RalphConfig): string {
  return config.notifications.fakechat_port ?? process.env.FAKECHAT_PORT ?? '8787'
}
