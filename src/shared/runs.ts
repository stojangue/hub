/**
 * Job runs: the plan (which agents run in which order), the stored run with its logs,
 * and the events the main process sends while a run is in progress.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import { blockDefinitions } from './blocks'
import {
  flowConnections,
  repeatConnections,
  repeatedNodes,
  type BlueprintContent,
  type BlueprintNode,
} from './blueprints'
import { asRecord, isNonEmptyString, isTimestamp } from './validation'
import { sanitizeWorkItem, type WorkItem } from './work-items'

// --- Plan ---------------------------------------------------------------------------------

export interface RunPlanStep {
  /** Key of the step's agent run: the node ID, with `#<round>` from a loop's second round on. */
  id: string
  /** The agent node it runs. */
  nodeId: string
  /** 1, or for agents in a loop the round they run in. */
  round: number
  /** The repeat connection whose part of the blueprint the agent belongs to, if any. */
  loopId: string | null
  /** Steps that must finish first: the agents it gets results from, by step ID. */
  dependsOn: string[]
  /**
   * The output ports each dependency's result arrives through. A switch passes its result on
   * only through the output it picked; the others are not taken.
   */
  via: Record<string, string[]>
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

export function stepId(nodeId: string, round: number): string {
  return round > 1 ? `${nodeId}#${round}` : nodeId
}

export function planSteps(plan: RunPlan): RunPlanStep[] {
  return plan.strands.flatMap((strand) => strand.steps)
}

/** Recomputes every step's level from its dependencies, by Kahn's algorithm. */
function withLevels(steps: RunPlanStep[]): RunPlanStep[] {
  const level = new Map<string, number>()
  const byId = new Map(steps.map((step) => [step.id, step]))
  const remaining = new Set(steps.map((step) => step.id))
  while (remaining.size > 0) {
    let progressed = false
    for (const id of [...remaining]) {
      const deps = (byId.get(id)?.dependsOn ?? []).filter((dep) => byId.has(dep))
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
  return steps.map((step) => ({ ...step, level: level.get(step.id) ?? step.level }))
}

/** By level, then by round, then top to bottom as on the canvas. */
function sortSteps(steps: RunPlanStep[], content: BlueprintContent): RunPlanStep[] {
  const y = (step: RunPlanStep) =>
    content.nodes.find((node) => node.id === step.nodeId)?.position.y ?? 0
  return [...steps].sort((a, b) => a.level - b.level || a.round - b.round || y(a) - y(b))
}

/**
 * Builds the run order: a topological sort of the runnable nodes, split into strands. The
 * part of the blueprint a repeat connection runs again is planned for its first round;
 * `addLoopRound` adds the next ones while the job runs.
 */
export function planRun(content: BlueprintContent): RunPlan {
  const runnable = content.nodes.filter((node) => blockDefinitions[node.type].runs)
  const ids = new Set(runnable.map((node) => node.id))
  const loopOf = new Map<string, string>()
  for (const repeat of repeatConnections(content)) {
    for (const id of repeatedNodes(content, repeat)) if (!loopOf.has(id)) loopOf.set(id, repeat.id)
  }
  const flow = flowConnections(content)
  const steps = withLevels(
    runnable.map((node) => {
      const via: Record<string, string[]> = {}
      for (const connection of flow) {
        if (connection.to.nodeId !== node.id || !ids.has(connection.from.nodeId)) continue
        ;(via[connection.from.nodeId] ??= []).push(connection.from.port)
      }
      return {
        id: node.id,
        nodeId: node.id,
        round: 1,
        loopId: loopOf.get(node.id) ?? null,
        dependsOn: Object.keys(via),
        via,
        level: 0,
      }
    }),
  )

  // Strands are the weakly connected groups of agents.
  const parent = new Map<string, string>(runnable.map((node) => [node.id, node.id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) as string
    parent.set(id, root)
    return root
  }
  for (const step of steps) {
    for (const dep of step.dependsOn) parent.set(find(step.id), find(dep))
  }

  const groups = new Map<string, RunPlanStep[]>()
  for (const step of steps) {
    const root = find(step.id)
    groups.set(root, [...(groups.get(root) ?? []), step])
  }
  const position = (id: string) => content.nodes.find((node) => node.id === id)?.position
  const strands = [...groups.values()].map((group) => ({ steps: sortSteps(group, content) }))
  strands.sort(
    (a, b) =>
      (position(a.steps[0]?.nodeId ?? '')?.y ?? 0) - (position(b.steps[0]?.nodeId ?? '')?.y ?? 0),
  )
  return { strands }
}

/**
 * Adds round `round` of the part a repeat connection runs again, after the round before it.
 * Its agents depend on each other as in the blueprint; the repeat's target gets the result
 * of the repeat's source from the round before. Agents after that part wait for the new
 * round instead.
 */
export function addLoopRound(
  plan: RunPlan,
  content: BlueprintContent,
  loopId: string,
  round: number,
): { plan: RunPlan; added: RunPlanStep[] } {
  const repeat = repeatConnections(content).find((connection) => connection.id === loopId)
  const all = planSteps(plan)
  const previous = all.filter((step) => step.loopId === loopId && step.round === round - 1)
  if (!repeat || previous.length === 0) return { plan, added: [] }
  const previousIds = new Set(previous.map((step) => step.id))
  const inLoop = new Set(all.filter((step) => step.loopId === loopId).map((step) => step.id))
  const nodeOfStep = new Map(all.map((step) => [step.id, step.nodeId]))
  const sourceStep = previous.find((step) => step.nodeId === repeat.from.nodeId)

  const added = previous.map((step) => {
    const via: Record<string, string[]> = {}
    for (const dep of step.dependsOn) {
      const ports = step.via[dep] ?? []
      if (previousIds.has(dep)) {
        via[stepId(nodeOfStep.get(dep) ?? dep, round)] = ports
      } else if (!inLoop.has(dep)) {
        via[dep] = ports
      }
    }
    if (step.nodeId === repeat.to.nodeId && sourceStep) {
      ;(via[sourceStep.id] ??= []).push(repeat.from.port)
    }
    return {
      ...step,
      id: stepId(step.nodeId, round),
      round,
      dependsOn: Object.keys(via),
      via,
    }
  })

  const remap = (step: RunPlanStep): RunPlanStep => {
    if (step.loopId === loopId) return step
    const via: Record<string, string[]> = {}
    for (const dep of step.dependsOn) {
      const ports = step.via[dep] ?? []
      via[previousIds.has(dep) ? stepId(nodeOfStep.get(dep) ?? dep, round) : dep] = ports
    }
    return { ...step, dependsOn: Object.keys(via), via }
  }
  const strands = plan.strands.map((strand) => {
    const own = strand.steps.some((step) => previousIds.has(step.id))
    const steps = strand.steps.map(remap)
    return own ? [...steps, ...added] : steps
  })
  const leveled = withLevels(strands.flat())
  const byId = new Map(leveled.map((step) => [step.id, step]))
  return {
    plan: {
      strands: strands.map((steps) => ({
        steps: sortSteps(
          steps.map((step) => byId.get(step.id) ?? step),
          content,
        ),
      })),
    },
    added: added.map((step) => byId.get(step.id) ?? step),
  }
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
  /** A switch needs a result to judge. */
  | { code: 'switchWithoutInput'; nodeId: string }
  /** A folder that agents use for a pull request must be in a git repository … */
  | { code: 'folderNotGitRepository'; nodeId: string; path: string }
  /** … that has a remote for the pull request's repository. */
  | { code: 'folderWrongRepository'; nodeId: string; repository: string }
  /** The worktree for the pull request's branch could not be made. */
  | { code: 'worktreeFailed'; nodeId: string; message: string }
  /** The job was saved by a newer version of the app. */
  | { code: 'newerFormat' }
  /** The snapshot has nodes or connections this version cannot use. */
  | { code: 'unsupportedParts'; nodes: number; connections: number }

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
  /** Not started because a switch before it picked another way. */
  'notTaken',
] as const
export type AgentRunStatus = (typeof agentRunStatuses)[number]

export interface PreviousResult {
  nodeId: string
  name: string
  result: string
}

/** What an agent was given. */
export interface AgentRunInput {
  /** The linked folder. */
  folder: string | null
  /** Where the agent worked instead of the linked folder: a worktree for a pull request. */
  worktree: string | null
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
  /** The plan step it belongs to, and its key in `JobRun.agents`. */
  stepId: string
  /** The agent node it runs. */
  nodeId: string
  /** 1, or the loop round it runs in. */
  round: number
  /** The node's name when the run started. */
  name: string
  status: AgentRunStatus
  startedAt: string | null
  finishedAt: string | null
  input: AgentRunInput | null
  /** What the agent passes on: the final answer of Claude Code. */
  result: string | null
  /** For a switch: the ID of the output it picked. */
  chosenOutput: string | null
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

export const worktreeKeptReasons = [
  'uncommittedChanges',
  'unpushedCommits',
  /** The app quit while the run was in progress. */
  'interrupted',
  'removeFailed',
] as const
export type WorktreeKeptReason = (typeof worktreeKeptReasons)[number]

/** A git worktree made for a run, e.g. for a pull request's branch. */
export interface RunWorktree {
  /** The linked folder it was made from. */
  folder: string
  /** Where the agents worked. */
  path: string
  /** Its local branch. */
  branch: string
  /** The pull request's head branch. */
  headBranch: string
  pullRequest: number
  status: 'active' | 'removed' | 'kept'
  keptReason: WorktreeKeptReason | null
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
  worktrees: RunWorktree[]
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

/** A waiting agent run for a plan step. */
export function createAgentRun(step: RunPlanStep, nodes: readonly BlueprintNode[]): AgentRun {
  return {
    stepId: step.id,
    nodeId: step.nodeId,
    round: step.round,
    name: nodes.find((node) => node.id === step.nodeId)?.name ?? step.nodeId,
    status: 'waiting',
    startedAt: null,
    finishedAt: null,
    input: null,
    result: null,
    chosenOutput: null,
    error: null,
    costUsd: null,
    entries: [],
  }
}

export function createRun(
  id: string,
  jobId: string,
  plan: RunPlan,
  nodes: readonly BlueprintNode[],
  at: string,
): JobRun {
  const agents: Record<string, AgentRun> = {}
  for (const step of planSteps(plan)) agents[step.id] = createAgentRun(step, nodes)
  return {
    id,
    jobId,
    status: 'running',
    startedAt: at,
    finishedAt: null,
    plan,
    agents,
    activity: [],
    worktrees: [],
  }
}

// --- Events -------------------------------------------------------------------------------

/** A change to a run. Applying the same event twice has no further effect. */
export type RunEvent =
  | { type: 'started'; run: JobRun }
  | {
      type: 'agent'
      runId: string
      stepId: string
      changes: Partial<Omit<AgentRun, 'stepId' | 'nodeId' | 'round' | 'entries'>>
    }
  /** Adds an entry, or replaces the one with the same ID (e.g. when a tool returns). */
  | { type: 'entry'; runId: string; stepId: string; entry: AgentEntry }
  /** The plan changed, e.g. a loop's next round was added with these agents. */
  | { type: 'plan'; runId: string; plan: RunPlan; agents: AgentRun[] }
  | { type: 'activity'; runId: string; item: ActivityItem }
  /** Adds a worktree, or replaces the one with the same path. */
  | { type: 'worktree'; runId: string; worktree: RunWorktree }
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
      const agent = run.agents[event.stepId]
      if (!agent) return run
      return { ...run, agents: { ...run.agents, [event.stepId]: { ...agent, ...event.changes } } }
    }
    case 'plan': {
      const agents = { ...run.agents }
      for (const agent of event.agents) agents[agent.stepId] ??= agent
      return { ...run, plan: event.plan, agents }
    }
    case 'entry': {
      const agent = run.agents[event.stepId]
      if (!agent) return run
      const index = agent.entries.findIndex((entry) => entry.id === event.entry.id)
      const entries =
        index === -1
          ? [...agent.entries, event.entry]
          : agent.entries.map((entry, position) => (position === index ? event.entry : entry))
      return { ...run, agents: { ...run.agents, [event.stepId]: { ...agent, entries } } }
    }
    case 'activity':
      if (run.activity.some((item) => item.id === event.item.id)) return run
      return { ...run, activity: [...run.activity, event.item] }
    case 'worktree': {
      const others = run.worktrees.filter((worktree) => worktree.path !== event.worktree.path)
      return { ...run, worktrees: [...others, event.worktree] }
    }
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
          const round = step['round']
          // Plans from before loops have no step IDs: each step was keyed by its node.
          const rawVia = asRecord(step['via'])
          const via: Record<string, string[]> = {}
          for (const dep of dependsOn) {
            const ports = rawVia?.[dep]
            via[dep] = Array.isArray(ports) ? ports.filter(isNonEmptyString) : []
          }
          return [
            {
              id: isNonEmptyString(step['id']) ? step['id'] : step['nodeId'],
              nodeId: step['nodeId'],
              round: typeof round === 'number' && Number.isInteger(round) && round > 1 ? round : 1,
              loopId: isNonEmptyString(step['loopId']) ? step['loopId'] : null,
              dependsOn,
              via,
              level,
            },
          ]
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
    worktree: optionalString(input['worktree']),
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

function sanitizeAgent(stepId: string, value: unknown): AgentRun | null {
  const input = asRecord(value)
  if (!input) return null
  const entries = Array.isArray(input['entries']) ? input['entries'] : []
  const round = input['round']
  // Runs from before loops keyed each agent by its node.
  const nodeId = isNonEmptyString(input['nodeId']) ? input['nodeId'] : stepId
  return {
    stepId,
    nodeId,
    round: typeof round === 'number' && Number.isInteger(round) && round > 1 ? round : 1,
    name: optionalString(input['name']) ?? nodeId,
    status: isOneOf(agentRunStatuses, input['status']) ? input['status'] : 'waiting',
    startedAt: optionalTimestamp(input['startedAt']),
    finishedAt: optionalTimestamp(input['finishedAt']),
    input: sanitizeInput(input['input']),
    result: optionalString(input['result']),
    chosenOutput: optionalString(input['chosenOutput']),
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
  for (const [stepId, raw] of Object.entries(asRecord(input['agents']) ?? {})) {
    const agent = sanitizeAgent(stepId, raw)
    if (agent) agents[stepId] = agent
  }
  const activity = Array.isArray(input['activity']) ? input['activity'] : []
  const worktrees = Array.isArray(input['worktrees']) ? input['worktrees'] : []
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
    worktrees: worktrees.flatMap((raw) => sanitizeWorktree(raw) ?? []),
  }
}

function sanitizeWorktree(value: unknown): RunWorktree | null {
  const input = asRecord(value)
  if (
    !input ||
    !isNonEmptyString(input['folder']) ||
    !isNonEmptyString(input['path']) ||
    !isNonEmptyString(input['branch']) ||
    typeof input['pullRequest'] !== 'number'
  ) {
    return null
  }
  const status = isOneOf(['active', 'removed', 'kept'] as const, input['status'])
    ? input['status']
    : 'kept'
  return {
    folder: input['folder'],
    path: input['path'],
    branch: input['branch'],
    headBranch: optionalString(input['headBranch']) ?? '',
    pullRequest: input['pullRequest'],
    status,
    keptReason: isOneOf(worktreeKeptReasons, input['keptReason']) ? input['keptReason'] : null,
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
