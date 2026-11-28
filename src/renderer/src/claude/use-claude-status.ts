import { useCallback } from 'react'
import type { ClaudeCliStatus } from '@shared/claude'
import { api } from '@renderer/lib/api'
import { useAsync, type AsyncState } from '@renderer/lib/use-async'

/** Checks whether the Claude Code CLI is installed and up to date. `reload` checks again. */
export function useClaudeStatus(): AsyncState<ClaudeCliStatus> {
  const load = useCallback(() => api.claude.status(), [])
  return useAsync(load)
}
