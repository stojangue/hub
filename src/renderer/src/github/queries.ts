import type { GitHubResult } from '@shared/github'

/** Turns a `GitHubResult` into a value or a thrown `GitHubError`, for use with `useAsync`. */
export async function unwrap<T>(result: Promise<GitHubResult<T>>): Promise<T> {
  const value = await result
  if (!value.ok) throw value.error
  return value.data
}
