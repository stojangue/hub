/**
 * Blueprint types shared by main, preload and renderer.
 * A blueprint is a template; jobs are created from it (see `jobs.ts`).
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import { asRecord, isNonEmptyString, isTimestamp } from './validation'

/** Longest accepted name, in characters. Longer names are cut off. */
export const maxNameLength = 120

export interface Blueprint {
  id: string
  name: string
  /** ISO 8601 timestamp. */
  createdAt: string
  /** ISO 8601 timestamp. */
  updatedAt: string
}

export interface CreateBlueprintInput {
  name: string
}

/** Trims a name and cuts it to `maxNameLength`. Returns `null` if nothing is left. */
export function sanitizeName(value: unknown): string | null {
  if (!isNonEmptyString(value)) return null
  return value.trim().slice(0, maxNameLength)
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
  }
}
