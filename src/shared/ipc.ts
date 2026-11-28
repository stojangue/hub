/**
 * IPC contract shared by main, preload and renderer.
 *
 * Every channel is declared once here: its name plus request and response types.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import type { Blueprint, CreateBlueprintInput, UpdateBlueprintInput } from './blueprints'
import type { ClaudeCliStatus, ClaudeCliUpdateResult } from './claude'
import type {
  GitHubResult,
  GitHubStatus,
  Issue,
  ItemList,
  PullRequest,
  Repository,
  RepositoryItemsQuery,
} from './github'
import type { CreateJobInput, Job } from './jobs'
import type { JobRun, RunEventMessage, StartRunResult } from './runs'
import type { Settings } from './settings'

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  AppDataFolder: 'app:dataFolder',
  AppOpenDataFolder: 'app:openDataFolder',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  GitHubStatus: 'github:status',
  GitHubRepos: 'github:repos',
  GitHubIssues: 'github:issues',
  GitHubPullRequests: 'github:pullRequests',
  BlueprintsList: 'blueprints:list',
  BlueprintsGet: 'blueprints:get',
  BlueprintsCreate: 'blueprints:create',
  BlueprintsUpdate: 'blueprints:update',
  BlueprintsDelete: 'blueprints:delete',
  JobsList: 'jobs:list',
  JobsGet: 'jobs:get',
  JobsCreate: 'jobs:create',
  JobsDelete: 'jobs:delete',
  JobsStart: 'jobs:start',
  JobsStop: 'jobs:stop',
  JobsRun: 'jobs:run',
  ClaudeStatus: 'claude:status',
  ClaudeUpdate: 'claude:update',
  FoldersPick: 'folders:pick',
  FoldersCheck: 'folders:check',
} as const

/** Channels the main process sends on, without a request. */
export const IpcEvent = {
  RunEvent: 'jobs:runEvent',
} as const

export interface IpcEventContract {
  [IpcEvent.RunEvent]: RunEventMessage
}

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Request arguments and response type for each `invoke` channel. */
export interface IpcContract {
  [IpcChannel.AppGetVersion]: {
    request: []
    response: string
  }
  [IpcChannel.AppDataFolder]: {
    /** Absolute path of the folder where the app keeps its data. */
    request: []
    response: string
  }
  [IpcChannel.AppOpenDataFolder]: {
    /** Shows the data folder in Finder. */
    request: []
    response: void
  }
  [IpcChannel.SettingsGet]: {
    request: []
    response: Settings
  }
  [IpcChannel.SettingsSet]: {
    /** Only the given values are changed. */
    request: [patch: Partial<Settings>]
    response: Settings
  }
  [IpcChannel.GitHubStatus]: {
    request: []
    response: GitHubStatus
  }
  [IpcChannel.GitHubRepos]: {
    request: []
    response: GitHubResult<Repository[]>
  }
  [IpcChannel.GitHubIssues]: {
    request: [query: RepositoryItemsQuery]
    response: GitHubResult<ItemList<Issue>>
  }
  [IpcChannel.GitHubPullRequests]: {
    request: [query: RepositoryItemsQuery]
    response: GitHubResult<ItemList<PullRequest>>
  }
  [IpcChannel.BlueprintsList]: {
    request: []
    /** Newest first. */
    response: Blueprint[]
  }
  [IpcChannel.BlueprintsGet]: {
    request: [id: string]
    /** `null` if no blueprint has this ID. */
    response: Blueprint | null
  }
  [IpcChannel.BlueprintsCreate]: {
    /** Rejects if the name is empty. */
    request: [input: CreateBlueprintInput]
    response: Blueprint
  }
  [IpcChannel.BlueprintsUpdate]: {
    /** Content is sanitized. Rejects if the blueprint is missing. */
    request: [id: string, input: UpdateBlueprintInput]
    response: Blueprint
  }
  [IpcChannel.BlueprintsDelete]: {
    /** Existing jobs keep their snapshot. Deleting a missing ID does nothing. */
    request: [id: string]
    response: void
  }
  [IpcChannel.JobsList]: {
    request: []
    /** Newest first. */
    response: Job[]
  }
  [IpcChannel.JobsGet]: {
    request: [id: string]
    /** `null` if no job has this ID. */
    response: Job | null
  }
  [IpcChannel.JobsCreate]: {
    /** Takes a snapshot of the blueprint. Rejects if the name is empty or the blueprint is missing. */
    request: [input: CreateJobInput]
    response: Job
  }
  [IpcChannel.JobsDelete]: {
    /** Rejects while the job is running; stop it first. Deleting a missing ID does nothing. */
    request: [id: string]
    response: void
  }
  [IpcChannel.JobsStart]: {
    /** Checks the requirements, then starts a run that replaces the previous one. */
    request: [id: string]
    response: StartRunResult
  }
  [IpcChannel.JobsStop]: {
    /** Stopping a job that is not running does nothing. */
    request: [id: string]
    response: void
  }
  [IpcChannel.JobsRun]: {
    /** The latest run with its logs, or `null` if the job has not run. */
    request: [id: string]
    response: JobRun | null
  }
  [IpcChannel.ClaudeStatus]: {
    request: []
    response: ClaudeCliStatus
  }
  [IpcChannel.ClaudeUpdate]: {
    /** Runs `claude update`, then checks again. */
    request: []
    response: ClaudeCliUpdateResult
  }
  [IpcChannel.FoldersPick]: {
    /** Opens the system's folder dialog. `null` if it was cancelled. */
    request: [defaultPath?: string]
    response: string | null
  }
  [IpcChannel.FoldersCheck]: {
    /** Whether each path is an existing folder. */
    request: [paths: string[]]
    response: Record<string, boolean>
  }
}

export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

/** The API the preload script exposes on `window.api`. */
export interface HubApi {
  app: {
    getVersion: () => Promise<IpcResponse<typeof IpcChannel.AppGetVersion>>
    dataFolder: () => Promise<IpcResponse<typeof IpcChannel.AppDataFolder>>
    openDataFolder: () => Promise<IpcResponse<typeof IpcChannel.AppOpenDataFolder>>
  }
  settings: {
    get: () => Promise<IpcResponse<typeof IpcChannel.SettingsGet>>
    set: (
      ...args: IpcRequest<typeof IpcChannel.SettingsSet>
    ) => Promise<IpcResponse<typeof IpcChannel.SettingsSet>>
  }
  github: {
    status: () => Promise<IpcResponse<typeof IpcChannel.GitHubStatus>>
    repos: () => Promise<IpcResponse<typeof IpcChannel.GitHubRepos>>
    issues: (
      ...args: IpcRequest<typeof IpcChannel.GitHubIssues>
    ) => Promise<IpcResponse<typeof IpcChannel.GitHubIssues>>
    pullRequests: (
      ...args: IpcRequest<typeof IpcChannel.GitHubPullRequests>
    ) => Promise<IpcResponse<typeof IpcChannel.GitHubPullRequests>>
  }
  blueprints: {
    list: () => Promise<IpcResponse<typeof IpcChannel.BlueprintsList>>
    get: (
      ...args: IpcRequest<typeof IpcChannel.BlueprintsGet>
    ) => Promise<IpcResponse<typeof IpcChannel.BlueprintsGet>>
    create: (
      ...args: IpcRequest<typeof IpcChannel.BlueprintsCreate>
    ) => Promise<IpcResponse<typeof IpcChannel.BlueprintsCreate>>
    update: (
      ...args: IpcRequest<typeof IpcChannel.BlueprintsUpdate>
    ) => Promise<IpcResponse<typeof IpcChannel.BlueprintsUpdate>>
    delete: (
      ...args: IpcRequest<typeof IpcChannel.BlueprintsDelete>
    ) => Promise<IpcResponse<typeof IpcChannel.BlueprintsDelete>>
  }
  jobs: {
    list: () => Promise<IpcResponse<typeof IpcChannel.JobsList>>
    get: (
      ...args: IpcRequest<typeof IpcChannel.JobsGet>
    ) => Promise<IpcResponse<typeof IpcChannel.JobsGet>>
    create: (
      ...args: IpcRequest<typeof IpcChannel.JobsCreate>
    ) => Promise<IpcResponse<typeof IpcChannel.JobsCreate>>
    delete: (
      ...args: IpcRequest<typeof IpcChannel.JobsDelete>
    ) => Promise<IpcResponse<typeof IpcChannel.JobsDelete>>
    start: (
      ...args: IpcRequest<typeof IpcChannel.JobsStart>
    ) => Promise<IpcResponse<typeof IpcChannel.JobsStart>>
    stop: (
      ...args: IpcRequest<typeof IpcChannel.JobsStop>
    ) => Promise<IpcResponse<typeof IpcChannel.JobsStop>>
    run: (
      ...args: IpcRequest<typeof IpcChannel.JobsRun>
    ) => Promise<IpcResponse<typeof IpcChannel.JobsRun>>
    /** Calls `listener` for every change to any run. Returns a function that unsubscribes. */
    onRunEvent: (listener: (message: RunEventMessage) => void) => () => void
  }
  claude: {
    status: () => Promise<IpcResponse<typeof IpcChannel.ClaudeStatus>>
    update: () => Promise<IpcResponse<typeof IpcChannel.ClaudeUpdate>>
  }
  folders: {
    pick: (
      ...args: IpcRequest<typeof IpcChannel.FoldersPick>
    ) => Promise<IpcResponse<typeof IpcChannel.FoldersPick>>
    check: (
      ...args: IpcRequest<typeof IpcChannel.FoldersCheck>
    ) => Promise<IpcResponse<typeof IpcChannel.FoldersCheck>>
  }
}
