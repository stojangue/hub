import { randomUUID } from 'node:crypto'
import { sanitizeBlueprint, sanitizeName, type Blueprint } from '@shared/blueprints'
import { asRecord } from '@shared/validation'
import { createCollectionStore } from './json-store'

const store = createCollectionStore('blueprints.json', sanitizeBlueprint)

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
  return store.add({ id: randomUUID(), name, createdAt: now, updatedAt: now })
}

/** Jobs keep their own snapshot, so they are not touched. */
export function deleteBlueprint(id: unknown): Promise<void> {
  return typeof id === 'string' ? store.remove(id) : Promise.resolve()
}
