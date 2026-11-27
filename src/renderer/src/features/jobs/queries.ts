import { useCallback } from 'react'
import type { Job } from '@shared/jobs'
import { api } from '@renderer/lib/api'
import { useAsync, type AsyncState } from '@renderer/lib/use-async'

/** All jobs, newest first. */
export function useJobs(): AsyncState<Job[]> {
  const load = useCallback(() => api.jobs.list(), [])
  return useAsync(load)
}

export interface JobWithSource {
  job: Job
  /** Whether the blueprint the snapshot was taken from still exists. */
  sourceExists: boolean
}

/** One job, plus whether its original blueprint still exists. `null` if the job does not exist. */
export function useJob(id: string): AsyncState<JobWithSource | null> {
  const load = useCallback(async () => {
    const job = await api.jobs.get(id)
    if (!job) return null
    const source = await api.blueprints.get(job.blueprint.sourceId)
    return { job, sourceExists: source !== null }
  }, [id])
  return useAsync(load)
}
