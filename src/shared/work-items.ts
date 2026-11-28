/**
 * Work items: what a job gives its agents to work on, e.g. a GitHub issue.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import { asRecord, isNonEmptyString } from './validation'

export const workItemSources = ['github'] as const
export type WorkItemSource = (typeof workItemSources)[number]

export interface WorkItem {
  source: WorkItemSource
  /** Unique per source, e.g. `owner/name#12` for a GitHub issue. */
  id: string
  title: string
  url: string
  /** `owner/name` of the repository the issue belongs to. */
  repository: string
  number: number
}

export function gitHubIssueId(repository: string, number: number): string {
  return `${repository}#${number}`
}

/** Validates a work item from a file or the renderer. Returns `null` if it is invalid. */
export function sanitizeWorkItem(value: unknown): WorkItem | null {
  const input = asRecord(value)
  if (!input || input['source'] !== 'github') return null
  const { title, url, repository, number } = input
  if (
    !isNonEmptyString(title) ||
    typeof url !== 'string' ||
    !url.startsWith('https://') ||
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) ||
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    number < 1
  ) {
    return null
  }
  return {
    source: 'github',
    id: gitHubIssueId(repository, number),
    title: title.slice(0, 500),
    url,
    repository,
    number,
  }
}
