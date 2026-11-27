/**
 * IPC contract shared by main, preload and renderer.
 *
 * Every channel is declared once here: its name plus request and response types.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

import type {
  GitHubResult,
  GitHubStatus,
  Issue,
  ItemList,
  PullRequest,
  Repository,
  RepositoryItemsQuery,
} from './github'
import type { Settings } from './settings'

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  GitHubStatus: 'github:status',
  GitHubRepos: 'github:repos',
  GitHubIssues: 'github:issues',
  GitHubPullRequests: 'github:pullRequests',
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
}
