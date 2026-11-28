/**
 * GitHub access through the GitHub CLI (`gh`). All calls run here in the main process;
 * the renderer reaches them only through the typed IPC channels in `@shared/ipc`.
 */

import { execFile, type ExecException } from 'node:child_process'
import type {
  CheckStatus,
  GitHubAccount,
  GitHubError,
  GitHubErrorCode,
  GitHubResult,
  GitHubStatus,
  GitHubUser,
  Issue,
  ItemList,
  Label,
  PullRequest,
  Repository,
  RepositoryItemsQuery,
  RepositoryVisibility,
  ReviewStatus,
} from '@shared/github'
import { itemStateFilters } from '@shared/github'
import { cliPath, firstLine } from './cli-env'

const COMMAND_TIMEOUT_MS = 30_000
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024
/** Issues and pull requests loaded per list. */
const ITEM_LIMIT = 100
/** Repositories are loaded in pages of 100; this caps the total at 1000. */
const MAX_REPO_PAGES = 10

function ghEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: cliPath(),
    // Never wait for input, never print colors or update notices into the parsed output.
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    GH_PAGER: '',
    NO_COLOR: '1',
    CLICOLOR: '0',
  }
}

class GhCommandError extends Error {
  constructor(readonly error: GitHubError) {
    super(error.message)
  }
}

/** Maps a failed `gh` run to an error code, based on the exit reason and stderr. */
function classifyError(error: ExecException, stderr: string): GitHubError {
  const text = `${stderr}\n${error.message}`.toLowerCase()
  const detail = firstLine(stderr) || firstLine(error.message)
  const fail = (code: GitHubErrorCode): GitHubError => ({ code, message: detail })

  if (error.code === 'ENOENT') return fail('notInstalled')
  if (error.killed || error.code === 'ETIMEDOUT') return fail('network')
  if (text.includes('rate limit')) return fail('rateLimited')
  if (
    text.includes('gh auth login') ||
    text.includes('http 401') ||
    text.includes('bad credentials') ||
    text.includes('not logged in')
  ) {
    return fail('notAuthenticated')
  }
  if (
    text.includes('could not resolve to a repository') ||
    text.includes('http 404') ||
    text.includes('not found')
  ) {
    return fail('notFound')
  }
  if (
    text.includes('error connecting to') ||
    text.includes('dial tcp') ||
    text.includes('no such host') ||
    text.includes('timeout') ||
    text.includes('connection refused') ||
    text.includes('connection reset') ||
    text.includes('tls handshake') ||
    text.includes('network is unreachable')
  ) {
    return fail('network')
  }
  return fail('unknown')
}

/** Runs `gh` with the given arguments (never through a shell) and returns stdout. */
function runGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      args,
      {
        env: ghEnv(),
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) reject(new GhCommandError(classifyError(error, String(stderr))))
        else resolve(String(stdout))
      },
    )
  })
}

async function runGhJson<T>(args: string[]): Promise<T> {
  const stdout = await runGh(args)
  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new GhCommandError({ code: 'unknown', message: 'Unexpected output from gh' })
  }
}

function toGitHubError(error: unknown): GitHubError {
  if (error instanceof GhCommandError) return error.error
  return { code: 'unknown', message: error instanceof Error ? error.message : String(error) }
}

/** Runs `load` and turns any failure into an error value, so nothing throws across IPC. */
async function toResult<T>(load: () => Promise<T>): Promise<GitHubResult<T>> {
  try {
    return { ok: true, data: await load() }
  } catch (error) {
    return { ok: false, error: toGitHubError(error) }
  }
}

// --- Status -----------------------------------------------------------------------------

interface RawUser {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
}

export async function getStatus(): Promise<GitHubStatus> {
  try {
    const user = await runGhJson<RawUser>(['api', 'user'])
    const account: GitHubAccount = {
      login: user.login,
      name: user.name || null,
      avatarUrl: user.avatar_url,
      url: user.html_url,
    }
    return { state: 'connected', account }
  } catch (error) {
    const gitHubError = toGitHubError(error)
    if (gitHubError.code === 'notInstalled') return { state: 'notInstalled' }
    if (gitHubError.code === 'notAuthenticated') return { state: 'notAuthenticated' }
    return { state: 'error', error: gitHubError }
  }
}

// --- Repositories -----------------------------------------------------------------------

const repositoriesQuery = `
query($endCursor: String) {
  viewer {
    repositories(
      first: 100
      after: $endCursor
      orderBy: { field: PUSHED_AT, direction: DESC }
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
    ) {
      nodes {
        name
        nameWithOwner
        owner { login }
        description
        visibility
        isArchived
        isFork
        url
        pushedAt
        updatedAt
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

interface RawRepositoryPage {
  data: {
    viewer: {
      repositories: {
        nodes: Array<{
          name: string
          nameWithOwner: string
          owner: { login: string }
          description: string | null
          visibility: string
          isArchived: boolean
          isFork: boolean
          url: string
          pushedAt: string | null
          updatedAt: string
          issues: { totalCount: number }
          pullRequests: { totalCount: number }
        }>
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
      }
    }
  }
}

function toVisibility(value: string): RepositoryVisibility {
  const lower = value.toLowerCase()
  return lower === 'private' || lower === 'internal' ? lower : 'public'
}

async function loadRepositories(): Promise<Repository[]> {
  const repositories: Repository[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_REPO_PAGES; page++) {
    const args = ['api', 'graphql', '-f', `query=${repositoriesQuery}`]
    if (cursor) args.push('-f', `endCursor=${cursor}`)
    const result: RawRepositoryPage = await runGhJson<RawRepositoryPage>(args)
    const connection = result.data.viewer.repositories

    for (const node of connection.nodes) {
      repositories.push({
        fullName: node.nameWithOwner,
        owner: node.owner.login,
        name: node.name,
        description: node.description || null,
        visibility: toVisibility(node.visibility),
        isArchived: node.isArchived,
        isFork: node.isFork,
        openIssues: node.issues.totalCount,
        openPullRequests: node.pullRequests.totalCount,
        url: node.url,
        updatedAt: node.pushedAt ?? node.updatedAt,
      })
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break
    cursor = connection.pageInfo.endCursor
  }

  return repositories
}

// --- Issues and pull requests -----------------------------------------------------------

/** Owner and repository names as GitHub allows them; guards the `-R` argument. */
const namePattern = /^[A-Za-z0-9_.-]{1,100}$/

/** Validates a query that comes from the renderer. */
function parseQuery(value: unknown): RepositoryItemsQuery {
  const input =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const { owner, name, state } = input
  if (
    typeof owner !== 'string' ||
    typeof name !== 'string' ||
    !namePattern.test(owner) ||
    !namePattern.test(name) ||
    !(itemStateFilters as readonly unknown[]).includes(state)
  ) {
    throw new GhCommandError({ code: 'invalidRequest', message: 'Invalid repository query' })
  }
  return { owner, name, state: state as RepositoryItemsQuery['state'] }
}

interface RawAuthor {
  login: string
  is_bot?: boolean
}

interface RawLabel {
  name: string
  color: string
}

function toUser(author: RawAuthor | null | undefined): GitHubUser | null {
  return author?.login ? { login: author.login, isBot: author.is_bot === true } : null
}

function toLabels(labels: RawLabel[] | null | undefined): Label[] {
  return (labels ?? []).map((label) => ({ name: label.name, color: label.color }))
}

/** Loads one item more than shown, to tell whether the list was cut off. */
function toItemList<T>(items: T[]): ItemList<T> {
  return {
    items: items.slice(0, ITEM_LIMIT),
    limit: ITEM_LIMIT,
    truncated: items.length > ITEM_LIMIT,
  }
}

interface RawIssue {
  number: number
  title: string
  state: string
  labels: RawLabel[]
  author: RawAuthor | null
  assignees: RawAuthor[]
  url: string
  updatedAt: string
}

async function loadIssues(rawQuery: unknown): Promise<ItemList<Issue>> {
  const query = parseQuery(rawQuery)
  const raw = await runGhJson<RawIssue[]>([
    'issue',
    'list',
    '--repo',
    `${query.owner}/${query.name}`,
    '--state',
    query.state,
    '--limit',
    String(ITEM_LIMIT + 1),
    '--json',
    'number,title,state,labels,author,assignees,url,updatedAt',
  ])
  return toItemList(
    raw.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state.toLowerCase() === 'closed' ? 'closed' : 'open',
      labels: toLabels(issue.labels),
      author: toUser(issue.author),
      assignees: (issue.assignees ?? []).flatMap((assignee) => toUser(assignee) ?? []),
      url: issue.url,
      updatedAt: issue.updatedAt,
    })),
  )
}

/** One entry of `statusCheckRollup`: either a check run or a commit status. */
interface RawCheck {
  __typename?: string
  status?: string
  conclusion?: string
  state?: string
}

interface RawPullRequest {
  number: number
  title: string
  state: string
  isDraft: boolean
  labels: RawLabel[]
  author: RawAuthor | null
  headRefName: string
  baseRefName: string
  reviewDecision: string | null
  statusCheckRollup: RawCheck[] | null
  url: string
  updatedAt: string
}

const failedConclusions = new Set([
  'FAILURE',
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
  'ERROR',
])

/** Combines all checks of a pull request into one status, the way GitHub's badge does. */
function toCheckStatus(checks: RawCheck[] | null | undefined): CheckStatus {
  if (!checks || checks.length === 0) return 'none'
  let pending = false
  for (const check of checks) {
    // Check runs report `status` + `conclusion`, commit statuses report `state`.
    const outcome = (check.conclusion || check.state || '').toUpperCase()
    if (failedConclusions.has(outcome)) return 'failure'
    const running = check.status !== undefined && check.status.toUpperCase() !== 'COMPLETED'
    if (running || outcome === 'PENDING' || outcome === 'EXPECTED' || outcome === '') {
      pending = true
    }
  }
  return pending ? 'pending' : 'success'
}

function toReviewStatus(decision: string | null): ReviewStatus {
  switch (decision) {
    case 'APPROVED':
      return 'approved'
    case 'CHANGES_REQUESTED':
      return 'changesRequested'
    case 'REVIEW_REQUIRED':
      return 'reviewRequired'
    default:
      return 'none'
  }
}

function toPullRequestState(state: string): PullRequest['state'] {
  const lower = state.toLowerCase()
  return lower === 'merged' || lower === 'closed' ? lower : 'open'
}

async function loadPullRequests(rawQuery: unknown): Promise<ItemList<PullRequest>> {
  const query = parseQuery(rawQuery)
  const raw = await runGhJson<RawPullRequest[]>([
    'pr',
    'list',
    '--repo',
    `${query.owner}/${query.name}`,
    // gh's "closed" includes merged pull requests.
    '--state',
    query.state,
    '--limit',
    String(ITEM_LIMIT + 1),
    '--json',
    'number,title,state,isDraft,labels,author,headRefName,baseRefName,reviewDecision,statusCheckRollup,url,updatedAt',
  ])
  return toItemList(
    raw.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: toPullRequestState(pr.state),
      isDraft: pr.isDraft,
      labels: toLabels(pr.labels),
      author: toUser(pr.author),
      headBranch: pr.headRefName,
      baseBranch: pr.baseRefName,
      reviewStatus: toReviewStatus(pr.reviewDecision),
      checkStatus: toCheckStatus(pr.statusCheckRollup),
      url: pr.url,
      updatedAt: pr.updatedAt,
    })),
  )
}

export const getRepositories = (): Promise<GitHubResult<Repository[]>> => toResult(loadRepositories)

export const getIssues = (query: unknown): Promise<GitHubResult<ItemList<Issue>>> =>
  toResult(() => loadIssues(query))

export const getPullRequests = (query: unknown): Promise<GitHubResult<ItemList<PullRequest>>> =>
  toResult(() => loadPullRequests(query))

/** What an agent reads of an issue: its description, labels and discussion. */
export interface IssueContent {
  state: string
  body: string
  labels: string[]
  comments: { author: string; createdAt: string; body: string }[]
}

interface RawIssueContent {
  state?: string
  body?: string
  labels?: { name?: string }[]
  comments?: { author?: { login?: string } | null; createdAt?: string; body?: string }[]
}

/** Loads an issue's full content for the agents of a job. Throws if `gh` fails. */
export async function getIssueContent(repository: string, number: number): Promise<IssueContent> {
  const raw = await runGhJson<RawIssueContent>([
    'issue',
    'view',
    String(number),
    '--repo',
    repository,
    '--json',
    'state,body,labels,comments',
  ])
  return {
    state: raw.state ?? '',
    body: raw.body ?? '',
    labels: (raw.labels ?? []).map((label) => label.name ?? '').filter(Boolean),
    comments: (raw.comments ?? []).map((comment) => ({
      author: comment.author?.login ?? 'unknown',
      createdAt: comment.createdAt ?? '',
      body: comment.body ?? '',
    })),
  }
}

/** A review comment thread on lines of a pull request's diff. */
export interface ReviewThread {
  /** GraphQL node ID, e.g. to resolve the thread. */
  id: string
  isResolved: boolean
  /** The lines it refers to have changed since. */
  isOutdated: boolean
  path: string
  /** Line in the current diff, or `null` if outdated; `originalLine` is in the diff it was made on. */
  line: number | null
  startLine: number | null
  originalLine: number | null
  side: 'LEFT' | 'RIGHT' | null
  comments: {
    /** REST ID, e.g. to reply to the thread. */
    databaseId: number | null
    author: string
    createdAt: string
    body: string
  }[]
}

/** What an agent reads of a pull request: its branches, description, discussion and reviews. */
export interface PullRequestContent {
  state: string
  isDraft: boolean
  body: string
  labels: string[]
  headBranch: string
  baseBranch: string
  /** `owner/name` of the repository the head branch is in; `null` if it was deleted. */
  headRepository: string | null
  isCrossRepository: boolean
  maintainerCanModify: boolean
  comments: { author: string; createdAt: string; body: string }[]
  totalComments: number
  /** Submitted reviews with their overall comment, e.g. "changes requested". */
  reviews: { author: string; state: string; submittedAt: string; body: string }[]
  threads: ReviewThread[]
  totalThreads: number
}

const pullRequestContentQuery = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state
      isDraft
      body
      headRefName
      baseRefName
      isCrossRepository
      maintainerCanModify
      headRepository { nameWithOwner }
      labels(first: 50) { nodes { name } }
      comments(last: 100) {
        totalCount
        nodes { author { login } createdAt body }
      }
      reviews(last: 100) {
        nodes { author { login } state submittedAt body }
      }
      reviewThreads(first: 100) {
        totalCount
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          originalLine
          diffSide
          comments(first: 50) {
            nodes { databaseId author { login } createdAt body }
          }
        }
      }
    }
  }
}`

interface RawComment {
  databaseId?: number | null
  author?: { login?: string } | null
  createdAt?: string
  body?: string
}

interface RawPullRequestContent {
  data?: {
    repository?: {
      pullRequest?: {
        state?: string
        isDraft?: boolean
        body?: string
        headRefName?: string
        baseRefName?: string
        isCrossRepository?: boolean
        maintainerCanModify?: boolean
        headRepository?: { nameWithOwner?: string } | null
        labels?: { nodes?: ({ name?: string } | null)[] }
        comments?: { totalCount?: number; nodes?: (RawComment | null)[] }
        reviews?: {
          nodes?: ({
            author?: { login?: string } | null
            state?: string
            submittedAt?: string | null
            body?: string
          } | null)[]
        }
        reviewThreads?: {
          totalCount?: number
          nodes?: ({
            id?: string
            isResolved?: boolean
            isOutdated?: boolean
            path?: string
            line?: number | null
            startLine?: number | null
            originalLine?: number | null
            diffSide?: string | null
            comments?: { nodes?: (RawComment | null)[] }
          } | null)[]
        }
      } | null
    } | null
  }
}

function toComment(raw: RawComment): { author: string; createdAt: string; body: string } {
  return {
    author: raw.author?.login ?? 'unknown',
    createdAt: raw.createdAt ?? '',
    body: raw.body ?? '',
  }
}

const present = <T>(value: T | null | undefined): value is T => value != null

/**
 * Loads a pull request's full content for the agents of a job, including its review threads.
 * Throws if `gh` fails or the pull request does not exist.
 */
export async function getPullRequestContent(
  repository: string,
  number: number,
): Promise<PullRequestContent> {
  const [owner = '', name = ''] = repository.split('/')
  if (!namePattern.test(owner) || !namePattern.test(name) || !Number.isInteger(number)) {
    throw new GhCommandError({ code: 'invalidRequest', message: 'Invalid pull request' })
  }
  const raw = await runGhJson<RawPullRequestContent>([
    'api',
    'graphql',
    '-f',
    `query=${pullRequestContentQuery}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
    '-F',
    `number=${number}`,
  ])
  const pr = raw.data?.repository?.pullRequest
  if (!pr) throw new GhCommandError({ code: 'notFound', message: 'Pull request not found' })
  const threads = (pr.reviewThreads?.nodes ?? []).filter(present)
  return {
    state: pr.state ?? '',
    isDraft: pr.isDraft === true,
    body: pr.body ?? '',
    labels: (pr.labels?.nodes ?? []).map((label) => label?.name ?? '').filter(Boolean),
    headBranch: pr.headRefName ?? '',
    baseBranch: pr.baseRefName ?? '',
    headRepository: pr.headRepository?.nameWithOwner ?? null,
    isCrossRepository: pr.isCrossRepository === true,
    maintainerCanModify: pr.maintainerCanModify === true,
    comments: (pr.comments?.nodes ?? []).filter(present).map(toComment),
    totalComments: pr.comments?.totalCount ?? 0,
    reviews: (pr.reviews?.nodes ?? []).filter(present).map((review) => ({
      author: review.author?.login ?? 'unknown',
      state: review.state ?? '',
      submittedAt: review.submittedAt ?? '',
      body: review.body ?? '',
    })),
    threads: threads.map((thread) => ({
      id: thread.id ?? '',
      isResolved: thread.isResolved === true,
      isOutdated: thread.isOutdated === true,
      path: thread.path ?? '',
      line: thread.line ?? null,
      startLine: thread.startLine ?? null,
      originalLine: thread.originalLine ?? null,
      side: thread.diffSide === 'LEFT' || thread.diffSide === 'RIGHT' ? thread.diffSide : null,
      comments: (thread.comments?.nodes ?? []).filter(present).map((comment) => ({
        databaseId: comment.databaseId ?? null,
        ...toComment(comment),
      })),
    })),
    totalThreads: pr.reviewThreads?.totalCount ?? threads.length,
  }
}
