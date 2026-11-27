/**
 * IPC contract shared by main, preload and renderer.
 *
 * Every channel is declared once here: its name plus request and response types.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import type { Blueprint, CreateBlueprintInput } from './blueprints'
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
import type { Settings } from './settings'

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  GitHubStatus: 'github:status',
  GitHubRepos: 'github:repos',
  GitHubIssues: 'github:issues',
  GitHubPullRequests: 'github:pullRequests',
  BlueprintsList: 'blueprints:list',
  BlueprintsGet: 'blueprints:get',
  BlueprintsCreate: 'blueprints:create',
  BlueprintsDelete: 'blueprints:delete',
  JobsList: 'jobs:list',
  JobsGet: 'jobs:get',
  JobsCreate: 'jobs:create',
  JobsDelete: 'jobs:delete',
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Request arguments and response type for each `invoke` channel. */
export interface IpcContract {
  [IpcChannel.AppGetVersion]: {
    request: []
    response: string
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
    /** Deleting a missing ID does nothing. */
    request: [id: string]
    response: void
  }
}

export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

/** The API the preload script exposes on `window.api`. */
export interface HubApi {
  app: {
    getVersion: () => Promise<IpcResponse<typeof IpcChannel.AppGetVersion>>
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
  }
}
