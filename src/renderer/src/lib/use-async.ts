import { useCallback, useEffect, useMemo, useState } from 'react'

export interface AsyncState<T> {
  /** The latest value for the current `load` function; kept while reloading. */
  data: T | undefined
  /** The error of the latest run for the current `load` function. */
  error: unknown
  /** True until the first run for the current `load` function has finished. */
  loading: boolean
  /** True while `reload` runs again with data or an error already shown. */
  reloading: boolean
  reload: () => void
}

interface Request<T> {
  load: () => Promise<T>
  /** Counts reloads; makes every run a distinct request. */
  run: number
}

interface Outcome<T> {
  request: Request<T>
  data?: T
  error?: unknown
}

/**
 * Runs `load` and tracks its result. Pass a memoized function (`useCallback`):
 * a new function starts over with a loading state, `reload` keeps the current data.
 * Results of outdated runs are ignored.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncState<T> {
  const [nonce, setNonce] = useState(0)
  // A new object per run, so outcomes can be matched to the run that produced them.
  const request = useMemo<Request<T>>(() => ({ load, run: nonce }), [load, nonce])
  const [outcome, setOutcome] = useState<Outcome<T> | null>(null)

  useEffect(() => {
    let active = true
    request.load().then(
      (data) => active && setOutcome({ request, data }),
      (error: unknown) => active && setOutcome({ request, error }),
    )
    return () => {
      active = false
    }
  }, [request])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const sameSource = outcome !== null && outcome.request.load === load
  const current = outcome?.request === request

  return {
    data: sameSource ? outcome.data : undefined,
    error: sameSource ? outcome.error : undefined,
    loading: !sameSource,
    reloading: sameSource && !current,
    reload,
  }
}
