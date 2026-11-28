/**
 * Job types shared by main, preload and renderer.
 * A job is always created from a blueprint and keeps a snapshot of it.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import {
  blueprintFormatVersion,
  migrateContent,
  readFormatVersion,
  sanitizeContent,
  sanitizeName,
  type BlueprintContent,
} from './blueprints'
import { sanitizeRunSummary, type JobRunSummary, type JobStatus } from './runs'
import { asRecord, isNonEmptyString, isTimestamp } from './validation'
import { sanitizeWorkItem, type WorkItem } from './work-items'

/**
 * A copy of a blueprint, taken when the job was created. It is not a reference:
 * later changes to the blueprint, or deleting it, do not affect the job.
 */
export interface BlueprintSnapshot {
  /** ID of the blueprint the snapshot was taken from. It may no longer exist. */
  sourceId: string
  name: string
  /** ISO 8601 timestamp. */
  snapshotAt: string
  /** Nodes, their settings and positions, and connections, as they were. */
  content: BlueprintContent
}

export interface Job {
  id: string
  /**
   * Version of the stored format, shared with blueprints (`blueprintFormatVersion`); it also
   * applies to the snapshot. Older jobs are migrated when they are loaded; newer ones cannot
   * start, since this version may not run them the way they were meant.
   */
  formatVersion: number
  name: string
  /** ISO 8601 timestamp. */
  createdAt: string
  blueprint: BlueprintSnapshot
  /** The work item given for each work item node of the snapshot, keyed by node ID. */
  workItems: Record<string, WorkItem>
  /** The latest run; its logs are stored separately. `null` until the job is run. */
  lastRun: JobRunSummary | null
}

export interface CreateJobInput {
  name: string
  /** The blueprint to take the snapshot from. Must exist. */
  blueprintId: string
  /** A work item per work item node of the blueprint, keyed by node ID. */
  workItems?: Record<string, WorkItem>
}

export function jobStatus(job: Job): JobStatus {
  return job.lastRun?.status ?? 'ready'
}

function sanitizeSnapshot(value: unknown, version: number): BlueprintSnapshot | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['sourceId'])) return null
  const name = sanitizeName(input['name'])
  if (!name || !isTimestamp(input['snapshotAt'])) return null
  return {
    sourceId: input['sourceId'],
    name,
    snapshotAt: input['snapshotAt'],
    content: sanitizeContent(migrateContent(input['content'], version)),
  }
}

/** Keeps only work items for work item nodes of the snapshot. */
export function sanitizeWorkItems(
  value: unknown,
  content: BlueprintContent,
): Record<string, WorkItem> {
  const input = asRecord(value) ?? {}
  const result: Record<string, WorkItem> = {}
  for (const node of content.nodes) {
    if (node.type !== 'workItem') continue
    const item = sanitizeWorkItem(input[node.id])
    if (item) result[node.id] = item
  }
  return result
}

/** Validates one stored job. Returns `null` if it cannot be repaired. */
export function sanitizeJob(value: unknown): Job | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['id'])) return null
  const name = sanitizeName(input['name'])
  const version = readFormatVersion(input['formatVersion'])
  const blueprint = sanitizeSnapshot(input['blueprint'], version)
  if (!name || !blueprint || !isTimestamp(input['createdAt'])) return null
  return {
    id: input['id'],
    formatVersion: Math.max(version, blueprintFormatVersion),
    name,
    createdAt: input['createdAt'],
    blueprint,
    workItems: sanitizeWorkItems(input['workItems'], blueprint.content),
    lastRun: sanitizeRunSummary(input['lastRun']),
  }
}
