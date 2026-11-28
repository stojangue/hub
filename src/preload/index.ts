import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  IpcEvent,
  type HubApi,
  type IpcEventContract,
  type IpcRequest,
  type IpcResponse,
} from '@shared/ipc'

function invoke<C extends IpcChannel>(channel: C, ...args: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>
}

/** Subscribes to a channel the main process sends on. Returns a function that unsubscribes. */
function subscribe<E extends keyof IpcEventContract>(
  channel: E,
  listener: (payload: IpcEventContract[E]) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, payload: IpcEventContract[E]) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
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
    update: (id, input) => invoke(IpcChannel.BlueprintsUpdate, id, input),
    delete: (id) => invoke(IpcChannel.BlueprintsDelete, id),
  },
  jobs: {
    list: () => invoke(IpcChannel.JobsList),
    get: (id) => invoke(IpcChannel.JobsGet, id),
    create: (input) => invoke(IpcChannel.JobsCreate, input),
    delete: (id) => invoke(IpcChannel.JobsDelete, id),
    start: (id) => invoke(IpcChannel.JobsStart, id),
    stop: (id) => invoke(IpcChannel.JobsStop, id),
    run: (id) => invoke(IpcChannel.JobsRun, id),
    onRunEvent: (listener) => subscribe(IpcEvent.RunEvent, listener),
  },
  claude: {
    status: () => invoke(IpcChannel.ClaudeStatus),
    update: () => invoke(IpcChannel.ClaudeUpdate),
  },
  folders: {
    pick: (defaultPath) => invoke(IpcChannel.FoldersPick, defaultPath),
    check: (paths) => invoke(IpcChannel.FoldersCheck, paths),
  },
}

contextBridge.exposeInMainWorld('api', api)
