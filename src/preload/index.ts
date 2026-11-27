import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type HubApi, type IpcRequest, type IpcResponse } from '@shared/ipc'

function invoke<C extends IpcChannel>(channel: C, ...args: IpcRequest<C>): Promise<IpcResponse<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>
}

const api: HubApi = {
  app: {
    getVersion: () => invoke(IpcChannel.AppGetVersion),
  },
}

contextBridge.exposeInMainWorld('api', api)
