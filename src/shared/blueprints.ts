/**
 * Blueprint types shared by main, preload and renderer.
 * A blueprint is a template; jobs are created from it (see `jobs.ts`).
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import {
  blockDefinitions,
  canAddBlock,
  findPort,
  isBlockType,
  type BlockConfigs,
  type BlockType,
} from './blocks'
import { asRecord, isNonEmptyString, isTimestamp } from './validation'

/** Longest accepted name, in characters. Longer names are cut off. */
export const maxNameLength = 120

/** Upper bounds, so a broken file or payload cannot grow without limit. */
const maxNodes = 500
const maxConnections = 2000

export interface Position {
  x: number
  y: number
}

interface NodeBase<T extends BlockType> {
  id: string
  type: T
  name: string
  /** Top-left corner in canvas coordinates. */
  position: Position
  config: BlockConfigs[T]
}

/** A building block placed on the canvas. `config` depends on `type`. */
export type BlueprintNode = { [T in BlockType]: NodeBase<T> }[BlockType]

export interface PortRef {
  nodeId: string
  port: string
}

/** Links an output (`from`) to an input (`to`) of the same data type. */
export interface BlueprintConnection {
  id: string
  from: PortRef
  to: PortRef
}

export interface BlueprintContent {
  nodes: BlueprintNode[]
  connections: BlueprintConnection[]
}

export interface Blueprint {
  id: string
  name: string
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp. */
  updatedAt: string
  content: BlueprintContent
}

export interface CreateBlueprintInput {
  name: string
}

/** Only the given values are changed. */
export interface UpdateBlueprintInput {
  name?: string
  content?: BlueprintContent
}

export function emptyContent(): BlueprintContent {
  return { nodes: [], connections: [] }
}

/** Trims a name and cuts it to `maxNameLength`. Returns `null` if nothing is left. */
export function sanitizeName(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null
  return value.trim().slice(0, maxNameLength)
}

// --- Graph rules --------------------------------------------------------------------------

/** True if `target` can be reached from `start` by following connections. */
function reaches(connections: readonly BlueprintConnection[], start: string, target: string) {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (current === target) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const connection of connections) {
      if (connection.from.nodeId === current) stack.push(connection.to.nodeId)
    }
  }
  return false
}

export type ConnectionCheck =
  | {
      ok: true
      /** Connections that are replaced, e.g. on an input that takes only one. */ replaces: string[]
    }
  | { ok: false; reason: 'samePort' | 'sameNode' | 'type' | 'cycle' | 'duplicate' | 'invalid' }

/** Whether an output can be linked to an input, following the rules of the block registry. */
export function checkConnection(
  content: BlueprintContent,
  from: PortRef,
  to: PortRef,
): ConnectionCheck {
  const source = content.nodes.find((node) => node.id === from.nodeId)
  const target = content.nodes.find((node) => node.id === to.nodeId)
  if (!source || !target) return { ok: false, reason: 'invalid' }
  if (source.id === target.id) return { ok: false, reason: 'sameNode' }
  const output = findPort(source.type, 'output', from.port)
  const input = findPort(target.type, 'input', to.port)
  if (!output || !input) return { ok: false, reason: 'invalid' }
  if (output.dataType !== input.dataType) return { ok: false, reason: 'type' }
  const existing = content.connections.filter(
    (connection) => connection.to.nodeId === to.nodeId && connection.to.port === to.port,
  )
  if (existing.some((connection) => sameRef(connection.from, from))) {
    return { ok: false, reason: 'duplicate' }
  }
  const replaces = input.multiple ? [] : existing.map((connection) => connection.id)
  const remaining = content.connections.filter((connection) => !replaces.includes(connection.id))
  // A new link from → to closes a cycle if `from` can already be reached from `to`.
  if (reaches(remaining, target.id, source.id)) return { ok: false, reason: 'cycle' }
  return { ok: true, replaces }
}

export function sameRef(a: PortRef, b: PortRef): boolean {
  return a.nodeId === b.nodeId && a.port === b.port
}

/** Connections that end at the given input. */
export function incoming(
  content: BlueprintContent,
  nodeId: string,
  port?: string,
): BlueprintConnection[] {
  return content.connections.filter(
    (connection) =>
      connection.to.nodeId === nodeId && (port === undefined || connection.to.port === port),
  )
}

/** The node linked to an input that takes one connection, if any. */
export function sourceOf(
  content: BlueprintContent,
  nodeId: string,
  port: string,
): BlueprintNode | undefined {
  const connection = incoming(content, nodeId, port)[0]
  return connection ? content.nodes.find((node) => node.id === connection.from.nodeId) : undefined
}

/** The default name for a new node: its type label, numbered from the second one on. */
export function nextNodeName(content: BlueprintContent, label: string): string {
  const names = new Set(content.nodes.map((node) => node.name))
  if (!names.has(label)) return label
  for (let index = 2; ; index++) {
    const name = `${label} ${index}`
    if (!names.has(name)) return name
  }
}

// --- Sanitizing ---------------------------------------------------------------------------

function sanitizePosition(value: unknown): Position {
  const input = asRecord(value)
  const coordinate = (key: string) => {
    const number = input?.[key]
    return typeof number === 'number' && Number.isFinite(number)
      ? Math.max(-1e6, Math.min(1e6, number))
      : 0
  }
  return { x: coordinate('x'), y: coordinate('y') }
}

function sanitizeNode(value: unknown): BlueprintNode | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['id']) || !isBlockType(input['type'])) return null
  const type = input['type']
  const name = sanitizeName(input['name'])
  if (!name) return null
  return {
    id: input['id'],
    type,
    name,
    position: sanitizePosition(input['position']),
    config: blockDefinitions[type].sanitizeConfig(input['config']),
  } as BlueprintNode
}

function sanitizeRef(value: unknown): PortRef | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['nodeId']) || !isNonEmptyString(input['port'])) return null
  return { nodeId: input['nodeId'], port: input['port'] }
}

/**
 * Validates canvas content. Drops nodes and connections that are broken, and connections
 * that break the rules (wrong types, a second link into a single input, cycles).
 */
export function sanitizeContent(value: unknown): BlueprintContent {
  const input = asRecord(value)
  const nodes: BlueprintNode[] = []
  const nodeIds = new Set<string>()
  for (const raw of Array.isArray(input?.['nodes']) ? input['nodes'] : []) {
    const node = sanitizeNode(raw)
    if (!node || nodeIds.has(node.id) || nodes.length >= maxNodes) continue
    if (!canAddBlock(node.type, nodes)) continue
    nodeIds.add(node.id)
    nodes.push(node)
  }

  const content: BlueprintContent = { nodes, connections: [] }
  const connectionIds = new Set<string>()
  for (const raw of Array.isArray(input?.['connections']) ? input['connections'] : []) {
    const record = asRecord(raw)
    const from = sanitizeRef(record?.['from'])
    const to = sanitizeRef(record?.['to'])
    const id = record?.['id']
    if (!from || !to || !isNonEmptyString(id) || connectionIds.has(id)) continue
    if (content.connections.length >= maxConnections) break
    const check = checkConnection(content, from, to)
    if (!check.ok || check.replaces.length > 0) continue
    connectionIds.add(id)
    content.connections.push({ id, from, to })
  }
  return content
}

/** Validates one stored blueprint. Returns `null` if it cannot be repaired. */
export function sanitizeBlueprint(value: unknown): Blueprint | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['id'])) return null
  const name = sanitizeName(input['name'])
  if (!name || !isTimestamp(input['createdAt'])) return null
  return {
    id: input['id'],
    name,
    createdAt: input['createdAt'],
    updatedAt: isTimestamp(input['updatedAt']) ? input['updatedAt'] : input['createdAt'],
    content: sanitizeContent(input['content']),
  }
}
