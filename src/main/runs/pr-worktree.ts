/**
 * Git worktrees for pull requests: an agent that works on a pull request gets its own
 * checkout of the pull request's branch in a temporary folder, so the folder the user works
 * in stays untouched. The worktree is removed after the run unless it holds work that would
 * be lost.
 */

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { WorktreeKeptReason } from '@shared/runs'
import { cliPath, firstLine } from '../cli-env'
import type { PullRequestContent } from '../github'

const GIT_TIMEOUT_MS = 120_000

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: cliPath(),
    // Never wait for credentials or an editor.
    GIT_TERMINAL_PROMPT: '0',
    GIT_EDITOR: 'true',
  }
}

/** Runs `git` in `cwd` (never through a shell) and returns stdout. */
function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        env: gitEnv(),
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(firstLine(String(stderr)) || firstLine(error.message) || 'git failed'))
        } else {
          resolve(String(stdout))
        }
      },
    )
  })
}

export interface GitRepositoryInfo {
  /** Top level of the repository that contains the folder. */
  root: string
  /** Path of the folder inside the repository, e.g. `packages/app/`; empty at the top level. */
  prefix: string
}

/** Where the folder sits in a git repository, or `null` if it is in none. */
export async function inspectRepository(folder: string): Promise<GitRepositoryInfo | null> {
  try {
    const [root = '', prefix = ''] = (
      await git(folder, ['rev-parse', '--show-toplevel', '--show-prefix'])
    ).split('\n')
    return root ? { root, prefix } : null
  } catch {
    return null
  }
}

/** Whether a remote URL points at the GitHub repository `owner/name`, by HTTPS or SSH. */
function isGitHubUrl(url: string, repository: string): boolean {
  const match = /github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(url.trim())
  return match?.[1]?.toLowerCase() === repository.toLowerCase()
}

/** The name of a remote of the repository that points at `owner/name`, or `null`. */
export async function findRemote(root: string, repository: string): Promise<string | null> {
  let output: string
  try {
    output = await git(root, ['remote', '-v'])
  } catch {
    return null
  }
  const remotes = output
    .split('\n')
    .map((line) => line.split(/\s+/))
    .filter(([name, url]) => name && url && isGitHubUrl(url, repository))
    .map(([name]) => name as string)
  // `origin` first, if it is one of them.
  return remotes.find((name) => name === 'origin') ?? remotes[0] ?? null
}

export interface PullRequestWorktree {
  /**
   * `pullRequest`: on the pull request's branch. `issue`: on a new branch for the issue,
   * started from the repository's default branch, that the agent pushes and opens a pull
   * request for.
   */
  kind: 'pullRequest' | 'issue'
  /** The linked folder the worktree was made from. */
  folder: string
  /** The repository the folder belongs to; worktrees are added and removed through it. */
  repositoryRoot: string
  /** Top level of the worktree. */
  root: string
  /** Where the agent works: the linked folder's counterpart in the worktree. */
  path: string
  /** The temporary folder that holds the worktree. */
  tempDir: string
  /** Local branch of the worktree. */
  branch: string
  /** Whether the run made the local branch, so removing the worktree deletes it again. */
  createdBranch: boolean
  /** Whether the worktree was kept by an earlier run and is used again, with its work. */
  reused: boolean
  /** The name of the folder's remote for the work item's repository, e.g. `origin`. */
  remote: string
  /** The pull request's or issue's number. */
  pullRequest: number
  /** The branch to push to: the pull request's head branch, or for an issue the new branch. */
  headBranch: string
  /** For an issue: the branch the new branch starts from, and a pull request goes into. */
  baseBranch: string | null
  /**
   * Where to push: a remote name whose branch the local branch tracks, so `git push` works,
   * or for a fork the fork's URL.
   */
  pushTarget: string
  /** False if the head branch is in a fork the agent may not push to. */
  canPush: boolean
  /** Whether `git push` alone pushes to the head branch. */
  tracksHead: boolean
  /** The commit the worktree started at; empty for a reused worktree. */
  startCommit: string
}

/** Branch names as git allows them, roughly; guards the arguments built from them. */
function isSafeRef(name: string): boolean {
  return (
    /^[A-Za-z0-9._/-]{1,250}$/.test(name) &&
    !name.startsWith('-') &&
    !name.includes('..') &&
    !name.endsWith('.lock')
  )
}

/**
 * Adds a worktree for the pull request's head branch in a temporary folder. Same-repository
 * pull requests get a local branch that tracks the head branch; pull requests from forks are
 * fetched by their pull request ref. Throws with a message if anything fails.
 */
export async function createPullRequestWorktree(
  folder: string,
  repository: string,
  number: number,
  content: PullRequestContent,
): Promise<PullRequestWorktree> {
  const info = await inspectRepository(folder)
  if (!info) throw new Error(`${folder} is not in a git repository.`)
  const remote = await findRemote(info.root, repository)
  if (!remote) throw new Error(`${info.root} has no remote for ${repository}.`)
  const headBranch = content.headBranch
  if (!isSafeRef(headBranch)) throw new Error(`Unexpected branch name: ${headBranch}`)

  const fork = content.isCrossRepository
  if (fork) {
    await git(info.root, ['fetch', '--no-tags', remote, `refs/pull/${number}/head`])
  } else {
    // Updates the usual remote-tracking branch, so the local branch can track it.
    await git(info.root, [
      'fetch',
      '--no-tags',
      remote,
      `+refs/heads/${headBranch}:refs/remotes/${remote}/${headBranch}`,
    ])
  }
  const startCommit = fork
    ? (await git(info.root, ['rev-parse', 'FETCH_HEAD'])).trim()
    : (await git(info.root, ['rev-parse', `refs/remotes/${remote}/${headBranch}`])).trim()

  const tempDir = await mkdtemp(join(tmpdir(), 'hub-pr-'))
  const root = join(tempDir, repository.split('/')[1] ?? 'repository')
  const branch = `hub/pr-${number}-${randomBytes(3).toString('hex')}`
  try {
    await git(info.root, [
      'worktree',
      'add',
      ...(fork
        ? ['-b', branch, root, startCommit]
        : ['--track', '-b', branch, root, `${remote}/${headBranch}`]),
    ])
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }

  const headRepository = content.headRepository
  return {
    kind: 'pullRequest',
    folder,
    repositoryRoot: info.root,
    root,
    path: info.prefix ? join(root, info.prefix.replace(/\/$/, '')) : root,
    tempDir,
    branch,
    createdBranch: true,
    reused: false,
    remote,
    pullRequest: number,
    headBranch,
    baseBranch: null,
    pushTarget: fork && headRepository ? `https://github.com/${headRepository}.git` : remote,
    canPush: !fork || (content.maintainerCanModify && headRepository !== null),
    tracksHead: !fork,
    startCommit,
  }
}

/** The remote's default branch, e.g. `main`, from what the remote reports as its `HEAD`. */
async function defaultBranch(root: string, remote: string): Promise<string> {
  const output = await git(root, ['ls-remote', '--symref', remote, 'HEAD'])
  const match = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(output)
  if (!match?.[1] || !isSafeRef(match[1])) {
    throw new Error(`Could not tell the default branch of ${remote}.`)
  }
  return match[1]
}

/** The branch name for an issue, like `12-fix-the-login`: its number and its title. */
export function issueBranchName(number: number, title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  return slug ? `${number}-${slug}` : `${number}-issue`
}

/**
 * Roots of the worktrees that runs use now, so a kept one is not used by two runs at once.
 * Stored resolved (see `inUseKey`), as git reports them, e.g. `/private/var/…` on macOS.
 */
const worktreesInUse = new Set<string>()

/** The form of `path` kept in `worktreesInUse`: resolved, or as it is if it cannot be. */
async function inUseKey(path: string): Promise<string> {
  return realpath(path).catch(() => path)
}

/** The path of the worktree of the repository that has `branch` checked out, or `null`. */
async function worktreeOfBranch(root: string, branch: string): Promise<string | null> {
  const output = await git(root, ['worktree', 'list', '--porcelain'])
  for (const entry of output.split(/\n\s*\n/)) {
    const lines = entry.split('\n')
    const path = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length)
    if (path && lines.includes(`branch refs/heads/${branch}`)) return path
  }
  return null
}

/** Whether `path` is a worktree an earlier run made for an issue: `<tmp>/hub-issue-…/<name>`. */
async function isKeptIssueWorktree(path: string): Promise<boolean> {
  try {
    await access(path)
    const parent = dirname(path)
    if (!basename(parent).startsWith('hub-issue-')) return false
    return (await realpath(dirname(parent))) === (await realpath(tmpdir()))
  } catch {
    return false
  }
}

/**
 * The key in the branch's config that marks a branch the app made for an issue. Git drops it
 * with the branch, and it is shared by all worktrees of the repository.
 */
function createdMarker(branch: string): string {
  return `branch.${branch}.hubCreated`
}

async function markCreated(root: string, branch: string): Promise<void> {
  await git(root, ['config', createdMarker(branch), 'true'])
}

/** Whether the app made the branch, so it may delete it again. */
async function isMarkedCreated(root: string, branch: string): Promise<boolean> {
  const value = await git(root, ['config', '--get', createdMarker(branch)]).catch(() => '')
  return value.trim() === 'true'
}

/** Whether every commit of `ref` is also on `other`. */
async function isAncestor(root: string, ref: string, other: string): Promise<boolean> {
  try {
    await git(root, ['merge-base', '--is-ancestor', ref, other])
    return true
  } catch {
    return false
  }
}

async function hasRef(root: string, ref: string): Promise<boolean> {
  try {
    await git(root, ['rev-parse', '--verify', '--quiet', ref])
    return true
  } catch {
    return false
  }
}

/**
 * Adds a worktree for an issue on the branch named after it, in a temporary folder. If the
 * branch exists already, on the remote or here, work goes on there; otherwise it is made from
 * the repository's default branch, and the agent pushes it and opens a pull request. A
 * worktree an earlier run kept for the branch is used again, with the work it holds. Throws
 * with a message if anything fails, e.g. when the branch is checked out somewhere else.
 */
export async function createIssueWorktree(
  folder: string,
  repository: string,
  number: number,
  title: string,
): Promise<PullRequestWorktree> {
  const info = await inspectRepository(folder)
  if (!info) throw new Error(`${folder} is not in a git repository.`)
  const remote = await findRemote(info.root, repository)
  if (!remote) throw new Error(`${info.root} has no remote for ${repository}.`)
  const base = await defaultBranch(info.root, remote)
  const branch = issueBranchName(number, title)
  if (!isSafeRef(branch)) throw new Error(`Unexpected branch name: ${branch}`)

  await git(info.root, [
    'fetch',
    '--no-tags',
    remote,
    `+refs/heads/${base}:refs/remotes/${remote}/${base}`,
  ])
  // An earlier run may have pushed the branch already.
  const onRemote = (await git(info.root, ['ls-remote', '--heads', remote, branch])).trim() !== ''
  if (onRemote) {
    await git(info.root, [
      'fetch',
      '--no-tags',
      remote,
      `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
    ])
  }
  let local = await hasRef(info.root, `refs/heads/${branch}`)
  const madeByApp = local && (await isMarkedCreated(info.root, branch))

  if (local) {
    // Forgets worktrees whose folders are gone, e.g. deleted by a cleanup of the temp folder.
    await git(info.root, ['worktree', 'prune'])
    const existing = await worktreeOfBranch(info.root, branch)
    if (existing) {
      if (!(await isKeptIssueWorktree(existing))) {
        throw new Error(
          `The branch ${branch} is checked out in ${existing}. Switch that folder to another branch, or let the folder block work in the folder itself.`,
        )
      }
      const key = await inUseKey(existing)
      if (worktreesInUse.has(key)) {
        throw new Error(
          `The worktree ${existing} of the branch ${branch} is in use by another run.`,
        )
      }
      // Marked at once, without waiting in between, so a second run cannot take it, too.
      worktreesInUse.add(key)
      return issueWorktree(info, folder, existing, dirname(existing), branch, {
        createdBranch: madeByApp,
        reused: true,
        number,
        remote,
        base,
      })
    }
    // A branch an earlier run made and left behind, e.g. after it reused a kept worktree.
    // If all its commits are on GitHub or on the default branch, it holds nothing of its
    // own and may be behind: it is deleted and made again from there, like a new one.
    const upToDate = onRemote
      ? `refs/remotes/${remote}/${branch}`
      : `refs/remotes/${remote}/${base}`
    if (madeByApp && (await isAncestor(info.root, `refs/heads/${branch}`, upToDate))) {
      await git(info.root, ['branch', '-D', branch])
      local = false
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'hub-issue-'))
  const root = join(tempDir, repository.split('/')[1] ?? 'repository')
  try {
    if (local) {
      // The user's own branch for the issue, or one the app left with commits of its own:
      // used as it is. The user's own is never deleted afterwards.
      await git(info.root, ['worktree', 'add', root, branch])
    } else if (onRemote) {
      await git(info.root, [
        'worktree',
        'add',
        '--track',
        '-b',
        branch,
        root,
        `${remote}/${branch}`,
      ])
    } else {
      await git(info.root, [
        'worktree',
        'add',
        '--no-track',
        '-b',
        branch,
        root,
        `refs/remotes/${remote}/${base}`,
      ])
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }
  // Remembered with the branch, so a later run that reuses the worktree or finds the branch
  // left behind still knows it may delete it. Without the mark it is only kept, never lost.
  if (!local) await markCreated(info.root, branch).catch(() => undefined)
  return issueWorktree(info, folder, root, tempDir, branch, {
    // A branch the app made is deleted with the worktree, and only once nothing is lost.
    createdBranch: !local || madeByApp,
    reused: false,
    number,
    remote,
    base,
  })
}

/** Describes the issue worktree at `root` and marks it as in use. */
async function issueWorktree(
  info: GitRepositoryInfo,
  folder: string,
  root: string,
  tempDir: string,
  branch: string,
  options: {
    createdBranch: boolean
    reused: boolean
    number: number
    remote: string
    base: string
  },
): Promise<PullRequestWorktree> {
  const key = await inUseKey(root)
  worktreesInUse.add(key)
  try {
    return await describeIssueWorktree(info, folder, root, tempDir, branch, options)
  } catch (error) {
    worktreesInUse.delete(key)
    throw error
  }
}

/** Describes the issue worktree at `root`. */
async function describeIssueWorktree(
  info: GitRepositoryInfo,
  folder: string,
  root: string,
  tempDir: string,
  branch: string,
  options: {
    createdBranch: boolean
    reused: boolean
    number: number
    remote: string
    base: string
  },
): Promise<PullRequestWorktree> {
  const { remote, base } = options
  // A kept worktree may hold commits that are not pushed, so removing it later always checks
  // the head branch instead of comparing with where it starts now.
  const startCommit = options.reused ? '' : (await git(root, ['rev-parse', 'HEAD'])).trim()
  const tracks = (
    await git(root, ['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => '')
  ).trim()
  return {
    kind: 'issue',
    folder,
    repositoryRoot: info.root,
    root,
    path: info.prefix ? join(root, info.prefix.replace(/\/$/, '')) : root,
    tempDir,
    branch,
    createdBranch: options.createdBranch,
    reused: options.reused,
    remote,
    pullRequest: options.number,
    headBranch: branch,
    baseBranch: base,
    pushTarget: remote,
    canPush: true,
    tracksHead: tracks === `${remote}/${branch}`,
    startCommit,
  }
}

/**
 * Settings for the agent's git commands only, through the environment: `git push` pushes the
 * local branch to the branch it tracks, the pull request's head branch, despite the other
 * name, and fails instead of creating a branch where none is tracked.
 */
export function worktreeGitEnv(): Record<string, string> {
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'push.default',
    GIT_CONFIG_VALUE_0: 'upstream',
  }
}

/** Why the worktree must be kept, or `null` if nothing would be lost by removing it. */
async function workToKeep(worktree: PullRequestWorktree): Promise<WorktreeKeptReason | null> {
  const status = await git(worktree.root, ['status', '--porcelain'])
  if (status.trim()) return 'uncommittedChanges'
  const head = (await git(worktree.root, ['rev-parse', 'HEAD'])).trim()
  if (head === worktree.startCommit) return null
  try {
    // What the head branch has now, which includes what the agent pushed.
    await git(worktree.root, [
      'fetch',
      '--no-tags',
      worktree.pushTarget,
      `refs/heads/${worktree.headBranch}`,
    ])
    const ahead = (
      await git(worktree.root, ['rev-list', '--count', 'HEAD', '--not', 'FETCH_HEAD'])
    ).trim()
    return ahead === '0' ? null : 'unpushedCommits'
  } catch {
    // The branch could not be read, e.g. offline: keep the new commits to be safe.
    return 'unpushedCommits'
  }
}

/**
 * Removes the worktree, its local branch and its temporary folder, unless it has
 * uncommitted changes or commits that are not on the head branch. Returns why it was kept.
 */
export async function removePullRequestWorktree(
  worktree: PullRequestWorktree,
): Promise<WorktreeKeptReason | null> {
  // Resolved before the folder may be removed, when it can no longer be.
  const key = await inUseKey(worktree.root)
  try {
    const reason = await workToKeep(worktree)
    if (reason) return reason
    await git(worktree.repositoryRoot, ['worktree', 'remove', '--force', worktree.root])
    if (worktree.createdBranch) {
      await git(worktree.repositoryRoot, ['branch', '-D', worktree.branch]).catch(() => '')
    }
    await rm(worktree.tempDir, { recursive: true, force: true })
    return null
  } catch (error) {
    console.error(`Could not remove the worktree ${worktree.root}`, error)
    return 'removeFailed'
  } finally {
    worktreesInUse.delete(key)
  }
}
