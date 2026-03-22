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
  last_results: ('pass' | 'fail' | 'fail:external_service')[]
  pathology: {
    stagnation: boolean
    oscillation: boolean
    wonder_loop: boolean
    external_service_block?: boolean
  }
  dod_checklist: {
    npm_test: boolean
    npm_build: boolean
    tasks_complete: boolean
    visual_regression?: boolean
    skill_artifacts?: boolean
  }
  approach_history?: { approach: string; error: string; tried_at: string }[]
  fakechat_port?: number
  converged: boolean
  started_at: string
  updated_at: string
  architect_review?: ArchitectReview
  cost?: {
    total_usd: number
    total_input_tokens: number
    total_output_tokens: number
    api_duration_ms: number
  }
}

export interface RalphConfig {
  notifications: {
    macos: boolean
    slack_webhook: string
    discord_webhook: string
    fakechat_port?: string
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
