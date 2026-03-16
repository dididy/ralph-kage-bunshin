import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTeam } from '../../src/commands/team'
import * as tmux from '../../src/core/tmux'
import * as state from '../../src/core/state'
import * as caffeinate from '../../src/core/caffeinate'
import * as configModule from '../../src/core/config'
import { execSync } from 'child_process'

vi.mock('../../src/core/tmux')
vi.mock('../../src/core/state')
vi.mock('../../src/core/caffeinate')
vi.mock('../../src/core/config')
vi.mock('child_process')

describe('ralph team', () => {
  beforeEach(() => {
    vi.mocked(tmux.sessionExists).mockReturnValue(false)
    vi.mocked(tmux.createSession).mockReturnValue(undefined)
    vi.mocked(tmux.splitPane).mockReturnValue(undefined)
    vi.mocked(tmux.applyLayout).mockReturnValue(undefined)
    vi.mocked(tmux.sendKeys).mockReturnValue(undefined)
    vi.mocked(caffeinate.startCaffeinate).mockReturnValue(undefined)
    vi.mocked(state.writeWorkerState).mockReturnValue(undefined)
    vi.mocked(configModule.loadConfig).mockReturnValue({
      notifications: { macos: true, slack_webhook: '', discord_webhook: '' },
      caffeinate: true,
    })
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
  })

  it('tmux 세션을 생성한다', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })

  it('워커 N-1번 pane을 추가로 분할하고 tiled 레이아웃을 적용한다', () => {
    runTeam(3, '/tmp/test-project')
    expect(tmux.splitPane).toHaveBeenCalledTimes(2)
    expect(tmux.applyLayout).toHaveBeenCalledWith(expect.any(String), 'tiled')
  })

  it('각 워커에 RALPH_WORKER_ID 환경변수를 주입한다', () => {
    runTeam(3, '/tmp/test-project')
    const allCalls = vi.mocked(tmux.sendKeys).mock.calls.map(c => c[2])
    expect(allCalls).toContain('export RALPH_WORKER_ID=1')
    expect(allCalls).toContain('export RALPH_WORKER_ID=2')
    expect(allCalls).toContain('export RALPH_WORKER_ID=3')
  })

  it('tasks.json에 worker를 미리 할당하지 않는다', () => {
    runTeam(3, '/tmp/test-project')
    expect(state.writeTasks).not.toHaveBeenCalled()
  })

  it('각 pane에서 /ralph-kage-bunshin-loop으로 claude를 실행한다', () => {
    runTeam(3, '/tmp/test-project')
    const claudeCalls = vi.mocked(tmux.sendKeys).mock.calls
      .map(c => c[2])
      .filter(cmd => cmd.includes('claude'))
    expect(claudeCalls).toHaveLength(3)
    claudeCalls.forEach(cmd => expect(cmd).toContain('/ralph-kage-bunshin-loop'))
  })

  it('기존 세션이 있으면 kill하고 재생성한다', () => {
    vi.mocked(tmux.sessionExists).mockReturnValue(true)
    runTeam(2, '/tmp/test-project')
    expect(tmux.killSession).toHaveBeenCalledWith('ralph-test-project')
    expect(tmux.createSession).toHaveBeenCalledWith('ralph-test-project')
  })
})
