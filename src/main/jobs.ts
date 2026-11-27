import { randomUUID } from 'node:crypto'
import { sanitizeName, type Blueprint } from '@shared/blueprints'
import { sanitizeJob, type BlueprintSnapshot, type Job } from '@shared/jobs'
import { asRecord } from '@shared/validation'
import { getBlueprint } from './blueprints'
import { createCollectionStore } from './json-store'

const store = createCollectionStore('jobs.json', sanitizeJob)

export function listJobs(): Promise<Job[]> {
  return store.all()
}

export function getJob(id: unknown): Promise<Job | null> {
  return typeof id === 'string' ? store.get(id) : Promise.resolve(null)
}

/** A copy of the blueprint's data, so the job never depends on the live blueprint. */
function takeSnapshot(blueprint: Blueprint, at: string): BlueprintSnapshot {
  return { sourceId: blueprint.id, name: blueprint.name, snapshotAt: at }
}

/** Validates the input, since it comes from the renderer. The snapshot is taken here. */
export async function createJob(input: unknown): Promise<Job> {
  const record = asRecord(input)
  const name = sanitizeName(record?.['name'])
  if (!name) throw new Error('A job needs a name.')
  const blueprint = await getBlueprint(record?.['blueprintId'])
  if (!blueprint) throw new Error('The blueprint does not exist.')
  const now = new Date().toISOString()
  return store.add({
    id: randomUUID(),
    name,
    createdAt: now,
    blueprint: takeSnapshot(blueprint, now),
  })
}

export function deleteJob(id: unknown): Promise<void> {
  return typeof id === 'string' ? store.remove(id) : Promise.resolve()
}
