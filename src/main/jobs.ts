import { randomUUID } from 'node:crypto'
import {
  blueprintFormatVersion,
  isNewerFormat,
  sanitizeName,
  type Blueprint,
} from '@shared/blueprints'
import { sanitizeJob, sanitizeWorkItems, type BlueprintSnapshot, type Job } from '@shared/jobs'
import type { JobRunSummary } from '@shared/runs'
import { asRecord } from '@shared/validation'
import { getBlueprint } from './blueprints'
import { createEntryStore } from './entry-store'

const store = createEntryStore('jobs', sanitizeJob, (job) => job.createdAt)

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
  if (isNewerFormat(blueprint.formatVersion)) {
    throw new Error('The blueprint was saved by a newer version of Hub.')
  }
  const now = new Date().toISOString()
  const snapshot = takeSnapshot(blueprint, now)
  return store.add({
    id: randomUUID(),
    formatVersion: blueprintFormatVersion,
    name,
    createdAt: now,
    blueprint: snapshot,
    workItems: sanitizeWorkItems(record?.['workItems'], snapshot.content),
    lastRun: null,
  })
}

/**
 * Records the latest run. A job saved by a newer version is left as it is: writing it would
 * replace its file with what this version understood of it.
 */
export async function setLastRun(id: string, lastRun: JobRunSummary): Promise<Job | null> {
  const job = await store.get(id)
  if (!job || isNewerFormat(job.formatVersion)) return job
  return store.update(id, (current) => ({ ...current, lastRun }))
}

export function deleteJob(id: unknown): Promise<void> {
  return typeof id === 'string' ? store.remove(id) : Promise.resolve()
}
