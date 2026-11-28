/**
 * Work items: what a job gives its agents to work on, e.g. a GitHub issue or pull request.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import { asRecord, isNonEmptyString } from './validation'

export const workItemSources = ['github'] as const
export type WorkItemSource = (typeof workItemSources)[number]

/**
 * What a GitHub work item is. Work items stored before pull requests were supported have no
 * kind and are issues.
 */
export const workItemKinds = ['issue', 'pullRequest'] as const
export type WorkItemKind = (typeof workItemKinds)[number]

export interface WorkItem {
  source: WorkItemSource
  kind: WorkItemKind
  /**
   * Unique per source, e.g. `owner/name#12`. Issues and pull requests share their numbers
   * on GitHub, so the kind is not part of it.
   */
  id: string
  title: string
  url: string
  /** `owner/name` of the repository the issue or pull request belongs to. */
  repository: string
  number: number
}

export function gitHubItemId(repository: string, number: number): string {
  return `${repository}#${number}`
}

/** `owner/name` as GitHub allows it. */
export const repositoryPattern = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/

/** Validates a work item from a file or the renderer. Returns `null` if it is invalid. */
export function sanitizeWorkItem(value: unknown): WorkItem | null {
  const input = asRecord(value)
  if (!input || input['source'] !== 'github') return null
  const { kind, title, url, repository, number } = input
  if (
    (kind !== undefined && kind !== 'issue' && kind !== 'pullRequest') ||
    !isNonEmptyString(title) ||
    typeof url !== 'string' ||
    !url.startsWith('https://') ||
    typeof repository !== 'string' ||
    !repositoryPattern.test(repository) ||
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    return null
  }
  return {
    source: 'github',
    kind: kind ?? 'issue',
    id: gitHubItemId(repository, number),
    title: title.slice(0, 500),
    url,
    repository,
    number,
  }
}
