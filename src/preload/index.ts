import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type HubApi, type IpcRequest, type IpcResponse } from '@shared/ipc'

function invoke<C extends IpcChannel>(channel: C, ...args: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>
}

const api: HubApi = {
  app: {
    getVersion: () => invoke(IpcChannel.AppGetVersion),
  },
  settings: {
    get: () => invoke(IpcChannel.SettingsGet),
    set: (patch) => invoke(IpcChannel.SettingsSet, patch),
  },
  github: {
    status: () => invoke(IpcChannel.GitHubStatus),
    repos: () => invoke(IpcChannel.GitHubRepos),
    issues: (query) => invoke(IpcChannel.GitHubIssues, query),
    pullRequests: (query) => invoke(IpcChannel.GitHubPullRequests, query),
  },
  blueprints: {
    list: () => invoke(IpcChannel.BlueprintsList),
    get: (id) => invoke(IpcChannel.BlueprintsGet, id),
    create: (input) => invoke(IpcChannel.BlueprintsCreate, input),
    delete: (id) => invoke(IpcChannel.BlueprintsDelete, id),
  },
  jobs: {
    list: () => invoke(IpcChannel.JobsList),
    get: (id) => invoke(IpcChannel.JobsGet, id),
    create: (input) => invoke(IpcChannel.JobsCreate, input),
    delete: (id) => invoke(IpcChannel.JobsDelete, id),
  },
}

contextBridge.exposeInMainWorld('api', api)
