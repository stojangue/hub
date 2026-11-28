/**
 * Job runs: the plan (which agents run in which order), the stored run with its logs,
 * and the events the main process sends while a run is in progress.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import { blockDefinitions } from './blocks'
import type { BlueprintContent, BlueprintNode } from './blueprints'
import { asRecord, isNonEmptyString, isTimestamp } from './validation'
import { sanitizeWorkItem, type WorkItem } from './work-items'

// --- Plan ---------------------------------------------------------------------------------

export interface RunPlanStep {
  nodeId: string
  /** Agents that must finish first: the sources of its incoming connections that run. */
  dependsOn: string[]
  /** 0 for agents without dependencies; otherwise one more than the deepest dependency. */
  level: number
}

/** Agents that are linked to each other, directly or through others. */
export interface RunStrand {
  steps: RunPlanStep[]
}

export interface RunPlan {
  /** Strands that do not depend on each other and run in parallel. */
  strands: RunStrand[]
}

/** Builds the run order: a topological sort of the runnable nodes, split into strands. */
export function planRun(content: BlueprintContent): RunPlan {
  const runnable = content.nodes.filter((node) => blockDefinitions[node.type].runs)
  const ids = new Set(runnable.map((node) => node.id))
  const dependsOn = new Map<string, string[]>()
  for (const node of runnable) {
    const sources = content.connections
      .filter((connection) => connection.to.nodeId === node.id && ids.has(connection.from.nodeId))
      .map((connection) => connection.from.nodeId)
    dependsOn.set(node.id, [...new Set(sources)])
  }

  // Levels by Kahn's algorithm; the content is acyclic, which sanitizing guarantees.
  const level = new Map<string, number>()
  const remaining = new Set(ids)
  while (remaining.size > 0) {
    let progressed = false
    for (const id of [...remaining]) {
      const deps = dependsOn.get(id) ?? []
      if (deps.every((dep) => level.has(dep))) {
        level.set(
          id,
          deps.length === 0 ? 0 : Math.max(...deps.map((dep) => level.get(dep) ?? 0)) + 1,
        )
        remaining.delete(id)
        progressed = true
      }
    }
    if (!progressed) break
  }

  // Strands are the weakly connected groups of agents.
  const parent = new Map<string, string>(runnable.map((node) => [node.id, node.id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) as string
    parent.set(id, root)
    return root
  }
  for (const [id, deps] of dependsOn) {
    for (const dep of deps) parent.set(find(id), find(dep))
  }

  const groups = new Map<string, RunPlanStep[]>()
  for (const node of runnable) {
    const root = find(node.id)
    const steps = groups.get(root) ?? []
    steps.push({
      nodeId: node.id,
      dependsOn: dependsOn.get(node.id) ?? [],
      level: level.get(node.id) ?? 0,
    })
    groups.set(root, steps)
  }
  const position = (id: string) => content.nodes.find((node) => node.id === id)?.position
  const strands = [...groups.values()].map((steps) => ({
    // By level, then top to bottom as on the canvas.
    steps: steps.sort(
      (a, b) => a.level - b.level || (position(a.nodeId)?.y ?? 0) - (position(b.nodeId)?.y ?? 0),
    ),
  }))
  strands.sort(
    (a, b) =>
      (position(a.steps[0]?.nodeId ?? '')?.y ?? 0) - (position(b.steps[0]?.nodeId ?? '')?.y ?? 0),
  )
  return { strands }
}

// --- Start checks -------------------------------------------------------------------------

/** Why a job cannot start. The renderer shows a translated message per code. */
export type StartProblem =
  | { code: 'cliMissing' }
  | { code: 'noAgents' }
  | { code: 'alreadyRunning' }
  | { code: 'folderNotSet'; nodeId: string }
  | { code: 'folderMissing'; nodeId: string; path: string }
  | { code: 'workItemMissing'; nodeId: string }
  | { code: 'agentWithoutTask'; nodeId: string }

export type StartRunResult = { ok: true } | { ok: false; problems: StartProblem[] }

// --- Stored run ---------------------------------------------------------------------------

export const jobRunStatuses = ['running', 'done', 'failed', 'stopped'] as const
export type JobRunStatus = (typeof jobRunStatuses)[number]

/** `ready` means the job has not run yet. */
export type JobStatus = 'ready' | JobRunStatus

export const agentRunStatuses = [
  'waiting',
  'running',
  'done',
  'failed',
  /** Not started because an agent it depends on failed. */
  'skipped',
  'stopped',
] as const
export type AgentRunStatus = (typeof agentRunStatuses)[number]

export interface PreviousResult {
  nodeId: string
  name: string
  result: string
}

/** What an agent was given. */
export interface AgentRunInput {
  folder: string | null
  workItem: WorkItem | null
  previous: PreviousResult[]
  /** The full prompt passed to the CLI. */
  prompt: string
}

export type AgentEntry =
  | { id: string; at: string; kind: 'text'; text: string }
  | {
      id: string
      at: string
      kind: 'tool'
      name: string
      /** The tool's input as sent by Claude, shortened if very long. */
      input: unknown
      /** Set once the tool has returned. */
      output?: string
      isError?: boolean
    }
  | { id: string; at: string; kind: 'error'; text: string }

export interface AgentRun {
  nodeId: string
  /** The node's name when the run started. */
  name: string
  status: AgentRunStatus
  startedAt: string | null
  finishedAt: string | null
  input: AgentRunInput | null
  /** What the agent passes on: the final answer of Claude Code. */
  result: string | null
  error: string | null
  costUsd: number | null
  entries: AgentEntry[]
}

export type ActivityKind =
  | 'runStarted'
  | 'agentStarted'
  | 'agentDone'
  | 'agentFailed'
  | 'agentSkipped'
  | 'runDone'
  | 'runFailed'
  | 'runStopped'

export interface ActivityItem {
  id: string
  at: string
  kind: ActivityKind
  nodeId?: string
  /** Error detail, if any. */
  message?: string
}

export interface JobRun {
  id: string
  jobId: string
  status: JobRunStatus
  startedAt: string
  finishedAt: string | null
  plan: RunPlan
  /** One entry per agent of the plan, keyed by node ID. */
  agents: Record<string, AgentRun>
  activity: ActivityItem[]
}

/** The part of a run kept with the job, e.g. for the job list. */
export interface JobRunSummary {
  id: string
  status: JobRunStatus
  startedAt: string
  finishedAt: string | null
}

export function summarizeRun(run: JobRun): JobRunSummary {
  return { id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt }
}

export function createRun(
  id: string,
  jobId: string,
  plan: RunPlan,
  nodes: readonly BlueprintNode[],
  at: string,
): JobRun {
  const agents: Record<string, AgentRun> = {}
  for (const strand of plan.strands) {
    for (const step of strand.steps) {
      agents[step.nodeId] = {
        nodeId: step.nodeId,
        name: nodes.find((node) => node.id === step.nodeId)?.name ?? step.nodeId,
        status: 'waiting',
        startedAt: null,
        finishedAt: null,
        input: null,
        result: null,
        error: null,
        costUsd: null,
        entries: [],
      }
    }
  }
  return {
    id,
    jobId,
    status: 'running',
    startedAt: at,
    finishedAt: null,
    plan,
    agents,
    activity: [],
  }
}

// --- Events -------------------------------------------------------------------------------

/** A change to a run. Applying the same event twice has no further effect. */
export type RunEvent =
  | { type: 'started'; run: JobRun }
  | {
      type: 'agent'
      runId: string
      nodeId: string
      changes: Partial<Omit<AgentRun, 'nodeId' | 'entries'>>
    }
  /** Adds an entry, or replaces the one with the same ID (e.g. when a tool returns). */
  | { type: 'entry'; runId: string; nodeId: string; entry: AgentEntry }
  | { type: 'activity'; runId: string; item: ActivityItem }
  | { type: 'finished'; runId: string; status: JobRunStatus; finishedAt: string }

/** Sent from main to every window while runs are in progress. */
export interface RunEventMessage {
  jobId: string
  event: RunEvent
}

/** Returns the run with the event applied. Events for another run are ignored. */
export function applyRunEvent(run: JobRun | null, event: RunEvent): JobRun | null {
  if (event.type === 'started') return event.run
  if (!run || run.id !== event.runId) return run
  switch (event.type) {
    case 'agent': {
      const agent = run.agents[event.nodeId]
      if (!agent) return run
      return { ...run, agents: { ...run.agents, [event.nodeId]: { ...agent, ...event.changes } } }
    }
    case 'entry': {
      const agent = run.agents[event.nodeId]
      if (!agent) return run
      const index = agent.entries.findIndex((entry) => entry.id === event.entry.id)
      const entries =
        index === -1
          ? [...agent.entries, event.entry]
          : agent.entries.map((entry, position) => (position === index ? event.entry : entry))
      return { ...run, agents: { ...run.agents, [event.nodeId]: { ...agent, entries } } }
    }
    case 'activity':
      if (run.activity.some((item) => item.id === event.item.id)) return run
      return { ...run, activity: [...run.activity, event.item] }
    case 'finished':
      return { ...run, status: event.status, finishedAt: event.finishedAt }
  }
}

// --- Sanitizing ---------------------------------------------------------------------------

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

const optionalTimestamp = (value: unknown) => (isTimestamp(value) ? value : null)
const optionalString = (value: unknown) => (typeof value === 'string' ? value : null)

function sanitizePlan(value: unknown): RunPlan {
  const strands = asRecord(value)?.['strands']
  return {
    strands: (Array.isArray(strands) ? strands : []).map((strand) => {
      const steps = asRecord(strand)?.['steps']
      return {
        steps: (Array.isArray(steps) ? steps : []).flatMap((raw) => {
          const step = asRecord(raw)
          if (!step || !isNonEmptyString(step['nodeId'])) return []
          const dependsOn = Array.isArray(step['dependsOn'])
            ? step['dependsOn'].filter(isNonEmptyString)
            : []
          const level = typeof step['level'] === 'number' ? step['level'] : 0
          return [{ nodeId: step['nodeId'], dependsOn, level }]
        }),
      }
    }),
  }
}

function sanitizeEntry(value: unknown): AgentEntry | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['id']) || !isTimestamp(input['at'])) return null
  const base = { id: input['id'], at: input['at'] }
  if (
    (input['kind'] === 'text' || input['kind'] === 'error') &&
    typeof input['text'] === 'string'
  ) {
    return { ...base, kind: input['kind'], text: input['text'] }
  }
  if (input['kind'] === 'tool' && typeof input['name'] === 'string') {
    return {
      ...base,
      kind: 'tool',
      name: input['name'],
      input: input['input'] ?? null,
      ...(typeof input['output'] === 'string' ? { output: input['output'] } : {}),
      ...(input['isError'] === true ? { isError: true } : {}),
    }
  }
  return null
}

function sanitizeInput(value: unknown): AgentRunInput | null {
  const input = asRecord(value)
  if (!input) return null
  const previous = Array.isArray(input['previous']) ? input['previous'] : []
  return {
    folder: optionalString(input['folder']),
    workItem: sanitizeWorkItem(input['workItem']),
    previous: previous.flatMap((raw) => {
      const item = asRecord(raw)
      return item &&
        typeof item['nodeId'] === 'string' &&
        typeof item['name'] === 'string' &&
        typeof item['result'] === 'string'
        ? [{ nodeId: item['nodeId'], name: item['name'], result: item['result'] }]
        : []
    }),
    prompt: optionalString(input['prompt']) ?? '',
  }
}

function sanitizeAgent(nodeId: string, value: unknown): AgentRun | null {
  const input = asRecord(value)
  if (!input) return null
  const entries = Array.isArray(input['entries']) ? input['entries'] : []
  return {
    nodeId,
    name: optionalString(input['name']) ?? nodeId,
    status: isOneOf(agentRunStatuses, input['status']) ? input['status'] : 'waiting',
    startedAt: optionalTimestamp(input['startedAt']),
    finishedAt: optionalTimestamp(input['finishedAt']),
    input: sanitizeInput(input['input']),
    result: optionalString(input['result']),
    error: optionalString(input['error']),
    costUsd: typeof input['costUsd'] === 'number' ? input['costUsd'] : null,
    entries: entries.flatMap((entry) => sanitizeEntry(entry) ?? []),
  }
}

/** Validates a stored run. Returns `null` if it cannot be repaired. */
export function sanitizeRun(value: unknown): JobRun | null {
  const input = asRecord(value)
  if (
    !input ||
    !isNonEmptyString(input['id']) ||
    !isNonEmptyString(input['jobId']) ||
    !isTimestamp(input['startedAt'])
  ) {
    return null
  }
  const agents: Record<string, AgentRun> = {}
  for (const [nodeId, raw] of Object.entries(asRecord(input['agents']) ?? {})) {
    const agent = sanitizeAgent(nodeId, raw)
    if (agent) agents[nodeId] = agent
  }
  const activity = Array.isArray(input['activity']) ? input['activity'] : []
  return {
    id: input['id'],
    jobId: input['jobId'],
    status: isOneOf(jobRunStatuses, input['status']) ? input['status'] : 'stopped',
    startedAt: input['startedAt'],
    finishedAt: optionalTimestamp(input['finishedAt']),
    plan: sanitizePlan(input['plan']),
    agents,
    activity: activity.flatMap((raw) => {
      const item = asRecord(raw)
      if (!item || !isNonEmptyString(item['id']) || !isTimestamp(item['at'])) return []
      if (typeof item['kind'] !== 'string') return []
      return [
        {
          id: item['id'],
          at: item['at'],
          kind: item['kind'] as ActivityKind,
          ...(typeof item['nodeId'] === 'string' ? { nodeId: item['nodeId'] } : {}),
          ...(typeof item['message'] === 'string' ? { message: item['message'] } : {}),
        },
      ]
    }),
  }
}

export function sanitizeRunSummary(value: unknown): JobRunSummary | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['id']) || !isTimestamp(input['startedAt'])) return null
  return {
    id: input['id'],
    status: isOneOf(jobRunStatuses, input['status']) ? input['status'] : 'stopped',
    startedAt: input['startedAt'],
    finishedAt: optionalTimestamp(input['finishedAt']),
  }
}
