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
import { asRecord, isNonEmptyString, isTimestamp, type UnknownRecord } from './validation'

/** Longest accepted name, in characters. Longer names are cut off. */
export const maxNameLength = 120

/** Upper bounds, so a broken file or payload cannot grow without limit. */
const maxNodes = 500
const maxConnections = 2000
/** Longest kept unsupported part, as JSON. Larger ones are dropped (the file is backed up). */
const maxUnsupportedLength = 100_000

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

/**
 * Stored nodes and connections this version of the app cannot use: an unknown block type
 * (e.g. from a newer version), settings or ports that no longer fit, or a connection that
 * breaks the rules. They are kept exactly as stored instead of being dropped, so nothing is
 * lost, and are shown as needing attention. Each load tries them again, so a later version
 * that understands them brings them back as regular nodes and connections.
 */
export interface UnsupportedParts {
  nodes: UnknownRecord[]
  connections: UnknownRecord[]
}

export interface BlueprintContent {
  nodes: BlueprintNode[]
  connections: BlueprintConnection[]
  unsupported: UnsupportedParts
}

export interface Blueprint {
  id: string
  /**
   * Version of the stored format (see `blueprintFormatVersion`). Older blueprints are
   * migrated when they are loaded; newer ones are shown read-only.
   */
  formatVersion: number
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
  return { nodes: [], connections: [], unsupported: { nodes: [], connections: [] } }
}

// --- Format versions ----------------------------------------------------------------------

/**
 * Version of the stored blueprint format, also used for the snapshot in a job. Raise it when
 * stored data changes in a way older or newer versions would read differently, and add a
 * migration below if the change can be done mechanically. Changes that cannot (e.g. a block
 * that now behaves differently) are left to `sanitizeContent`, which keeps what it cannot use
 * as unsupported parts for the user to repair.
 */
export const blueprintFormatVersion = 1

/** Files from before versioning count as version 0. */
export function readFormatVersion(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

/** Whether data was written by a newer version of the app, which this one must not overwrite. */
export function isNewerFormat(version: number): boolean {
  return version > blueprintFormatVersion
}

/**
 * Mechanical upgrades of stored content, keyed by the version they upgrade from. They work on
 * the raw stored data, before it is sanitized, and must not fail on unexpected input.
 */
const contentMigrations: Record<number, (content: UnknownRecord) => UnknownRecord> = {
  // 0 → 1: the agent setting `github` was renamed to `devops` when it began to cover other
  // platforms.
  0: (content) => ({
    ...content,
    nodes: Array.isArray(content['nodes'])
      ? content['nodes'].map((raw: unknown) => {
          const node = asRecord(raw)
          const config = asRecord(node?.['config'])
          if (node?.['type'] !== 'agent' || !config || !('github' in config)) return raw
          const { github, ...rest } = config
          return { ...node, config: { devops: github, ...rest } }
        })
      : content['nodes'],
  }),
}

/** Brings stored content from `version` up to `blueprintFormatVersion`. */
export function migrateContent(value: unknown, version: number): unknown {
  let content = asRecord(value)
  if (!content) return value
  for (let from = version; from < blueprintFormatVersion; from++) {
    const migrate = contentMigrations[from]
    if (migrate) content = migrate(content)
  }
  return content
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

/** Keeps a part as unsupported if it is an object of reasonable size. */
function keepUnsupported(list: UnknownRecord[], raw: unknown, max: number): void {
  const record = asRecord(raw)
  if (!record || list.length >= max) return
  try {
    if (JSON.stringify(record).length <= maxUnsupportedLength) list.push(record)
  } catch {
    // Not serializable, so it cannot be stored either.
  }
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Validates canvas content. Nodes and connections it cannot use, e.g. of an unknown block
 * type, with a missing port or breaking the rules (wrong types, a second link into a single
 * input, cycles), are kept as unsupported parts instead of being dropped. Unsupported parts
 * from earlier loads are tried again, after the regular ones.
 */
export function sanitizeContent(value: unknown): BlueprintContent {
  const input = asRecord(value)
  const previous = asRecord(input?.['unsupported'])
  const content = emptyContent()
  const { unsupported } = content

  const nodeIds = new Set<string>()
  for (const raw of [...listOf(input?.['nodes']), ...listOf(previous?.['nodes'])]) {
    const node = sanitizeNode(raw)
    if (
      !node ||
      nodeIds.has(node.id) ||
      content.nodes.length >= maxNodes ||
      !canAddBlock(node.type, content.nodes)
    ) {
      keepUnsupported(unsupported.nodes, raw, maxNodes)
      continue
    }
    nodeIds.add(node.id)
    content.nodes.push(node)
  }

  const connectionIds = new Set<string>()
  for (const raw of [...listOf(input?.['connections']), ...listOf(previous?.['connections'])]) {
    const record = asRecord(raw)
    const from = sanitizeRef(record?.['from'])
    const to = sanitizeRef(record?.['to'])
    const id = record?.['id']
    const check = from && to ? checkConnection(content, from, to) : null
    if (
      !from ||
      !to ||
      !isNonEmptyString(id) ||
      connectionIds.has(id) ||
      content.connections.length >= maxConnections ||
      !check?.ok ||
      check.replaces.length > 0
    ) {
      keepUnsupported(unsupported.connections, raw, maxConnections)
      continue
    }
    connectionIds.add(id)
    content.connections.push({ id, from, to })
  }
  return content
}

export function hasUnsupportedParts(content: BlueprintContent): boolean {
  return content.unsupported.nodes.length > 0 || content.unsupported.connections.length > 0
}

/** What can still be read from an unsupported node, to show it on the canvas. */
export interface UnsupportedNodeInfo {
  id: string | null
  type: string | null
  name: string | null
  /** `null` if it has no usable position. */
  position: Position | null
}

export function describeUnsupportedNode(raw: UnknownRecord): UnsupportedNodeInfo {
  const position = asRecord(raw['position'])
  const x = position?.['x']
  const y = position?.['y']
  return {
    id: isNonEmptyString(raw['id']) ? raw['id'] : null,
    type: isNonEmptyString(raw['type']) ? raw['type'].slice(0, maxNameLength) : null,
    name: sanitizeName(raw['name']),
    position:
      typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
        ? sanitizePosition(position)
        : null,
  }
}

/** The node IDs an unsupported connection refers to, as far as they can be read. */
export function unsupportedConnectionNodes(raw: UnknownRecord): string[] {
  return [asRecord(raw['from'])?.['nodeId'], asRecord(raw['to'])?.['nodeId']].filter(
    (id): id is string => typeof id === 'string',
  )
}

/** Removes a node and every connection, regular or unsupported, that refers to it. */
export function removeNode(content: BlueprintContent, nodeId: string): BlueprintContent {
  return {
    nodes: content.nodes.filter((node) => node.id !== nodeId),
    connections: content.connections.filter(
      (connection) => connection.from.nodeId !== nodeId && connection.to.nodeId !== nodeId,
    ),
    unsupported: {
      nodes: content.unsupported.nodes,
      connections: content.unsupported.connections.filter(
        (raw) => !unsupportedConnectionNodes(raw).includes(nodeId),
      ),
    },
  }
}

/**
 * Removes an unsupported node, and the unsupported connections to it unless a regular node
 * has the same ID.
 */
export function removeUnsupportedNode(content: BlueprintContent, index: number): BlueprintContent {
  const raw = content.unsupported.nodes[index]
  if (!raw) return content
  const id = describeUnsupportedNode(raw).id
  const orphaned = id !== null && !content.nodes.some((node) => node.id === id)
  return {
    ...content,
    unsupported: {
      nodes: content.unsupported.nodes.filter((_, other) => other !== index),
      connections: orphaned
        ? content.unsupported.connections.filter(
            (connection) => !unsupportedConnectionNodes(connection).includes(id),
          )
        : content.unsupported.connections,
    },
  }
}

/** Validates one stored blueprint. Returns `null` if it cannot be repaired. */
export function sanitizeBlueprint(value: unknown): Blueprint | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['id'])) return null
  const name = sanitizeName(input['name'])
  if (!name || !isTimestamp(input['createdAt'])) return null
  const version = readFormatVersion(input['formatVersion'])
  return {
    id: input['id'],
    // Older content is migrated, so it is stored as the current version from now on. Newer
    // content keeps its version, so it is never saved over with what this version understood.
    formatVersion: Math.max(version, blueprintFormatVersion),
    name,
    createdAt: input['createdAt'],
    updatedAt: isTimestamp(input['updatedAt']) ? input['updatedAt'] : input['createdAt'],
    content: sanitizeContent(migrateContent(input['content'], version)),
  }
}
