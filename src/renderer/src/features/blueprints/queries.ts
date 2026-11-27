import { useCallback } from 'react'
import type { Blueprint } from '@shared/blueprints'
import { api } from '@renderer/lib/api'
import { useAsync, type AsyncState } from '@renderer/lib/use-async'

/** All blueprints, newest first. */
export function useBlueprints(): AsyncState<Blueprint[]> {
  const load = useCallback(() => api.blueprints.list(), [])
  return useAsync(load)
}

/** One blueprint; `data` is `null` if it does not exist. */
export function useBlueprint(id: string): AsyncState<Blueprint | null> {
  const load = useCallback(() => api.blueprints.get(id), [id])
  return useAsync(load)
}
