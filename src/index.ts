import { Command } from 'commander'
import { runTeam } from './commands/team'
import { runRecover } from './commands/recover'
import { printStatus } from './commands/status'
import { listProfiles, applyProfile } from './commands/profile'
import { setSecret, unsetSecret, listSecrets } from './commands/secrets'
import { printReport } from './commands/report'

const program = new Command()

program
  .name('ralph')
  .description('Spawn N Claude agents. They claim tasks, write tests, implement, and converge.')
  .version(typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.1.0')

program
  .command('team <n>')
  .description('Create N tmux workers and launch claude')
  .action((n: string) => {
    const workerCount = parseInt(n, 10)
    if (!Number.isSafeInteger(workerCount) || workerCount < 1) {
      console.error('Error: worker count must be 1 or more')
      process.exit(1)
    }
    if (workerCount > 20) {
      console.error('Error: worker count cannot exceed 20')
      process.exit(1)
    }
    runTeam(workerCount, process.cwd())
  })

program
  .command('recover')
  .description('Reset expired leases and relaunch workers for pending tasks')
  .action(() => {
    runRecover(process.cwd())
  })

program
  .command('status')
  .description('Show all worker status')
  .action(() => {
    printStatus(process.cwd())
  })

const profileCmd = program
  .command('profile')
  .description('Manage profiles')

profileCmd
  .command('list')
  .description('List saved profiles')
  .action(() => {
    try {
      const profiles = listProfiles()
      if (profiles.length === 0) {
        console.log('No profiles found. Add JSON files to ~/.ralph/profiles/')
        return
      }
      profiles.forEach(p => console.log(`  ${p.name}: ${p.description}`))
    } catch (err) {
      console.error('Error listing profiles:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

profileCmd
  .command('apply <name>')
  .description('Apply a profile')
  .action((name: string) => {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      console.error('Error: invalid profile name — use letters, numbers, hyphens, underscores only')
      process.exit(1)
    }
    try {
      applyProfile(name, process.cwd())
    } catch (err) {
      console.error('Error applying profile:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  })

const secretsCmd = program
  .command('secrets')
  .description('Manage project secrets (.ralph/.env)')

secretsCmd
  .command('set <assignment>')
  .description('Set a secret (KEY=value)')
  .action((assignment: string) => {
    const eq = assignment.indexOf('=')
    if (eq === -1) {
      console.error('Format: ralph secrets set KEY=value')
      process.exit(1)
    }
    const key = assignment.slice(0, eq)
    const value = assignment.slice(eq + 1)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      console.error('Error: invalid key — must match [A-Za-z_][A-Za-z0-9_]*')
      process.exit(1)
    }
    setSecret(process.cwd(), key, value)
  })

secretsCmd
  .command('unset <key>')
  .description('Remove a secret')
  .action((key: string) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      console.error('Error: invalid key — must match [A-Za-z_][A-Za-z0-9_]*')
      process.exit(1)
    }
    unsetSecret(process.cwd(), key)
  })

secretsCmd
  .command('list')
  .description('List secret keys (values hidden)')
  .action(() => {
    listSecrets(process.cwd())
  })

program
  .command('report')
  .description('Show per-worker summary with task, generations, time, cost')
  .action(() => {
    printReport(process.cwd())
  })

program.parse()
