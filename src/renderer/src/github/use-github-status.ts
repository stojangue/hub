import { useCallback } from 'react'
import type { GitHubStatus } from '@shared/github'
import { api } from '@renderer/lib/api'
import { useAsync, type AsyncState } from '@renderer/lib/use-async'

/** Checks whether the GitHub CLI is installed and signed in. `reload` checks again. */
export function useGitHubStatus(): AsyncState<GitHubStatus> {
  const load = useCallback(() => api.github.status(), [])
  return useAsync(load)
}
