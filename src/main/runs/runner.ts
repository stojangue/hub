/**
 * Runs jobs: starts one Claude Code CLI process per agent, in the order the connections
 * define, and sends every change to the renderer as a `RunEvent`.
 *
 * An agent starts once all agents it depends on are done; strands that do not depend on
 * each other run in parallel. If an agent fails, the agents that depend on it are skipped.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { BrowserWindow } from 'electron'
import type { BlueprintContent, BlueprintNode } from '@shared/blueprints'
import {
  effectiveSource,
  hasUnsupportedParts,
  incoming,
  isNewerFormat,
  repeatConnections,
} from '@shared/blueprints'
import { IpcEvent, type IpcEventContract } from '@shared/ipc'
import {
  blockDefinitions,
  type AgentConfig,
  type SwitchConfig,
  type SwitchOutput,
} from '@shared/blocks'
import type { Job } from '@shared/jobs'
import {
  addLoopRound,
  applyRunEvent,
  createAgentRun,
  createRun,
  planSteps,
  planRun,
  summarizeRun,
  type ActivityKind,
  type AgentRun,
  type AgentRunInput,
  type AgentRunStatus,
  type JobRun,
  type JobRunStatus,
  type RunEvent,
  type RunPlanStep,
  type RunWorktree,
  type StartProblem,
  type StartRunResult,
} from '@shared/runs'
import type { WorkItem } from '@shared/work-items'
import { claudeCommand, claudeEnv, isClaudeInstalled } from '../claude-cli'
import { folderExists } from '../folders'
import {
  getIssueContent,
  findPullRequestForBranch,
  getPullRequestContent,
  type IssueContent,
  type PullRequestContent,
  type ReviewThread,
} from '../github'
import { getJob, listJobs, setLastRun } from '../jobs'
import { parseStreamLine } from './claude-stream'
import { allowedTools, describeDevOpsAccess } from './devops-access'
import {
  createIssueWorktree,
  createPullRequestWorktree,
  findRemote,
  inspectRepository,
  removePullRequestWorktree,
  syncWorktree,
  worktreeGitEnv,
  worktreeHead,
  type PullRequestWorktree,
  type WorktreeSync,
} from './pr-worktree'
import { deleteRun, readRun, writeRun, writeRunSync } from './store'

/** Logs are written at most this often while a run is in progress. */
const SAVE_INTERVAL_MS = 1000
/** How long a stopped process gets to exit before it is killed. */
const KILL_GRACE_MS = 5000
const maxStderrLength = 4000

type WorkItemContent =
  { kind: 'issue'; content: IssueContent } | { kind: 'pullRequest'; content: PullRequestContent }

interface ActiveRun {
  run: JobRun
  job: Job
  processes: Map<string, ChildProcess>
  stopping: boolean
  /** Set once the run is being finished, e.g. while its worktrees are removed. */
  finishing: boolean
  saveTimer: NodeJS.Timeout | null
  /** Content of each work item by its ID, loaded once when the run starts; `null` if that failed. */
  workItemContent: Map<string, WorkItemContent | null>
  /** Repeat connections that start no further rounds. */
  loopsClosed: Set<string>
  /** Worktrees for pull requests, by `worktreeKey`; shared by the agents of the run. */
  worktrees: Map<string, PullRequestWorktree>
}

/** One worktree per linked folder and pull request. */
function worktreeKey(folder: string, item: WorkItem): string {
  return `${folder}\n${item.id}`
}

const active = new Map<string, ActiveRun>()
/** Jobs whose start is being prepared (requirements, work item content) but not yet active. */
const starting = new Set<string>()

// --- Events and saving --------------------------------------------------------------------

function broadcast(message: IpcEventContract[typeof IpcEvent.RunEvent]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcEvent.RunEvent, message)
  }
}

function emit(entry: ActiveRun, event: RunEvent): void {
  entry.run = applyRunEvent(entry.run, event) ?? entry.run
  broadcast({ jobId: entry.job.id, event })
  scheduleSave(entry)
}

function scheduleSave(entry: ActiveRun): void {
  if (entry.saveTimer) return
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null
    writeRun(entry.run).catch((error: unknown) => console.error('Failed to save run', error))
  }, SAVE_INTERVAL_MS)
}

function activity(entry: ActiveRun, kind: ActivityKind, nodeId?: string, message?: string): void {
  emit(entry, {
    type: 'activity',
    runId: entry.run.id,
    item: {
      id: randomUUID(),
      at: new Date().toISOString(),
      kind,
      ...(nodeId ? { nodeId } : {}),
      ...(message ? { message } : {}),
    },
  })
}

function updateAgent(
  entry: ActiveRun,
  stepId: string,
  changes: Partial<Omit<AgentRun, 'stepId' | 'nodeId' | 'round' | 'entries'>>,
): void {
  emit(entry, { type: 'agent', runId: entry.run.id, stepId, changes })
}

// --- Inputs -------------------------------------------------------------------------------

/** The agent's folder, linked to it or to an agent it gets results from. */
function folderOf(content: BlueprintContent, nodeId: string): string | null {
  const source = effectiveSource(content, nodeId, 'folder')
  return source?.type === 'folder' ? source.config.path : null
}

function workItemOf(job: Job, nodeId: string): WorkItem | null {
  const source = effectiveSource(job.blueprint.content, nodeId, 'workItem')
  return source?.type === 'workItem' ? (job.workItems[source.id] ?? null) : null
}

/** Longest issue description or comment passed on, in characters. */
const maxIssueTextLength = 30_000
/** Most recent comments passed on. */
const maxIssueComments = 50

function clip(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > maxIssueTextLength
    ? `${trimmed.slice(0, maxIssueTextLength)}\n\n[… shortened]`
    : trimmed
}

function describeComments(
  heading: string,
  comments: { author: string; createdAt: string; body: string }[],
  total: number,
): string | null {
  const shown = comments.slice(-maxIssueComments)
  if (shown.length === 0) return null
  return [
    `### ${heading} (${total > shown.length ? `last ${shown.length} of ${total}` : shown.length})`,
    ...shown.map(
      (comment) =>
        `**${comment.author}**${comment.createdAt ? ` (${comment.createdAt})` : ''}:\n\n${clip(comment.body)}`,
    ),
  ].join('\n\n')
}

function describeIssue(item: WorkItem, content: IssueContent | null): string {
  const lines = [
    '## Work item',
    `GitHub issue #${item.number} in ${item.repository}: ${item.title}`,
    item.url,
  ]
  if (!content) {
    lines.push(
      'Its content could not be loaded. Use the GitHub CLI (`gh issue view`) to read its description and comments.',
    )
    return lines.join('\n')
  }
  if (content.state) lines.push(`State: ${content.state.toLowerCase()}`)
  if (content.labels.length > 0) lines.push(`Labels: ${content.labels.join(', ')}`)
  const parts = [lines.join('\n'), `### Description\n\n${clip(content.body) || '(empty)'}`]
  const comments = describeComments('Comments', content.comments, content.comments.length)
  if (comments) parts.push(comments)
  return parts.join('\n\n')
}

function threadLocation(thread: ReviewThread): string {
  const line = thread.line ?? thread.originalLine
  if (line === null) return thread.path
  const start = thread.startLine !== null && thread.startLine !== line ? `${thread.startLine}-` : ''
  return `${thread.path}:${start}${line}${thread.side === 'LEFT' ? ' (old version)' : ''}`
}

function describeThread(thread: ReviewThread, index: number): string {
  const marks = [thread.isResolved ? 'resolved' : 'unresolved']
  if (thread.isOutdated) marks.push('outdated: the code changed since')
  const first = thread.comments[0]
  const ids = [`thread ID \`${thread.id}\``]
  if (first?.databaseId) ids.push(`first comment ID \`${first.databaseId}\``)
  return [
    `#### Thread ${index + 1}: ${threadLocation(thread)} (${marks.join(', ')})`,
    `${ids.join(', ')}`,
    ...thread.comments.map(
      (comment) =>
        `**${comment.author}**${comment.createdAt ? ` (${comment.createdAt})` : ''}:\n\n${clip(comment.body)}`,
    ),
  ].join('\n\n')
}

function describePullRequest(item: WorkItem, content: PullRequestContent | null): string {
  const lines = [
    '## Work item',
    `GitHub pull request #${item.number} in ${item.repository}: ${item.title}`,
    item.url,
  ]
  if (!content) {
    lines.push(
      'Its content could not be loaded. Use the GitHub CLI (`gh pr view`, `gh api`) to read its description, comments and review comments.',
    )
    return lines.join('\n')
  }
  lines.push(
    `State: ${content.state.toLowerCase()}${content.isDraft ? ' (draft)' : ''}`,
    `Branch: ${content.headBranch}${content.isCrossRepository && content.headRepository ? ` in ${content.headRepository}` : ''} into ${content.baseBranch}`,
  )
  if (content.labels.length > 0) lines.push(`Labels: ${content.labels.join(', ')}`)
  const parts = [lines.join('\n'), `### Description\n\n${clip(content.body) || '(empty)'}`]

  const conversation = describeComments(
    'Conversation comments',
    content.comments,
    content.totalComments,
  )
  if (conversation) parts.push(conversation)

  const reviews = content.reviews.filter((review) => review.body.trim())
  if (reviews.length > 0) {
    parts.push(
      [
        `### Reviews (${reviews.length})`,
        ...reviews.map(
          (review) =>
            `**${review.author}** ${review.state.toLowerCase().replace(/_/g, ' ')}${review.submittedAt ? ` (${review.submittedAt})` : ''}:\n\n${clip(review.body)}`,
        ),
      ].join('\n\n'),
    )
  }

  // Unresolved threads first: they are what is left to address.
  const threads = [...content.threads].sort((a, b) => Number(a.isResolved) - Number(b.isResolved))
  const unresolved = threads.filter((thread) => !thread.isResolved).length
  if (threads.length > 0) {
    const counts = `${unresolved} unresolved, ${threads.length - unresolved} resolved${content.totalThreads > threads.length ? `; ${content.totalThreads - threads.length} more not shown` : ''}`
    parts.push(
      [
        `### Review comments on lines (${counts})`,
        'Each thread shows its file and line in the pull request, whether it is resolved, and its comments in order.',
        ...threads.map(describeThread),
      ].join('\n\n'),
    )
  } else {
    parts.push('### Review comments on lines\n\nThere are none.')
  }
  return parts.join('\n\n')
}

function describeWorkItem(item: WorkItem, content: WorkItemContent | null): string {
  if (item.kind === 'pullRequest') {
    return describePullRequest(item, content?.kind === 'pullRequest' ? content.content : null)
  }
  return describeIssue(item, content?.kind === 'issue' ? content.content : null)
}

/** How the agent works on the pull request's branch and talks to its reviewers. */
function describePullRequestWork(
  config: AgentConfig,
  item: WorkItem,
  worktree: PullRequestWorktree | null,
  folder: string | null,
): string {
  const lines = ['## Working on the pull request', '']
  if (worktree) {
    lines.push(
      `You work in a git worktree made for this run, checked out at the pull request's branch \`${worktree.headBranch}\` (local branch \`${worktree.branch}\`): ${worktree.path}`,
      `The folder the user works in (${worktree.folder}) is not touched; do not change files there.`,
      'The worktree is removed after the run unless it has uncommitted changes or commits that are not pushed, so commit and push the changes you want to keep.',
    )
    const push = worktree.tracksHead
      ? `\`git push\` (it pushes to \`${worktree.headBranch}\` on \`${worktree.pushTarget}\`)`
      : `\`git push ${worktree.pushTarget} HEAD:${worktree.headBranch}\``
    if (config.permissionMode === 'plan') {
      lines.push('You may only read; do not change files, commit or push.')
    } else if (config.devops !== 'write') {
      lines.push(
        'Commit your changes with `git add` and `git commit`. You may not push: describe what you changed in your answer.',
      )
    } else if (!worktree.canPush) {
      lines.push(
        'The branch is in a fork that does not allow changes by maintainers, so you cannot push to it. Commit your changes with `git add` and `git commit` and describe them in your answer.',
      )
    } else {
      lines.push(
        `Commit your changes with \`git add\` and \`git commit\`, then push them with ${push}. Do not force-push, and do not push to other branches.`,
      )
    }
    if (config.permissionMode !== 'plan') {
      lines.push(
        "Give `git commit` its message with `-m '…'`, without command substitution or heredocs: other commands need an approval no one is there to give.",
      )
    }
  } else if (!folder) {
    lines.push('You have no copy of the code; you can only read and comment on the pull request.')
  }

  if (config.devops === 'write') {
    const [owner, name] = item.repository.split('/')
    lines.push(
      '',
      'To answer the reviewers:',
      `- Reply in a review thread: \`gh api repos/${owner}/${name}/pulls/${item.number}/comments/<first comment ID>/replies -f body='…'\``,
      `- Resolve a thread you addressed, if your instructions ask for it: \`gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread ID>"}) { thread { isResolved } } }'\``,
      `- Comment on the pull request as a whole: \`gh pr comment ${item.number} --repo ${item.repository} --body '…'\``,
      'Push your changes before you reply that something is fixed.',
    )
  }
  return lines.join('\n')
}

/** How the agent works on an issue in a worktree on a branch of its own. */
function describeIssueWork(
  config: AgentConfig,
  item: WorkItem,
  worktree: PullRequestWorktree,
): string {
  const base = worktree.baseBranch ?? 'the default branch'
  const lines = [
    '## Working on the issue',
    '',
    worktree.reused
      ? `You work in a git worktree that an earlier run kept, on the branch \`${worktree.branch}\` for the issue: ${worktree.path}. It may hold work from then, such as uncommitted changes or commits that are not pushed; look at \`git status\` and \`git log\` first and build on it.`
      : `You work in a git worktree made for this run, on the branch \`${worktree.branch}\`${worktree.createdBranch ? `, started from \`${base}\`` : ''}: ${worktree.path}`,
    `The folder the user works in (${worktree.folder}) is not touched; do not change files there. Later agents of this run work in the same worktree.`,
    'The worktree is removed after the run unless it has uncommitted changes or commits that are not pushed, so commit and push the changes you want to keep.',
  ]
  if (config.permissionMode === 'plan') {
    lines.push('You may only read; do not change files, commit or push.')
  } else if (config.devops !== 'write') {
    lines.push(
      'Commit your changes with `git add` and `git commit`. You may not push: describe what you changed in your answer.',
    )
  } else {
    lines.push(
      worktree.tracksHead
        ? `Commit your changes with \`git add\` and \`git commit\`, then push them with \`git push\`. The branch exists on GitHub already, so earlier work on the issue may be there. Do not force-push, and do not push to other branches.`
        : `Commit your changes with \`git add\` and \`git commit\`. Push the branch with \`git push -u ${worktree.pushTarget} ${worktree.branch}\`; after that, \`git push\` is enough. Do not force-push, and do not push to other branches.`,
      `If there is no pull request for the branch yet, open one into \`${base}\` with \`gh pr create --repo ${item.repository} --base ${base} --head ${worktree.branch}\`, and write \`Closes #${item.number}\` in its description. Check first with \`gh pr list --repo ${item.repository} --head ${worktree.branch}\`.`,
    )
  }
  if (config.permissionMode !== 'plan') {
    lines.push(
      "Give `git commit` its message with `-m '…'`, without command substitution or heredocs: other commands need an approval no one is there to give.",
    )
  }
  return lines.join('\n')
}

interface LoopInfo {
  round: number
  maxRounds: number
}

function describeLoop(loop: LoopInfo): string {
  return [
    '## Repeated work',
    '',
    `This part of the job runs again, round after round, up to ${loop.maxRounds} times; this is round ${loop.round}. The results below include those of the round before.`,
    'The results below may describe an older state of the branch; the state of the branch and the review threads in this prompt were read just before you started.',
  ].join('\n')
}

/** What a switch is asked: which of its outputs fits the result it got. */
/**
 * The pull request's review threads as they are right before a switch decides, so it judges
 * from facts rather than only from what the agent before it wrote.
 */
function describeThreadsNow(number: number, content: PullRequestContent | null): string {
  const heading = `## Pull request #${number} now`
  if (!content) return `${heading}\n\nIts review threads could not be loaded.`
  const open = content.threads.filter((thread) => !thread.isResolved)
  const lines = [
    heading,
    '',
    `Loaded just now: ${open.length} unresolved and ${content.threads.length - open.length} resolved review threads${content.totalThreads > content.threads.length ? ` (${content.threads.length} of ${content.totalThreads} loaded)` : ''}.`,
  ]
  for (const thread of open.slice(0, 30)) {
    const last = thread.comments.at(-1)
    const text = (last?.body ?? '').replace(/\s+/g, ' ').trim()
    lines.push(
      `- ${threadLocation(thread)}${thread.isOutdated ? ' (outdated)' : ''}: ${last?.author ?? 'unknown'}: ${text.length > 300 ? `${text.slice(0, 300)}…` : text}`,
    )
  }
  return lines.join('\n')
}

function buildSwitchPrompt(
  config: SwitchConfig,
  input: Omit<AgentRunInput, 'prompt'>,
  threadsNow: string | null,
): string {
  const parts = [
    [
      'You decide how a workflow continues. Read the results below and pick the one output whose condition fits best.',
      'Do not do the work yourself and do not change anything; only decide.',
    ].join(' '),
    [
      '## Outputs',
      '',
      ...config.outputs.map(
        (output) =>
          `- **${output.name}**${output.condition.trim() ? `: ${output.condition.trim()}` : ''}`,
      ),
    ].join('\n'),
  ]
  if (input.workItem) {
    const kind = input.workItem.kind === 'pullRequest' ? 'pull request' : 'issue'
    parts.push(
      `## Work item\n\nGitHub ${kind} #${input.workItem.number} in ${input.workItem.repository}: ${input.workItem.title}\n${input.workItem.url}`,
    )
  }
  parts.push(
    input.previous.length > 0
      ? [
          '## Results to judge',
          ...input.previous.map((previous) => `### ${previous.name}\n\n${previous.result}`),
        ].join('\n\n')
      : '## Results to judge\n\n(none)',
  )
  if (threadsNow) parts.push(threadsNow)
  parts.push(
    config.devops === 'read'
      ? 'The review threads above are current. You may check other facts on GitHub with read-only GitHub CLI commands such as `gh pr view` and `gh pr checks`.'
      : 'Decide from the results above alone; do not use any tools.',
  )
  parts.push(
    `Answer with one or two sentences on why, then end with a line that says exactly \`OUTPUT: <name>\`, using one of: ${config.outputs.map((output) => output.name).join(', ')}.`,
  )
  return parts.join('\n\n')
}

/** The output a switch's answer picks, by the name on its last `OUTPUT:` line. */
function chosenOutput(config: SwitchConfig, answer: string): SwitchOutput | null {
  // Formatting around the name, e.g. `OUTPUT: **Yes**` or `OUTPUT: \`Yes\``, is left out.
  const lines = [...answer.matchAll(/^[\s>*_`]*OUTPUT[\s*_`]*:[\s*_`]*(.+?)[\s*_`.]*$/gim)]
  const name = lines.at(-1)?.[1]?.trim().toLowerCase()
  if (!name) return null
  return config.outputs.find((output) => output.name.trim().toLowerCase() === name) ?? null
}

function buildPrompt(
  config: AgentConfig,
  input: Omit<AgentRunInput, 'prompt'>,
  workItemContent: WorkItemContent | null,
  worktree: PullRequestWorktree | null,
  loop: LoopInfo | null,
  current: string[] = [],
): string {
  const parts: string[] = []
  const task = config.instructions.trim()
  if (task) parts.push(task)
  else if (input.workItem) parts.push('Work on the work item below.')
  else parts.push('Continue the work based on the results below.')

  if (input.workItem) parts.push(describeWorkItem(input.workItem, workItemContent))
  if (input.workItem?.kind === 'pullRequest') {
    parts.push(describePullRequestWork(config, input.workItem, worktree, input.folder))
  } else if (input.workItem && worktree?.kind === 'issue') {
    parts.push(describeIssueWork(config, input.workItem, worktree))
  }
  parts.push(...current)
  if (input.previous.length > 0) {
    parts.push(
      [
        '## Results of earlier agents',
        ...input.previous.map((previous) => `### ${previous.name}\n\n${previous.result}`),
      ].join('\n\n'),
    )
  }
  if (loop) parts.push(describeLoop(loop))
  parts.push(describeDevOpsAccess(config, worktree))
  parts.push(describeCommands())
  return parts.join('\n\n')
}

/**
 * Claude Code checks each part of a combined shell command on its own, and refuses a part no
 * rule allows, e.g. `git fetch origin main 2>&1` or `| python3`, with no one there to approve.
 */
function describeCommands(): string {
  return [
    '## Running commands',
    '',
    'Run each `git` and `gh` command in a Bash call of its own, exactly in the forms allowed above: do not chain it with `;`, `&&` or `||`, do not add redirections such as `2>&1` or `>/dev/null`, and do not pipe its output into other programs such as `python3`, `node` or `jq`. For `gh` output, use its own `--jq` option instead. Combined commands are refused, because no one is there to approve them.',
  ].join('\n')
}

/** Tells the agent where its branch stands, as `syncWorktree` left it. */
function describeSync(worktree: PullRequestWorktree, sync: WorktreeSync): string {
  const remote = `\`${worktree.remote}/${worktree.headBranch}\``
  const base = worktree.baseBranch
    ? ` \`${worktree.remote}/${worktree.baseBranch}\` is fetched too, so you can compare with it without fetching.`
    : ''
  const intro = `## State of the branch\n\nJust before you started, the app checked out \`${worktree.branch}\` and fetched ${remote}.${base}`
  const text = (() => {
    switch (sync.state) {
      case 'current':
        return `The branch is up to date with ${remote} (at ${short(sync.head)}). You do not need to fetch or pull.`
      case 'updated':
        return `It was behind and has been moved forward by ${sync.commits} commit(s) to ${short(sync.head)}, so it now matches ${remote}. You do not need to fetch or pull.`
      case 'rebased':
        return `GitHub had ${sync.behind} new commit(s); the ${sync.ahead} local commit(s) that were not pushed yet have been put on top of them (now at ${short(sync.head)}). Push them as described above.`
      case 'ahead':
        return `The branch has ${sync.ahead} commit(s) that are not on GitHub yet (at ${short(sync.head)}); GitHub has nothing newer. Push them as described above if they belong to your work.`
      case 'behind':
        return sync.reason === 'uncommittedChanges'
          ? `GitHub has ${sync.behind} newer commit(s), but the worktree has uncommitted changes, so it was not updated. Look at \`git status\` first; a push will be refused until the branch contains the newer commits.`
          : `GitHub has ${sync.behind} newer commit(s) that conflict with the ${sync.ahead} local commit(s), so the branch was left as it is. Do not force-push; say in your answer that the branch needs to be brought up to date by hand.`
      case 'notOnRemote':
        return `The branch is not on GitHub yet (at ${short(sync.head)}).`
      case 'busy':
        return `Another agent works in this worktree right now, so it was not updated; it is at ${short(sync.head)}.`
      case 'failed':
        return `This failed (${sync.message}), so the branch may not be up to date; mention it in your answer if it matters.`
    }
  })()
  return `${intro}\n\n${text}`
}

function short(commit: string): string {
  return commit.slice(0, 9)
}

// --- Start checks -------------------------------------------------------------------------

async function checkRequirements(job: Job): Promise<StartProblem[]> {
  const problems: StartProblem[] = []
  if (active.has(job.id)) return [{ code: 'alreadyRunning' }]

  // Parts this version does not understand might change what the job does, so it does not
  // run them in part.
  if (isNewerFormat(job.formatVersion)) return [{ code: 'newerFormat' }]
  const content = job.blueprint.content
  if (hasUnsupportedParts(content)) {
    problems.push({
      code: 'unsupportedParts',
      nodes: content.unsupported.nodes.length,
      connections: content.unsupported.connections.length,
    })
  }
  const agents = content.nodes.filter((node) => node.type === 'agent')
  if (agents.length === 0) problems.push({ code: 'noAgents' })
  else if (!(await isClaudeInstalled())) problems.push({ code: 'cliMissing' })
  for (const node of content.nodes) {
    if (node.type === 'switch' && incoming(content, node.id, 'result').length === 0) {
      problems.push({ code: 'switchWithoutInput', nodeId: node.id })
    }
  }

  for (const node of content.nodes) {
    if (node.type === 'folder') {
      const used = content.connections.some((connection) => connection.from.nodeId === node.id)
      if (!used) continue
      if (!node.config.path) problems.push({ code: 'folderNotSet', nodeId: node.id })
      else if (!(await folderExists(node.config.path))) {
        problems.push({ code: 'folderMissing', nodeId: node.id, path: node.config.path })
      }
    } else if (node.type === 'workItem' && !job.workItems[node.id]) {
      problems.push({ code: 'workItemMissing', nodeId: node.id })
    }
  }

  // Agents work on an issue or pull request in a worktree of their folder's repository.
  const checked = new Set<string>()
  for (const agent of agents) {
    const folderNode = effectiveSource(content, agent.id, 'folder')
    const item = workItemOf(job, agent.id)
    if (folderNode?.type !== 'folder' || !folderNode.config.path) continue
    if (!item || checked.has(folderNode.id)) continue
    // Only a worktree needs a git repository; issues can be worked on in the folder itself.
    if (item.kind === 'issue' && folderNode.config.workMode === 'direct') continue
    checked.add(folderNode.id)
    const path = folderNode.config.path
    if (!(await folderExists(path))) continue
    const info = await inspectRepository(path)
    if (!info) {
      problems.push({ code: 'folderNotGitRepository', nodeId: folderNode.id, path })
    } else if (!(await findRemote(info.root, item.repository))) {
      problems.push({
        code: 'folderWrongRepository',
        nodeId: folderNode.id,
        repository: item.repository,
      })
    }
  }

  for (const agent of agents) {
    if (agent.type !== 'agent') continue
    const hasTask =
      agent.config.instructions.trim() !== '' ||
      effectiveSource(content, agent.id, 'workItem') !== undefined ||
      incoming(content, agent.id, 'result').length > 0
    if (!hasTask) problems.push({ code: 'agentWithoutTask', nodeId: agent.id })
  }
  return problems
}

// --- Running ------------------------------------------------------------------------------

export async function startJob(jobId: unknown): Promise<StartRunResult> {
  if (typeof jobId !== 'string' || starting.has(jobId)) {
    return { ok: false, problems: [{ code: 'alreadyRunning' }] }
  }
  // Marked while preparing, so the job cannot be deleted before it becomes active.
  starting.add(jobId)
  try {
    return await prepareAndStart(jobId)
  } finally {
    starting.delete(jobId)
  }
}

async function prepareAndStart(jobId: string): Promise<StartRunResult> {
  const job = await getJob(jobId)
  if (!job) throw new Error('The job does not exist.')
  const problems = await checkRequirements(job)
  if (problems.length > 0) return { ok: false, problems }

  // Agents get the work items' content in their prompt, so they need not look it up.
  const workItemContent = new Map<string, WorkItemContent | null>()
  await Promise.all(
    Object.values(job.workItems).map(async (item) => {
      if (workItemContent.has(item.id)) return
      workItemContent.set(item.id, null)
      try {
        workItemContent.set(
          item.id,
          item.kind === 'pullRequest'
            ? {
                kind: 'pullRequest',
                content: await getPullRequestContent(item.repository, item.number),
              }
            : { kind: 'issue', content: await getIssueContent(item.repository, item.number) },
        )
      } catch (error) {
        console.error(`Could not load ${item.id} for job ${job.id}`, error)
      }
    }),
  )

  // Checked again: another start may have begun while the requirements were checked.
  if (active.has(job.id)) return { ok: false, problems: [{ code: 'alreadyRunning' }] }

  const worktrees = await createWorktrees(job, workItemContent)
  if (!worktrees.ok) return { ok: false, problems: worktrees.problems }

  const now = new Date().toISOString()
  const run = createRun(
    randomUUID(),
    job.id,
    planRun(job.blueprint.content),
    job.blueprint.content.nodes,
    now,
  )
  const entry: ActiveRun = {
    run,
    job,
    processes: new Map(),
    stopping: false,
    finishing: false,
    loopsClosed: new Set(),
    saveTimer: null,
    workItemContent,
    worktrees: worktrees.worktrees,
  }
  active.set(job.id, entry)
  emit(entry, { type: 'started', run })
  for (const worktree of worktrees.worktrees.values()) {
    emit(entry, { type: 'worktree', runId: run.id, worktree: toRunWorktree(worktree, 'active') })
  }
  activity(entry, 'runStarted')
  await setLastRun(job.id, summarizeRun(entry.run))
  schedule(entry)
  return { ok: true }
}

function toRunWorktree(
  worktree: PullRequestWorktree,
  status: RunWorktree['status'],
  keptReason: RunWorktree['keptReason'] = null,
): RunWorktree {
  return {
    folder: worktree.folder,
    path: worktree.path,
    branch: worktree.branch,
    headBranch: worktree.headBranch,
    pullRequest: worktree.pullRequest,
    status,
    keptReason,
  }
}

/**
 * The issue worktree made in this start for another folder of the same repository, as seen
 * from `folder`, or `null` if there is none.
 */
async function sharedIssueWorktree(
  worktrees: Map<string, PullRequestWorktree>,
  folder: string,
  item: WorkItem,
): Promise<PullRequestWorktree | null> {
  const candidates = [...worktrees.values()].filter(
    (worktree) => worktree.kind === 'issue' && worktree.pullRequest === item.number,
  )
  if (candidates.length === 0) return null
  const info = await inspectRepository(folder)
  const other = info && candidates.find((worktree) => worktree.repositoryRoot === info.root)
  if (!info || !other) return null
  return {
    ...other,
    folder,
    path: info.prefix ? join(other.root, info.prefix.replace(/\/$/, '')) : other.root,
  }
}

/** The worktrees in `worktrees`, each once, though several folders may share one. */
function distinctWorktrees(worktrees: Map<string, PullRequestWorktree>): PullRequestWorktree[] {
  const byRoot = new Map<string, PullRequestWorktree>()
  for (const worktree of worktrees.values()) {
    if (!byRoot.has(worktree.root)) byRoot.set(worktree.root, worktree)
  }
  return [...byRoot.values()]
}

/**
 * Makes a worktree of each folder that agents use for a pull request. If one fails, the
 * others are removed again and the job does not start.
 */
async function createWorktrees(
  job: Job,
  workItemContent: Map<string, WorkItemContent | null>,
): Promise<
  | { ok: true; worktrees: Map<string, PullRequestWorktree> }
  | { ok: false; problems: StartProblem[] }
> {
  const content = job.blueprint.content
  const worktrees = new Map<string, PullRequestWorktree>()
  for (const agent of content.nodes) {
    if (agent.type !== 'agent') continue
    const folderNode = effectiveSource(content, agent.id, 'folder')
    const item = workItemOf(job, agent.id)
    if (folderNode?.type !== 'folder' || !folderNode.config.path || !item) continue
    const path = folderNode.config.path
    const key = worktreeKey(path, item)
    if (worktrees.has(key)) continue
    const loaded = workItemContent.get(item.id)
    try {
      if (item.kind === 'issue') {
        if (folderNode.config.workMode === 'direct') continue
        // The issue's branch can be checked out only once, so folders in the same repository,
        // e.g. subfolders of a monorepo, share one worktree, each with its own path in it.
        const shared = await sharedIssueWorktree(worktrees, path, item)
        worktrees.set(
          key,
          shared ?? (await createIssueWorktree(path, item.repository, item.number, item.title)),
        )
        continue
      }
      if (loaded?.kind !== 'pullRequest') {
        throw new Error(`Could not load pull request #${item.number} from GitHub.`)
      }
      worktrees.set(
        key,
        await createPullRequestWorktree(
          folderNode.config.path,
          item.repository,
          item.number,
          loaded.content,
        ),
      )
    } catch (error) {
      await Promise.all(distinctWorktrees(worktrees).map(removePullRequestWorktree))
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, problems: [{ code: 'worktreeFailed', nodeId: folderNode.id, message }] }
    }
  }
  return { ok: true, worktrees }
}

/** Statuses of a step that has finished without failing. */
const finishedStatuses: readonly AgentRunStatus[] = ['done', 'notTaken']
const terminalStatuses: readonly AgentRunStatus[] = [
  'done',
  'notTaken',
  'failed',
  'skipped',
  'stopped',
]

/** Whether a dependency passes its result on to the step: it ran, and a switch picked this way. */
function delivers(entry: ActiveRun, step: RunPlanStep, dep: string): boolean {
  const agent = entry.run.agents[dep]
  if (agent?.status !== 'done') return false
  return agent.chosenOutput === null || (step.via[dep] ?? []).includes(agent.chosenOutput)
}

/**
 * Starts the next round of every repeat whose source finished its round and passed its
 * result back, up to the repeat's most rounds. Otherwise the repeat is closed.
 */
function advanceLoops(entry: ActiveRun): boolean {
  let changed = false
  const content = entry.job.blueprint.content
  for (const repeat of repeatConnections(content)) {
    if (entry.loopsClosed.has(repeat.id)) continue
    const steps = planSteps(entry.run.plan).filter((step) => step.loopId === repeat.id)
    if (steps.length === 0) {
      entry.loopsClosed.add(repeat.id)
      changed = true
      continue
    }
    const round = Math.max(...steps.map((step) => step.round))
    const source = steps.find((step) => step.round === round && step.nodeId === repeat.from.nodeId)
    const status = source ? entry.run.agents[source.id]?.status : undefined
    if (!source || !status || !terminalStatuses.includes(status)) continue
    const agent = entry.run.agents[source.id]
    const back =
      status === 'done' &&
      (agent?.chosenOutput === null || agent?.chosenOutput === repeat.from.port)
    if (!back || round >= (repeat.repeat?.maxRounds ?? 1)) {
      entry.loopsClosed.add(repeat.id)
      changed = true
      continue
    }
    const next = addLoopRound(entry.run.plan, content, repeat.id, round + 1)
    emit(entry, {
      type: 'plan',
      runId: entry.run.id,
      plan: next.plan,
      agents: next.added.map((step) => createAgentRun(step, content.nodes)),
    })
    changed = true
  }
  return changed
}

/** Starts every waiting agent whose dependencies are done, and finishes the run when idle. */
function schedule(entry: ActiveRun): void {
  if (entry.stopping) return
  let steps = planSteps(entry.run.plan)
  let loopOfStep = new Map(steps.map((step) => [step.id, step.loopId]))

  // A step after repeated work waits until no further round follows.
  const waitsForLoop = (step: RunPlanStep) =>
    step.dependsOn.some((dep) => {
      const loop = loopOfStep.get(dep)
      return loop && loop !== step.loopId && !entry.loopsClosed.has(loop)
    })

  // Skipping or leaving out one step can affect the ones after it, and close or extend a
  // repeat, which affects others again; so repeat until nothing changes.
  let changed = true
  while (changed) {
    changed = advanceLoops(entry)
    steps = planSteps(entry.run.plan)
    loopOfStep = new Map(steps.map((step) => [step.id, step.loopId]))
    for (const step of steps) {
      if (entry.run.agents[step.id]?.status !== 'waiting') continue
      const blocked = step.dependsOn.some((dep) =>
        ['failed', 'skipped', 'stopped'].includes(entry.run.agents[dep]?.status ?? ''),
      )
      if (blocked) {
        updateAgent(entry, step.id, { status: 'skipped' })
        activity(entry, 'agentSkipped', step.id)
        changed = true
        continue
      }
      const finished = step.dependsOn.every((dep) =>
        finishedStatuses.includes(entry.run.agents[dep]?.status ?? 'waiting'),
      )
      if (
        finished &&
        step.dependsOn.length > 0 &&
        !waitsForLoop(step) &&
        !step.dependsOn.some((dep) => delivers(entry, step, dep))
      ) {
        updateAgent(entry, step.id, { status: 'notTaken' })
        changed = true
      }
    }
  }

  for (const step of steps) {
    if (entry.run.agents[step.id]?.status !== 'waiting' || waitsForLoop(step)) continue
    const ready = step.dependsOn.every((dep) =>
      finishedStatuses.includes(entry.run.agents[dep]?.status ?? 'waiting'),
    )
    if (ready) startAgent(entry, step)
  }

  const busy = Object.values(entry.run.agents).some(
    (agent) => agent.status === 'waiting' || agent.status === 'running',
  )
  if (!busy) {
    const failed = Object.values(entry.run.agents).some(
      (agent) => agent.status === 'failed' || agent.status === 'skipped',
    )
    void finish(entry, failed ? 'failed' : 'done')
  }
}

/**
 * The results a step gets from the steps it depends on. A switch only decides the way, so
 * the results it got are passed on in its place.
 */
function previousResults(entry: ActiveRun, step: RunPlanStep): AgentRunInput['previous'] {
  const steps = new Map(planSteps(entry.run.plan).map((other) => [other.id, other]))
  const nodes = entry.job.blueprint.content.nodes
  const seen = new Set<string>()
  const collect = (from: RunPlanStep): AgentRunInput['previous'] =>
    from.dependsOn.flatMap((id) => {
      if (seen.has(id) || !delivers(entry, from, id)) return []
      seen.add(id)
      const agent = entry.run.agents[id]
      const dep = steps.get(id)
      if (!agent || !dep) return []
      if (nodes.find((node) => node.id === dep.nodeId)?.type === 'switch') return collect(dep)
      const round = agent.round > 1 ? ` (round ${agent.round})` : ''
      return [{ nodeId: id, name: `${agent.name}${round}`, result: agent.result ?? '' }]
    })
  return collect(step)
}

function loopInfo(entry: ActiveRun, step: RunPlanStep): LoopInfo | null {
  if (!step.loopId) return null
  const repeat = repeatConnections(entry.job.blueprint.content).find(
    (connection) => connection.id === step.loopId,
  )
  return repeat?.repeat ? { round: step.round, maxRounds: repeat.repeat.maxRounds } : null
}

/** The pull request a step is about: the work item, or the one for the issue's branch. */
async function pullRequestOf(entry: ActiveRun, nodeId: string): Promise<number | null> {
  const item = workItemOf(entry.job, nodeId)
  if (!item) return null
  if (item.kind === 'pullRequest') return item.number
  const folder = folderOf(entry.job.blueprint.content, nodeId)
  const worktree = folder ? entry.worktrees.get(worktreeKey(folder, item)) : undefined
  if (!worktree) return null
  return findPullRequestForBranch(item.repository, worktree.headBranch)
}

async function startSwitch(
  entry: ActiveRun,
  step: RunPlanStep,
  node: Extract<BlueprintNode, { type: 'switch' }>,
): Promise<void> {
  // Shown as running while the pull request is loaded.
  updateAgent(entry, step.id, { status: 'running', startedAt: new Date().toISOString() })
  activity(entry, 'agentStarted', step.id)
  const workItem = workItemOf(entry.job, node.id)
  let threadsNow: string | null = null
  try {
    const number = await pullRequestOf(entry, node.id)
    if (number !== null && workItem) {
      const content = await getPullRequestContent(workItem.repository, number).catch(() => null)
      threadsNow = describeThreadsNow(number, content)
    }
  } catch (error) {
    console.error(`Could not load the pull request for switch ${node.id}`, error)
  }
  // The run may have been stopped meanwhile; then no process is started.
  if (entry.stopping || active.get(entry.job.id) !== entry) {
    agentFinished(entry, step, { stopped: true })
    return
  }
  const base = { folder: null, worktree: null, workItem, previous: previousResults(entry, step) }
  const input: AgentRunInput = {
    ...base,
    prompt: buildSwitchPrompt(node.config, base, threadsNow),
  }
  updateAgent(entry, step.id, { input })
  // It only reads, so it gets an agent's settings for reading, with its own model.
  const config: AgentConfig = {
    ...blockDefinitions.agent.defaultConfig(),
    model: node.config.model,
    permissionMode: 'plan',
    devops: node.config.devops,
  }
  runProcess(entry, step, config, input, null)
}

function startAgent(entry: ActiveRun, step: RunPlanStep): void {
  const content = entry.job.blueprint.content
  const node = content.nodes.find((candidate) => candidate.id === step.nodeId)
  if (node?.type === 'switch') {
    void startSwitch(entry, step, node)
    return
  }
  if (node?.type !== 'agent') {
    updateAgent(entry, step.id, { status: 'failed', error: 'Not an agent.' })
    return
  }
  void startAgentNode(entry, step, node)
}

/** Syncs of a worktree in progress, by its root, so agents starting together share one. */
const syncs = new Map<string, Promise<WorktreeSync>>()

/**
 * Brings the worktree up to date unless another agent of the run works in it right now,
 * which would see its files change under it.
 */
async function syncForStep(
  entry: ActiveRun,
  step: RunPlanStep,
  worktree: PullRequestWorktree,
): Promise<WorktreeSync> {
  const pending = syncs.get(worktree.root)
  if (pending) return pending
  const busy = Object.values(entry.run.agents).some(
    (agent) =>
      agent.stepId !== step.id &&
      agent.status === 'running' &&
      agent.input?.worktree?.startsWith(worktree.root) === true,
  )
  if (busy) {
    return { state: 'busy', head: await worktreeHead(worktree) }
  }
  const sync = syncWorktree(worktree).finally(() => syncs.delete(worktree.root))
  syncs.set(worktree.root, sync)
  return sync
}

/**
 * Starts an agent once its worktree is up to date with GitHub, and with the pull request and
 * its review threads loaded again, so each round of a loop works on what is there now.
 */
async function startAgentNode(
  entry: ActiveRun,
  step: RunPlanStep,
  node: Extract<BlueprintNode, { type: 'agent' }>,
): Promise<void> {
  // Shown as running while the branch is brought up to date.
  updateAgent(entry, step.id, { status: 'running', startedAt: new Date().toISOString() })
  activity(entry, 'agentStarted', step.id)

  const content = entry.job.blueprint.content
  const folder = folderOf(content, node.id)
  const workItem = workItemOf(entry.job, node.id)
  const worktree =
    folder && workItem ? (entry.worktrees.get(worktreeKey(folder, workItem)) ?? null) : null
  const current: string[] = []
  try {
    if (worktree) current.push(describeSync(worktree, await syncForStep(entry, step, worktree)))
    // Loaded at the start already; later agents get what is there now.
    if (workItem?.kind === 'pullRequest' && step.dependsOn.length > 0) {
      const fresh = await getPullRequestContent(workItem.repository, workItem.number).catch(
        () => null,
      )
      if (fresh) entry.workItemContent.set(workItem.id, { kind: 'pullRequest', content: fresh })
    } else if (workItem?.kind === 'issue' && worktree) {
      const number = await findPullRequestForBranch(workItem.repository, worktree.headBranch)
      if (number !== null) {
        const pr = await getPullRequestContent(workItem.repository, number).catch(() => null)
        current.push(describeThreadsNow(number, pr))
      }
    }
  } catch (error) {
    console.error(`Could not prepare agent ${step.id}`, error)
  }
  // The run may have been stopped meanwhile; then no process is started.
  if (entry.stopping || active.get(entry.job.id) !== entry) {
    agentFinished(entry, step, { stopped: true })
    return
  }

  // Another agent may have begun syncing the worktree meanwhile; its files settle first.
  if (worktree) await syncs.get(worktree.root)?.catch(() => null)

  const base = {
    folder,
    worktree: worktree?.path ?? null,
    workItem,
    previous: previousResults(entry, step),
  }
  const loaded = workItem ? (entry.workItemContent.get(workItem.id) ?? null) : null
  const input: AgentRunInput = {
    ...base,
    prompt: buildPrompt(node.config, base, loaded, worktree, loopInfo(entry, step), current),
  }
  updateAgent(entry, step.id, { input })
  runProcess(entry, step, node.config, input, worktree)
}

function runProcess(
  entry: ActiveRun,
  step: RunPlanStep,
  config: AgentConfig,
  input: AgentRunInput,
  worktree: PullRequestWorktree | null,
): void {
  // Without a linked folder the agent works in an empty folder of its own, removed when it
  // ends, and gets only tools that need no approval: its permissions apply to a folder.
  let scratch: string | null = null
  if (!input.folder) {
    try {
      scratch = mkdtempSync(join(tmpdir(), 'hub-agent-'))
    } catch (error) {
      agentFinished(entry, step, { failed: String(error) })
      return
    }
  }
  const removeScratch = () => {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    scratch = null
  }

  // `default` leaves the model and effort to Claude Code's own settings.
  const { model, effort } = config
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    input.folder ? config.permissionMode : 'default',
    ...(model === 'default' ? [] : ['--model', model]),
    ...(effort === 'default' ? [] : ['--effort', effort]),
  ]
  // In a worktree of its own, the agent commits its changes and pushes its branch without
  // asking.
  const tools = allowedTools(config, worktree)
  // Last, since the option takes a list; the prompt is passed on stdin.
  if (tools.length > 0) args.push('--allowedTools', tools.join(','))
  let child: ChildProcess
  try {
    child = spawn(claudeCommand, args, {
      cwd: input.worktree ?? input.folder ?? scratch ?? undefined,
      env: input.worktree ? { ...claudeEnv(), ...worktreeGitEnv() } : claudeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      // Its own process group, so stopping also ends the commands it started.
      detached: process.platform !== 'win32',
      windowsHide: true,
    })
  } catch (error) {
    removeScratch()
    agentFinished(entry, step, { failed: String(error) })
    return
  }
  entry.processes.set(step.id, child)

  let result: { text: string; isError: boolean; costUsd: number | null } | null = null
  let stderr = ''
  let spawnError: string | null = null

  child.stdin?.on('error', () => undefined)
  child.stdin?.end(input.prompt)
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-maxStderrLength)
  })

  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', (line) => {
      for (const update of parseStreamLine(line)) {
        if (update.kind === 'entry') {
          emit(entry, { type: 'entry', runId: entry.run.id, stepId: step.id, entry: update.entry })
        } else if (update.kind === 'toolResult') {
          const tool = entry.run.agents[step.id]?.entries.find(
            (candidate) => candidate.id === update.toolUseId,
          )
          if (tool?.kind !== 'tool') continue
          emit(entry, {
            type: 'entry',
            runId: entry.run.id,
            stepId: step.id,
            entry: { ...tool, output: update.output, ...(update.isError ? { isError: true } : {}) },
          })
        } else {
          result = update
        }
      }
    })
  }

  child.on('error', (error) => {
    spawnError = error.message
  })
  child.on('close', (code) => {
    entry.processes.delete(step.id)
    removeScratch()
    const final = result as typeof result
    if (entry.stopping) {
      agentFinished(entry, step, { stopped: true })
    } else if (final && !final.isError) {
      agentFinished(entry, step, { result: final.text, costUsd: final.costUsd })
    } else {
      const message = (
        final?.text ||
        spawnError ||
        stderr.trim() ||
        `Claude Code exited with code ${code}.`
      ).trim()
      agentFinished(entry, step, { failed: message, costUsd: final?.costUsd ?? null })
    }
  })
}

function agentFinished(
  entry: ActiveRun,
  step: RunPlanStep,
  outcome:
    | { result: string; costUsd: number | null }
    | { failed: string; costUsd?: number | null }
    | { stopped: true },
): void {
  const finishedAt = new Date().toISOString()
  const id = step.id
  if ('stopped' in outcome) {
    updateAgent(entry, id, { status: 'stopped', finishedAt })
  } else if ('failed' in outcome) {
    emit(entry, {
      type: 'entry',
      runId: entry.run.id,
      stepId: id,
      entry: { id: randomUUID(), at: finishedAt, kind: 'error', text: outcome.failed },
    })
    updateAgent(entry, id, {
      status: 'failed',
      finishedAt,
      error: outcome.failed,
      costUsd: outcome.costUsd ?? null,
    })
    activity(entry, 'agentFailed', id, outcome.failed)
  } else {
    // A switch must name one of its outputs; otherwise there is no way to go on.
    const node = entry.job.blueprint.content.nodes.find((other) => other.id === step.nodeId)
    const output = node?.type === 'switch' ? chosenOutput(node.config, outcome.result) : null
    if (node?.type === 'switch' && !output) {
      const message = `The switch did not pick one of its outputs (${node.config.outputs.map((option) => option.name).join(', ')}).`
      agentFinished(entry, step, { failed: message, costUsd: outcome.costUsd })
      return
    }
    updateAgent(entry, id, {
      status: 'done',
      finishedAt,
      result: outcome.result,
      chosenOutput: output?.id ?? null,
      costUsd: outcome.costUsd,
    })
    activity(entry, 'agentDone', id)
  }

  if (entry.stopping) {
    if (entry.processes.size === 0) void finish(entry, 'stopped')
  } else {
    schedule(entry)
  }
}

/** Removes the run's worktrees, or keeps those with work that would be lost, and says which. */
async function removeWorktrees(entry: ActiveRun): Promise<void> {
  const all = [...entry.worktrees.values()]
  await Promise.all(
    distinctWorktrees(entry.worktrees).map(async (worktree) => {
      const reason = await removePullRequestWorktree(worktree)
      // Every folder that shared the worktree shows what happened to it.
      for (const shown of all.filter((other) => other.root === worktree.root)) {
        emit(entry, {
          type: 'worktree',
          runId: entry.run.id,
          worktree: toRunWorktree(shown, reason ? 'kept' : 'removed', reason),
        })
      }
    }),
  )
  entry.worktrees.clear()
}

async function finish(entry: ActiveRun, status: JobRunStatus): Promise<void> {
  if (active.get(entry.job.id) !== entry || entry.finishing) return
  entry.finishing = true
  // Still active meanwhile, so the job cannot start again or be deleted.
  await removeWorktrees(entry)
  active.delete(entry.job.id)
  activity(entry, status === 'done' ? 'runDone' : status === 'failed' ? 'runFailed' : 'runStopped')
  emit(entry, {
    type: 'finished',
    runId: entry.run.id,
    status,
    finishedAt: new Date().toISOString(),
  })
  if (entry.saveTimer) clearTimeout(entry.saveTimer)
  entry.saveTimer = null
  try {
    await writeRun(entry.run)
    await setLastRun(entry.job.id, summarizeRun(entry.run))
  } catch (error) {
    console.error('Failed to save run', error)
  }
}

function killProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    // Already gone.
  }
}

export async function stopJob(jobId: unknown): Promise<void> {
  const entry = typeof jobId === 'string' ? active.get(jobId) : undefined
  if (!entry || entry.stopping) return
  entry.stopping = true
  for (const agent of Object.values(entry.run.agents)) {
    if (agent.status === 'waiting') updateAgent(entry, agent.stepId, { status: 'stopped' })
  }
  if (entry.processes.size === 0) {
    await finish(entry, 'stopped')
    return
  }
  for (const child of entry.processes.values()) {
    killProcess(child, 'SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) killProcess(child, 'SIGKILL')
    }, KILL_GRACE_MS).unref()
  }
}

export async function getRun(jobId: unknown): Promise<JobRun | null> {
  if (typeof jobId !== 'string') return null
  return active.get(jobId)?.run ?? readRun(jobId)
}

/** Whether the job is starting or running, including while it is being stopped. */
export function isJobActive(jobId: string): boolean {
  return starting.has(jobId) || active.has(jobId)
}

/** Deletes the stored run. A job that is still active must be stopped first. */
export async function deleteJobRun(jobId: string): Promise<void> {
  if (isJobActive(jobId)) throw new Error('The job is still running. Stop it first.')
  await deleteRun(jobId)
}

/** Marks a run as stopped and closes its open agents. */
function interrupt(run: JobRun, at: string): JobRun {
  const agents = Object.fromEntries(
    Object.entries(run.agents).map(([id, agent]) => [
      id,
      agent.status === 'running' || agent.status === 'waiting'
        ? { ...agent, status: 'stopped' as const, finishedAt: agent.startedAt ? at : null }
        : agent,
    ]),
  )
  return {
    ...run,
    status: 'stopped',
    finishedAt: at,
    agents,
    worktrees: run.worktrees.map((worktree) =>
      worktree.status === 'active'
        ? { ...worktree, status: 'kept' as const, keptReason: 'interrupted' as const }
        : worktree,
    ),
    activity: [...run.activity, { id: randomUUID(), at, kind: 'runStopped' }],
  }
}

/** Runs that were in progress when the app quit are marked as stopped. */
export async function recoverInterruptedRuns(): Promise<void> {
  for (const job of await listJobs()) {
    if (job.lastRun?.status !== 'running' || active.has(job.id)) continue
    // Its job and run files belong to a newer version, which recovers them itself.
    if (isNewerFormat(job.formatVersion)) continue
    const at = new Date().toISOString()
    const stored = await readRun(job.id)
    const run = stored ? interrupt(stored, at) : null
    if (run) await writeRun(run)
    await setLastRun(
      job.id,
      run ? summarizeRun(run) : { ...job.lastRun, status: 'stopped', finishedAt: at },
    )
  }
}

/** Ends all agent processes and saves their logs right away, e.g. when the app quits. */
export function stopAllRunsSync(): void {
  for (const entry of active.values()) {
    entry.stopping = true
    for (const child of entry.processes.values()) killProcess(child, 'SIGTERM')
    // There is no time to check them for unsaved work, so the worktrees stay.
    entry.run = {
      ...entry.run,
      worktrees: entry.run.worktrees.map((worktree) =>
        worktree.status === 'active'
          ? { ...worktree, status: 'kept', keptReason: 'interrupted' }
          : worktree,
      ),
    }
    try {
      writeRunSync(entry.run)
    } catch (error) {
      console.error('Failed to save run', error)
    }
  }
}
