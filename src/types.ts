// src/types.ts

export interface Task {
  id: number
  name: string
  description?: string
  status: 'pending' | 'in-progress' | 'converged' | 'pathology'
  worker: number | null
  depends_on?: number[]
  isolated?: boolean
  claimed_at?: string
  lease_expires_at?: string
}

export interface ArchitectReview {
  status: 'approved' | 'rejected'
  reviewed_at: string
  notes: string
}

export interface WorkerState {
  worker_id: number
  task: string
  generation: number
  consecutive_failures: number
  last_results: ('pass' | 'fail')[]
  pathology: {
    stagnation: boolean
    oscillation: boolean
    wonder_loop: boolean
  }
  dod_checklist: {
    npm_test: boolean
    npm_build: boolean
    tasks_complete: boolean
  }
  converged: boolean
  started_at: string
  updated_at: string
  architect_review?: ArchitectReview
}

export interface RalphConfig {
  notifications: {
    macos: boolean
    slack_webhook: string
    discord_webhook: string
  }
  caffeinate: boolean
  leaseDurationMs?: number
  stuckThresholdMs?: number
}

export interface Profile {
  name: string
  description: string
  stack: Record<string, string>
  claude_md_additions: string[]
  initial_structure: string[]
}
