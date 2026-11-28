/**
 * Building blocks: the one place that defines which blocks exist, their ports and their
 * settings. Add a block by adding an entry to `blockTypes` and `blockDefinitions`; the
 * renderer adds its presentation in `features/blueprints/blocks.tsx`.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import { asRecord } from './validation'

/** What flows through a connection. Only ports with the same data type can be linked. */
export const dataTypes = ['folder', 'workItem', 'result'] as const
export type DataType = (typeof dataTypes)[number]

export interface PortDefinition {
  /** Unique per node side; stored in connections. */
  id: string
  dataType: DataType
  /** Inputs only: whether more than one connection may end here. */
  multiple?: boolean
}

export const blockTypes = ['folder', 'workItem', 'agent'] as const
export type BlockType = (typeof blockTypes)[number]

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (blockTypes as readonly string[]).includes(value)
}

// --- Block settings ---------------------------------------------------------------------

export interface FolderConfig {
  /** Absolute path of a local folder, or `null` while none is picked. */
  path: string | null
}

/** A work item node is a named placeholder; the job provides the actual work item. */
export type WorkItemConfig = Record<string, never>

/** `default` leaves the choice to Claude Code's own settings; the others are CLI aliases. */
export const agentModels = ['default', 'fable', 'opus', 'sonnet', 'haiku'] as const
export type AgentModel = (typeof agentModels)[number]

/** Effort levels of the Claude Code CLI (`--effort`); `default` leaves it to Claude Code. */
export const agentEfforts = ['default', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type AgentEffort = (typeof agentEfforts)[number]

/**
 * What an agent may do on the connected DevOps platforms (GitHub today, others later),
 * independent of its folder. The runner turns it into the allowed commands of each
 * platform's CLI, since agents cannot ask for approval.
 */
export const agentDevOpsAccess = ['none', 'read', 'write'] as const
export type AgentDevOpsAccess = (typeof agentDevOpsAccess)[number]

/** Permission modes of the Claude Code CLI that work without anyone answering prompts. */
export const agentPermissionModes = ['acceptEdits', 'plan', 'bypassPermissions'] as const
export type AgentPermissionMode = (typeof agentPermissionModes)[number]

/** Longest accepted agent instructions, in characters. */
export const maxInstructionsLength = 20_000

export interface AgentConfig {
  /** What the agent should do. Added to the prompt before the inputs. */
  instructions: string
  model: AgentModel
  effort: AgentEffort
  permissionMode: AgentPermissionMode
  devops: AgentDevOpsAccess
}

export interface BlockConfigs {
  folder: FolderConfig
  workItem: WorkItemConfig
  agent: AgentConfig
}

// --- Definitions ------------------------------------------------------------------------

export interface BlockDefinition<T extends BlockType> {
  inputs: readonly PortDefinition[]
  outputs: readonly PortDefinition[]
  /** Whether a job runs something for this block. Other blocks only provide data. */
  runs: boolean
  /** How many nodes of this block a blueprint may have. No limit if missing. */
  maxPerBlueprint?: number
  defaultConfig: () => BlockConfigs[T]
  /** Repairs stored or received settings; never fails. */
  sanitizeConfig: (value: unknown) => BlockConfigs[T]
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

export const blockDefinitions: { [T in BlockType]: BlockDefinition<T> } = {
  folder: {
    inputs: [],
    outputs: [{ id: 'folder', dataType: 'folder' }],
    runs: false,
    defaultConfig: () => ({ path: null }),
    sanitizeConfig: (value) => {
      const path = asRecord(value)?.['path']
      return { path: typeof path === 'string' && path.trim() ? path : null }
    },
  },
  workItem: {
    inputs: [],
    outputs: [{ id: 'workItem', dataType: 'workItem' }],
    runs: false,
    // One work item per job for now; the job asks for it when it is created.
    maxPerBlueprint: 1,
    defaultConfig: () => ({}),
    sanitizeConfig: () => ({}),
  },
  agent: {
    inputs: [
      { id: 'folder', dataType: 'folder' },
      { id: 'workItem', dataType: 'workItem' },
      { id: 'result', dataType: 'result', multiple: true },
    ],
    outputs: [{ id: 'result', dataType: 'result' }],
    runs: true,
    defaultConfig: () => ({
      instructions: '',
      model: 'default',
      effort: 'default',
      permissionMode: 'acceptEdits',
      devops: 'read',
    }),
    sanitizeConfig: (value) => {
      const input = asRecord(value) ?? {}
      const instructions = input['instructions']
      return {
        instructions:
          typeof instructions === 'string' ? instructions.slice(0, maxInstructionsLength) : '',
        model: isOneOf(agentModels, input['model']) ? input['model'] : 'default',
        effort: isOneOf(agentEfforts, input['effort']) ? input['effort'] : 'default',
        permissionMode: isOneOf(agentPermissionModes, input['permissionMode'])
          ? input['permissionMode']
          : 'acceptEdits',
        devops: isOneOf(agentDevOpsAccess, input['devops']) ? input['devops'] : 'read',
      }
    },
  },
}

export type PortSide = 'input' | 'output'

export function findPort(type: BlockType, side: PortSide, portId: string): PortDefinition | null {
  const definition = blockDefinitions[type]
  const ports = side === 'input' ? definition.inputs : definition.outputs
  return ports.find((port) => port.id === portId) ?? null
}

/** Whether another node of this block may be added. */
export function canAddBlock(type: BlockType, nodes: readonly { type: BlockType }[]): boolean {
  const max = blockDefinitions[type].maxPerBlueprint
  return max === undefined || nodes.filter((node) => node.type === type).length < max
}
