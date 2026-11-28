import { randomUUID } from 'node:crypto'
import {
  blueprintFormatVersion,
  emptyContent,
  isNewerFormat,
  sanitizeBlueprint,
  sanitizeContent,
  sanitizeName,
  type Blueprint,
} from '@shared/blueprints'
import { asRecord } from '@shared/validation'
import { createEntryStore } from './entry-store'

const store = createEntryStore('blueprints', sanitizeBlueprint, (blueprint) => blueprint.createdAt)

export function listBlueprints(): Promise<Blueprint[]> {
  return store.all()
}

export function getBlueprint(id: unknown): Promise<Blueprint | null> {
  return typeof id === 'string' ? store.get(id) : Promise.resolve(null)
}

/** Validates the input, since it comes from the renderer. */
export function createBlueprint(input: unknown): Promise<Blueprint> {
  const name = sanitizeName(asRecord(input)?.['name'])
  if (!name) return Promise.reject(new Error('A blueprint needs a name.'))
  const now = new Date().toISOString()
  return store.add({
    id: randomUUID(),
    formatVersion: blueprintFormatVersion,
    name,
    createdAt: now,
    updatedAt: now,
    content: emptyContent(),
  })
}

/** Validates the input, since it comes from the renderer. Content is sanitized as a whole. */
export async function updateBlueprint(id: unknown, input: unknown): Promise<Blueprint> {
  const record = asRecord(input) ?? {}
  const name = 'name' in record ? sanitizeName(record['name']) : undefined
  if (name === null) throw new Error('A blueprint needs a name.')
  const content = 'content' in record ? sanitizeContent(record['content']) : undefined
  const existing = await getBlueprint(id)
  // Saving would replace what a newer version stored with what this one understood of it.
  if (existing && isNewerFormat(existing.formatVersion)) {
    throw new Error('The blueprint was saved by a newer version of Hub and cannot be changed.')
  }
  const updated =
    typeof id === 'string'
      ? await store.update(id, (blueprint) => ({
          ...blueprint,
          ...(name ? { name } : {}),
          ...(content ? { content } : {}),
          updatedAt: new Date().toISOString(),
        }))
      : null
  if (!updated) throw new Error('The blueprint does not exist.')
  return updated
}

/** Jobs keep their own snapshot, so they are not touched. */
export function deleteBlueprint(id: unknown): Promise<void> {
  return typeof id === 'string' ? store.remove(id) : Promise.resolve()
}
