import { randomUUID } from 'node:crypto'
import { sanitizeName, type Blueprint } from '@shared/blueprints'
import { sanitizeJob, sanitizeWorkItems, type BlueprintSnapshot, type Job } from '@shared/jobs'
import type { JobRunSummary } from '@shared/runs'
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

/** A deep copy of the blueprint's data, so the job never depends on the live blueprint. */
function takeSnapshot(blueprint: Blueprint, at: string): BlueprintSnapshot {
  return {
    sourceId: blueprint.id,
    name: blueprint.name,
    snapshotAt: at,
    content: structuredClone(blueprint.content),
  }
}

/** Validates the input, since it comes from the renderer. The snapshot is taken here. */
export async function createJob(input: unknown): Promise<Job> {
  const record = asRecord(input)
  const name = sanitizeName(record?.['name'])
  if (!name) throw new Error('A job needs a name.')
  const blueprint = await getBlueprint(record?.['blueprintId'])
  if (!blueprint) throw new Error('The blueprint does not exist.')
  const now = new Date().toISOString()
  const snapshot = takeSnapshot(blueprint, now)
  return store.add({
    id: randomUUID(),
    name,
    createdAt: now,
    blueprint: snapshot,
    workItems: sanitizeWorkItems(record?.['workItems'], snapshot.content),
    lastRun: null,
  })
}

export function setLastRun(id: string, lastRun: JobRunSummary): Promise<Job | null> {
  return store.update(id, (job) => ({ ...job, lastRun }))
}

export function deleteJob(id: unknown): Promise<void> {
  return typeof id === 'string' ? store.remove(id) : Promise.resolve()
}
