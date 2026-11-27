/**
 * GitHub types shared by main, preload and renderer.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

/** Why a GitHub call failed. The renderer shows a translated message per code. */
export const gitHubErrorCodes = [
  'notInstalled',
  'notAuthenticated',
  'network',
  'rateLimited',
  'notFound',
  'invalidRequest',
  'unknown',
] as const
export type GitHubErrorCode = (typeof gitHubErrorCodes)[number]

export interface GitHubError {
  code: GitHubErrorCode
  /** Technical detail from the GitHub CLI, shown in small print. May be empty. */
  message: string
}

/** GitHub calls never throw across IPC; they resolve to either data or an error. */
export type GitHubResult<T> = { ok: true; data: T } | { ok: false; error: GitHubError }

export interface GitHubAccount {
  login: string
  name: string | null
  avatarUrl: string
  url: string
}

export type GitHubStatus =
  | { state: 'connected'; account: GitHubAccount }
  /** `gh` is installed but not signed in to github.com. */
  | { state: 'notAuthenticated' }
  | { state: 'notInstalled' }
  /** The check itself failed, e.g. because the network is down. */
  | { state: 'error'; error: GitHubError }

export type RepositoryVisibility = 'public' | 'private' | 'internal'

export interface Repository {
  /** `owner/name`, unique per repository. */
  fullName: string
  owner: string
  name: string
  description: string | null
  visibility: RepositoryVisibility
  isArchived: boolean
  isFork: boolean
  openIssues: number
  openPullRequests: number
  url: string
  /** ISO 8601 timestamp of the last push, or of the last update if never pushed. */
  updatedAt: string
}

export interface GitHubUser {
  login: string
  isBot: boolean
}

export interface Label {
  name: string
  /** Hex color without `#`, as GitHub stores it. */
  color: string
}

export const itemStateFilters = ['open', 'closed', 'all'] as const
export type ItemStateFilter = (typeof itemStateFilters)[number]

export interface RepositoryItemsQuery {
  owner: string
  name: string
  state: ItemStateFilter
}

export interface Issue {
  number: number
  title: string
  state: 'open' | 'closed'
  labels: Label[]
  author: GitHubUser | null
  assignees: GitHubUser[]
  url: string
  updatedAt: string
}

export type ReviewStatus = 'approved' | 'changesRequested' | 'reviewRequired' | 'none'
export type CheckStatus = 'success' | 'failure' | 'pending' | 'none'

export interface PullRequest {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  labels: Label[]
  author: GitHubUser | null
  headBranch: string
  baseBranch: string
  reviewStatus: ReviewStatus
  checkStatus: CheckStatus
  url: string
  updatedAt: string
}

/** A list that may have been cut off at `limit` items. */
export interface ItemList<T> {
  items: T[]
  limit: number
  /** True if more items exist than were loaded. */
  truncated: boolean
}
