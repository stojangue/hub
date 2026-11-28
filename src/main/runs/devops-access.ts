import type { AgentConfig } from '@shared/blocks'

/**
 * What an agent may do on the DevOps platforms without approval, by its DevOps access.
 * Agents run unattended, so anything not allowed here is refused rather than asked for.
 * What the signed-in account itself may not do, the platform still refuses.
 *
 * - `read`: everything that only reads: issues, pull requests, diffs, checks, runs, releases,
 *   and fetching branches to look at them.
 * - `write`: everything on GitHub: issues, pull requests, comments on lines (`gh api`),
 *   creating, editing and merging pull requests, and pushing.
 *
 * Rules ending in ` *` match any arguments after the prefix, so only commands whose options
 * cannot run programs on this machine are listed that way. Left out on purpose: `gh alias`,
 * `gh extension`, `gh config` and `gh auth`, which run or set up commands and credentials
 * here; `gh repo clone`, `gh repo fork` and `gh gist`, which pass options on to git, e.g.
 * `--template` with hooks; and the `download` commands, which write files anywhere.
 * `git fetch` and `git push` take options such as `--upload-pack` and `--receive-pack` that
 * run any program, so they are allowed only in the fixed forms from `gitCommands`.
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
    ],
    write: [
      'gh api',
      'gh issue',
      'gh pr',
      'gh label',
      'gh search',
      'gh status',
      'gh workflow',
      'gh project',
      'gh repo view',
      'gh repo list',
      'gh repo edit',
      'gh run list',
      'gh run view',
      'gh run watch',
      'gh run rerun',
      'gh run cancel',
      'gh release list',
      'gh release view',
      'gh release create',
      'gh release edit',
      'gh release upload',
      'gh release delete',
    ],
  },
}

/** Where the agent works with git: what it may fetch and where it pushes to. */
export interface GitTarget {
  /** The remote of the work item's repository, e.g. `origin`. */
  remote: string
  /** The local branch. */
  branch: string
  /** The branch to push to. */
  headBranch: string
  /** Where to push: the remote, or a fork's URL. */
  pushTarget: string
  /** For an issue: the branch a pull request goes into. */
  baseBranch: string | null
}

/**
 * `git fetch` and, at write level, `git push`, in the forms the agent is told to use, without
 * options. Without a target, e.g. in the linked folder itself, only the bare commands.
 */
function gitCommands(config: AgentConfig, target: GitTarget | null): string[] {
  const commands = ['git fetch']
  if (target) {
    commands.push(`git fetch ${target.remote}`)
    for (const branch of new Set([target.headBranch, target.baseBranch])) {
      if (branch) commands.push(`git fetch ${target.remote} ${branch}`)
    }
  }
  if (config.devops !== 'write') return commands
  commands.push('git push')
  if (target) {
    commands.push(`git push ${target.pushTarget} HEAD:${target.headBranch}`)
    // Only where the local branch has the head branch's name, as for an issue; elsewhere
    // this would make a new branch on GitHub.
    if (target.branch === target.headBranch) {
      commands.push(
        `git push -u ${target.pushTarget} ${target.branch}`,
        `git push ${target.pushTarget} ${target.branch}`,
      )
    }
  }
  return commands
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

/**
 * Tools the agent may use without approval, beyond what its permission mode allows.
 * `worktree` is set when the agent works in a worktree made for it: it may commit there, and
 * fetch and push its branch.
 */
export function allowedTools(config: AgentConfig, worktree: GitTarget | null): string[] {
  const prefixes = commandsFor(config)
  // In plan mode the agent only reads, so it gets nothing to commit with.
  if (worktree && config.permissionMode !== 'plan') prefixes.push(...commitCommands)
  const exact = config.devops === 'none' ? [] : gitCommands(config, worktree)
  return [
    ...prefixes.map((command) => `Bash(${command} *)`),
    // Without ` *`, a rule matches only the command exactly as written.
    ...exact.map((command) => `Bash(${command})`),
    ...namedSkills(config).flatMap((skill) => [`Skill(${skill})`, `Skill(${skill} *)`]),
  ]
}

/**
 * Skills the agent may load without approval: plugin skills (`plugin:skill`) named in its
 * instructions, and only at DevOps write level. A skill's `allowed-tools` lets its commands
 * run without approval while it is active, so a skill could get around the read level, and
 * a skill from the work item's repository (`.claude/skills/` on a pull request's branch,
 * written by whoever wrote the pull request) could run any command here. Project and user
 * skills have no `plugin:` prefix, so they are never allowed this way.
 */
function namedSkills(config: AgentConfig): string[] {
  if (config.devops !== 'write') return []
  const names = config.instructions.matchAll(
    /(?:^|[\s`'"(/])([a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*)(?=$|[\s`'".,;:!?)])/gim,
  )
  return [...new Set([...names].map((match) => match[1] ?? '').filter(Boolean))]
}

/**
 * Tells the agent what it may do, so it does not try commands that would be refused with no
 * one there to approve them.
 */
export function describeDevOpsAccess(config: AgentConfig, worktree: GitTarget | null): string {
  const list = (commands: string[]) => commands.map((command) => `\`${command}\``).join(', ')
  switch (config.devops) {
    case 'none':
      return '## GitHub access\n\nYou have no access to GitHub. Do not use the GitHub CLI (`gh`).'
    case 'read':
      return [
        '## GitHub access',
        '',
        `You may read from GitHub, but not change anything there. These commands are allowed, with any options: ${list(commandsFor(config))}. These git commands are allowed exactly as written, without further options: ${list(gitCommands(config, worktree))}. Other commands are refused.`,
      ].join('\n')
    case 'write':
      return [
        '## GitHub access',
        '',
        `You have full access to GitHub through these GitHub CLI commands, with any options: ${list(commandsFor(config))}. \`gh api\` covers everything else, e.g. comments on lines of a pull request. These git commands are allowed exactly as written, without further options: ${list(gitCommands(config, worktree))}. Other commands are refused.`,
      ].join('\n')
  }
}
