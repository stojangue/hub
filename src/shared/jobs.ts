/**
 * Job types shared by main, preload and renderer.
 * A job is always created from a blueprint and keeps a snapshot of it.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import { sanitizeName } from './blueprints'
import { asRecord, isNonEmptyString, isTimestamp } from './validation'

/**
 * A copy of a blueprint, taken when the job was created. It is not a reference:
 * later changes to the blueprint, or deleting it, do not affect the job.
 * Will later also hold the blueprint's content, such as canvas data.
 */
export interface BlueprintSnapshot {
  /** ID of the blueprint the snapshot was taken from. It may no longer exist. */
  sourceId: string
  name: string
  /** ISO 8601 timestamp. */
  snapshotAt: string
}

export interface Job {
  id: string
  name: string
  /** ISO 8601 timestamp. */
  createdAt: string
  blueprint: BlueprintSnapshot
}

export interface CreateJobInput {
  name: string
  /** The blueprint to take the snapshot from. Must exist. */
  blueprintId: string
}

function sanitizeSnapshot(value: unknown): BlueprintSnapshot | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['sourceId'])) return null
  const name = sanitizeName(input['name'])
  if (!name || !isTimestamp(input['snapshotAt'])) return null
  return { sourceId: input['sourceId'], name, snapshotAt: input['snapshotAt'] }
}

/** Validates one stored job. Returns `null` if it cannot be repaired. */
export function sanitizeJob(value: unknown): Job | null {
  const input = asRecord(value)
  if (!input || !isNonEmptyString(input['id'])) return null
  const name = sanitizeName(input['name'])
  const blueprint = sanitizeSnapshot(input['blueprint'])
  if (!name || !blueprint || !isTimestamp(input['createdAt'])) return null
  return { id: input['id'], name, createdAt: input['createdAt'], blueprint }
}
