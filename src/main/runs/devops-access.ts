import type { AgentConfig } from '@shared/blocks'

/**
 * What an agent may do on the DevOps platforms without approval, by its DevOps access.
 * Agents run unattended, so anything not allowed here is refused rather than asked for.
 * What the signed-in account itself may not do, the platform still refuses.
 *
 * - `read`: everything that only reads: issues, pull requests, diffs, checks, runs, releases,
 *   and fetching branches to look at them.
 * - `write`: everything: the whole CLI, including comments on lines (`gh api`), creating,
 *   editing and merging pull requests, and pushing.
 *
 * Add a platform here when it is supported, e.g. Azure DevOps (`az boards`, `az repos`).
 */
const devOpsCommands: Record<string, { read: string[]; write: string[] }> = {
  github: {
    read: [
      'gh issue view',
      'gh issue list',
      'gh issue status',
      'gh pr view',
      'gh pr list',
      'gh pr diff',
      'gh pr checks',
      'gh pr status',
      'gh repo view',
      'gh repo list',
      'gh search',
      'gh run view',
      'gh run list',
      'gh workflow view',
      'gh workflow list',
      'gh release view',
      'gh release list',
      'gh label list',
      'gh status',
      'git fetch',
    ],
    // Prefixes, so `gh` covers every GitHub CLI command, `gh api` included.
    write: ['gh', 'git fetch', 'git push'],
  },
}

function commandsFor(config: AgentConfig): string[] {
  const access = config.devops
  if (access === 'none') return []
  return Object.values(devOpsCommands).flatMap(({ read, write }) =>
    access === 'write' ? write : read,
  )
}

/**
 * Local git commands an agent needs to commit in a worktree made for it, e.g. for a pull
 * request. `acceptEdits` allows editing files but no commands, and an unattended agent
 * cannot ask. Pushing is a DevOps write (see above).
 */
const commitCommands = ['git add', 'git commit']

/** Tools the agent may use without approval, beyond what its permission mode allows. */
export function allowedTools(config: AgentConfig, options: { commit: boolean }): string[] {
  const commands = commandsFor(config)
  // In plan mode the agent only reads, so it gets nothing to commit with.
  if (options.commit && config.permissionMode !== 'plan') commands.push(...commitCommands)
  return commands.map((command) => `Bash(${command} *)`)
}

/**
 * Tells the agent what it may do, so it does not try commands that would be refused with no
 * one there to approve them.
 */
export function describeDevOpsAccess(config: AgentConfig): string {
  switch (config.devops) {
    case 'none':
      return '## GitHub access\n\nYou have no access to GitHub. Do not use the GitHub CLI (`gh`).'
    case 'read':
      return [
        '## GitHub access',
        '',
        `You may read from GitHub, but not change anything there. These commands are allowed; others are refused: ${commandsFor(
          config,
        )
          .map((command) => `\`${command}\``)
          .join(', ')}.`,
      ].join('\n')
    case 'write':
      return [
        '## GitHub access',
        '',
        'You have full access to GitHub: every GitHub CLI command (`gh`, including `gh api`, e.g. for comments on lines of a pull request), `git fetch` and `git push`.',
      ].join('\n')
  }
}
