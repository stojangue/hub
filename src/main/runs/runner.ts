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
import { incoming, sourceOf } from '@shared/blueprints'
import { IpcEvent, type IpcEventContract } from '@shared/ipc'
import type { AgentConfig } from '@shared/blocks'
import type { Job } from '@shared/jobs'
import {
  applyRunEvent,
  createRun,
  planRun,
  summarizeRun,
  type ActivityKind,
  type AgentRun,
  type AgentRunInput,
  type JobRun,
  type JobRunStatus,
  type RunEvent,
  type StartProblem,
  type StartRunResult,
} from '@shared/runs'
import type { WorkItem } from '@shared/work-items'
import { claudeCommand, claudeEnv, isClaudeInstalled } from '../claude-cli'
import { folderExists } from '../folders'
import { getIssueContent, type IssueContent } from '../github'
import { getJob, listJobs, setLastRun } from '../jobs'
import { parseStreamLine } from './claude-stream'
import { deleteRun, readRun, writeRun, writeRunSync } from './store'

/** Logs are written at most this often while a run is in progress. */
const SAVE_INTERVAL_MS = 1000
/** How long a stopped process gets to exit before it is killed. */
const KILL_GRACE_MS = 5000
/** Extra time a deleted job's run gets to end after its processes were killed. */
const DELETE_WAIT_EXTRA_MS = 2000
const maxStderrLength = 4000

interface ActiveRun {
  run: JobRun
  job: Job
  processes: Map<string, ChildProcess>
  stopping: boolean
  saveTimer: NodeJS.Timeout | null
  /** Set when the job is deleted while the run is still ending; nothing is saved afterwards. */
  deleted: boolean
  /** Resolves once `finish` has saved the run and removed it from `active`. */
  finished: Promise<void>
  resolveFinished: () => void
  /** Content of each work item by its ID, loaded once when the run starts; `null` if that failed. */
  workItemContent: Map<string, IssueContent | null>
}

const active = new Map<string, ActiveRun>()

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
    if (entry.deleted) return
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

function updateAgent(entry: ActiveRun, nodeId: string, changes: Partial<AgentRun>): void {
  emit(entry, { type: 'agent', runId: entry.run.id, nodeId, changes })
}

// --- Inputs -------------------------------------------------------------------------------

function folderOf(content: BlueprintContent, nodeId: string): string | null {
  const source = sourceOf(content, nodeId, 'folder')
  return source?.type === 'folder' ? source.config.path : null
}

function workItemOf(job: Job, nodeId: string): WorkItem | null {
  const source = sourceOf(job.blueprint.content, nodeId, 'workItem')
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

function describeWorkItem(item: WorkItem, content: IssueContent | null): string {
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
  const comments = content.comments.slice(-maxIssueComments)
  if (comments.length > 0) {
    parts.push(
      [
        `### Comments (${content.comments.length})`,
        ...comments.map(
          (comment) =>
            `**${comment.author}**${comment.createdAt ? ` (${comment.createdAt})` : ''}:\n\n${clip(comment.body)}`,
        ),
      ].join('\n\n'),
    )
  }
  return parts.join('\n\n')
}

function buildPrompt(
  instructions: string,
  input: Omit<AgentRunInput, 'prompt'>,
  workItemContent: IssueContent | null,
): string {
  const parts: string[] = []
  const task = instructions.trim()
  if (task) parts.push(task)
  else if (input.workItem) parts.push('Work on the work item below.')
  else parts.push('Continue the work based on the results below.')

  if (input.workItem) parts.push(describeWorkItem(input.workItem, workItemContent))
  if (input.previous.length > 0) {
    parts.push(
      [
        '## Results of earlier agents',
        ...input.previous.map((previous) => `### ${previous.name}\n\n${previous.result}`),
      ].join('\n\n'),
    )
  }
  return parts.join('\n\n')
}

// --- Start checks -------------------------------------------------------------------------

async function checkRequirements(job: Job): Promise<StartProblem[]> {
  const problems: StartProblem[] = []
  if (active.has(job.id)) return [{ code: 'alreadyRunning' }]

  const content = job.blueprint.content
  const agents = content.nodes.filter((node) => node.type === 'agent')
  if (agents.length === 0) problems.push({ code: 'noAgents' })
  else if (!(await isClaudeInstalled())) problems.push({ code: 'cliMissing' })

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

  for (const agent of agents) {
    if (agent.type !== 'agent') continue
    const hasTask =
      agent.config.instructions.trim() !== '' ||
      sourceOf(content, agent.id, 'workItem') !== undefined ||
      incoming(content, agent.id, 'result').length > 0
    if (!hasTask) problems.push({ code: 'agentWithoutTask', nodeId: agent.id })
  }
  return problems
}

// --- Running ------------------------------------------------------------------------------

export async function startJob(jobId: unknown): Promise<StartRunResult> {
  const job = await getJob(jobId)
  if (!job) throw new Error('The job does not exist.')
  const problems = await checkRequirements(job)
  if (problems.length > 0) return { ok: false, problems }

  // Agents get the work items' content in their prompt, so they need not look it up.
  const workItemContent = new Map<string, IssueContent | null>()
  await Promise.all(
    Object.values(job.workItems).map(async (item) => {
      if (workItemContent.has(item.id)) return
      workItemContent.set(item.id, null)
      try {
        workItemContent.set(item.id, await getIssueContent(item.repository, item.number))
      } catch (error) {
        console.error(`Could not load ${item.id} for job ${job.id}`, error)
      }
    }),
  )

  // Checked again: another start may have begun while the requirements were checked.
  if (active.has(job.id)) return { ok: false, problems: [{ code: 'alreadyRunning' }] }

  const now = new Date().toISOString()
  const run = createRun(
    randomUUID(),
    job.id,
    planRun(job.blueprint.content),
    job.blueprint.content.nodes,
    now,
  )
  let resolveFinished = (): void => {}
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve
  })
  const entry: ActiveRun = {
    run,
    job,
    processes: new Map(),
    stopping: false,
    saveTimer: null,
    deleted: false,
    finished,
    resolveFinished,
    workItemContent,
  }
  active.set(job.id, entry)
  emit(entry, { type: 'started', run })
  activity(entry, 'runStarted')
  await setLastRun(job.id, summarizeRun(entry.run))
  schedule(entry)
  return { ok: true }
}

/** Starts every waiting agent whose dependencies are done, and finishes the run when idle. */
function schedule(entry: ActiveRun): void {
  if (entry.stopping) return
  const steps = entry.run.plan.strands.flatMap((strand) => strand.steps)

  // Skipping one agent can make others skippable, so repeat until nothing changes.
  let changed = true
  while (changed) {
    changed = false
    for (const step of steps) {
      if (entry.run.agents[step.nodeId]?.status !== 'waiting') continue
      const blocked = step.dependsOn.some((dep) =>
        ['failed', 'skipped', 'stopped'].includes(entry.run.agents[dep]?.status ?? ''),
      )
      if (blocked) {
        updateAgent(entry, step.nodeId, { status: 'skipped' })
        activity(entry, 'agentSkipped', step.nodeId)
        changed = true
      }
    }
  }

  for (const step of steps) {
    const agent = entry.run.agents[step.nodeId]
    if (agent?.status !== 'waiting') continue
    if (step.dependsOn.every((dep) => entry.run.agents[dep]?.status === 'done')) {
      startAgent(entry, step.nodeId, step.dependsOn)
    }
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

function startAgent(entry: ActiveRun, nodeId: string, dependsOn: string[]): void {
  const content = entry.job.blueprint.content
  const node = content.nodes.find((candidate) => candidate.id === nodeId)
  if (node?.type !== 'agent') {
    updateAgent(entry, nodeId, { status: 'failed', error: 'Not an agent.' })
    return
  }

  const base = {
    folder: folderOf(content, nodeId),
    workItem: workItemOf(entry.job, nodeId),
    previous: dependsOn.map((dep) => ({
      nodeId: dep,
      name: entry.run.agents[dep]?.name ?? dep,
      result: entry.run.agents[dep]?.result ?? '',
    })),
  }
  const issue = base.workItem ? (entry.workItemContent.get(base.workItem.id) ?? null) : null
  const input: AgentRunInput = {
    ...base,
    prompt: buildPrompt(node.config.instructions, base, issue),
  }
  updateAgent(entry, nodeId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    input,
  })
  activity(entry, 'agentStarted', nodeId)
  runProcess(entry, node, input)
}

/**
 * Commands each DevOps platform's CLI offers per access level. Reading looks at work items,
 * pull requests and their checks; writing comments, edits and opens pull requests.
 * Add a platform here when it is supported, e.g. Azure DevOps (`az boards`, `az repos`).
 */
const devOpsCommands: Record<string, { read: string[]; write: string[] }> = {
  github: {
    read: [
      'gh issue view',
      'gh issue list',
      'gh pr view',
      'gh pr list',
      'gh pr diff',
      'gh pr checks',
      'gh repo view',
      'gh search',
      'gh run view',
      'gh run list',
    ],
    write: [
      'gh issue comment',
      'gh issue edit',
      'gh issue create',
      'gh pr create',
      'gh pr comment',
      'gh pr edit',
      'git push',
    ],
  },
}

/** Tools the agent may use without approval, beyond what its permission mode allows. */
function allowedTools(config: AgentConfig): string[] {
  const access = config.devops
  if (access === 'none') return []
  return Object.values(devOpsCommands)
    .flatMap(({ read, write }) => (access === 'write' ? [...read, ...write] : read))
    .map((command) => `Bash(${command} *)`)
}

function runProcess(
  entry: ActiveRun,
  node: Extract<BlueprintNode, { type: 'agent' }>,
  input: AgentRunInput,
): void {
  // Without a linked folder the agent works in an empty folder of its own, removed when it
  // ends, and gets only tools that need no approval: its permissions apply to a folder.
  let scratch: string | null = null
  if (!input.folder) {
    try {
      scratch = mkdtempSync(join(tmpdir(), 'hub-agent-'))
    } catch (error) {
      agentFinished(entry, node.id, { failed: String(error) })
      return
    }
  }
  const removeScratch = () => {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    scratch = null
  }

  // `default` leaves the model and effort to Claude Code's own settings.
  const { model, effort } = node.config
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    input.folder ? node.config.permissionMode : 'default',
    ...(model === 'default' ? [] : ['--model', model]),
    ...(effort === 'default' ? [] : ['--effort', effort]),
  ]
  const tools = allowedTools(node.config)
  // Last, since the option takes a list; the prompt is passed on stdin.
  if (tools.length > 0) args.push('--allowedTools', tools.join(','))
  let child: ChildProcess
  try {
    child = spawn(claudeCommand, args, {
      cwd: input.folder ?? scratch ?? undefined,
      env: claudeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      // Its own process group, so stopping also ends the commands it started.
      detached: process.platform !== 'win32',
      windowsHide: true,
    })
  } catch (error) {
    removeScratch()
    agentFinished(entry, node.id, { failed: String(error) })
    return
  }
  entry.processes.set(node.id, child)

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
          emit(entry, { type: 'entry', runId: entry.run.id, nodeId: node.id, entry: update.entry })
        } else if (update.kind === 'toolResult') {
          const tool = entry.run.agents[node.id]?.entries.find(
            (candidate) => candidate.id === update.toolUseId,
          )
          if (tool?.kind !== 'tool') continue
          emit(entry, {
            type: 'entry',
            runId: entry.run.id,
            nodeId: node.id,
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
    entry.processes.delete(node.id)
    removeScratch()
    const final = result as typeof result
    if (entry.stopping) {
      agentFinished(entry, node.id, { stopped: true })
    } else if (final && !final.isError) {
      agentFinished(entry, node.id, { result: final.text, costUsd: final.costUsd })
    } else {
      const message = (
        final?.text ||
        spawnError ||
        stderr.trim() ||
        `Claude Code exited with code ${code}.`
      ).trim()
      agentFinished(entry, node.id, { failed: message, costUsd: final?.costUsd ?? null })
    }
  })
}

function agentFinished(
  entry: ActiveRun,
  nodeId: string,
  outcome:
    | { result: string; costUsd: number | null }
    | { failed: string; costUsd?: number | null }
    | { stopped: true },
): void {
  const finishedAt = new Date().toISOString()
  if ('stopped' in outcome) {
    updateAgent(entry, nodeId, { status: 'stopped', finishedAt })
  } else if ('failed' in outcome) {
    emit(entry, {
      type: 'entry',
      runId: entry.run.id,
      nodeId,
      entry: { id: randomUUID(), at: finishedAt, kind: 'error', text: outcome.failed },
    })
    updateAgent(entry, nodeId, {
      status: 'failed',
      finishedAt,
      error: outcome.failed,
      costUsd: outcome.costUsd ?? null,
    })
    activity(entry, 'agentFailed', nodeId, outcome.failed)
  } else {
    updateAgent(entry, nodeId, {
      status: 'done',
      finishedAt,
      result: outcome.result,
      costUsd: outcome.costUsd,
    })
    activity(entry, 'agentDone', nodeId)
  }

  if (entry.stopping) {
    if (entry.processes.size === 0) void finish(entry, 'stopped')
  } else {
    schedule(entry)
  }
}

async function finish(entry: ActiveRun, status: JobRunStatus): Promise<void> {
  if (active.get(entry.job.id) !== entry) return
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
    if (!entry.deleted) {
      await writeRun(entry.run)
      await setLastRun(entry.job.id, summarizeRun(entry.run))
    }
  } catch (error) {
    console.error('Failed to save run', error)
  } finally {
    entry.resolveFinished()
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
    if (agent.status === 'waiting') updateAgent(entry, agent.nodeId, { status: 'stopped' })
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

export async function deleteJobRun(jobId: string): Promise<void> {
  const entry = active.get(jobId)
  if (entry) {
    // Stopping only signals the processes; the run is saved once they have exited.
    // Wait for that (they are killed after the grace period), so the file is not written
    // again after it was deleted. `stopJob` does nothing if the run is already stopping.
    await stopJob(jobId)
    let timeout: NodeJS.Timeout | undefined
    await Promise.race([
      entry.finished,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, KILL_GRACE_MS + DELETE_WAIT_EXTRA_MS)
      }),
    ])
    clearTimeout(timeout)
    // If a process still has not exited, make sure nothing is saved for this run anymore.
    entry.deleted = true
    if (entry.saveTimer) clearTimeout(entry.saveTimer)
    entry.saveTimer = null
  }
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
    activity: [...run.activity, { id: randomUUID(), at, kind: 'runStopped' }],
  }
}

/** Runs that were in progress when the app quit are marked as stopped. */
export async function recoverInterruptedRuns(): Promise<void> {
  for (const job of await listJobs()) {
    if (job.lastRun?.status !== 'running' || active.has(job.id)) continue
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
    try {
      writeRunSync(entry.run)
    } catch (error) {
      console.error('Failed to save run', error)
    }
  }
}
