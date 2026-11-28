import { useCallback, useEffect, useState } from 'react'
import type { Job } from '@shared/jobs'
import { applyRunEvent, type JobRun } from '@shared/runs'
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

export interface JobRunState {
  run: JobRun | null
  loading: boolean
}

/** The latest run of a job, kept up to date with the events the main process sends. */
export function useJobRun(jobId: string): JobRunState {
  const [state, setState] = useState<{ jobId: string; run: JobRun | null; loaded: boolean }>({
    jobId,
    run: null,
    loaded: false,
  })

  useEffect(() => {
    let active = true
    // Events that arrive before the stored run are applied on top of it; all are idempotent.
    const early: Parameters<typeof applyRunEvent>[1][] = []
    let loaded = false
    const unsubscribe = api.jobs.onRunEvent((message) => {
      if (message.jobId !== jobId || !active) return
      if (!loaded) {
        early.push(message.event)
        return
      }
      setState((current) => ({ ...current, run: applyRunEvent(current.run, message.event) }))
    })
    api.jobs.run(jobId).then(
      (stored) => {
        if (!active) return
        loaded = true
        const run = early.reduce<JobRun | null>(
          (value, event) => applyRunEvent(value, event),
          stored,
        )
        setState({ jobId, run, loaded: true })
      },
      (error: unknown) => {
        console.error('Failed to load the run', error)
        loaded = true
        if (active) setState({ jobId, run: null, loaded: true })
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [jobId])

  const current = state.jobId === jobId
  return { run: current ? state.run : null, loading: !current || !state.loaded }
}

/** The current time, updated every `interval` ms while `enabled`. */
export function useNow(enabled: boolean, interval = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [enabled, interval])
  return now
}
