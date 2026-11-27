/**
 * IPC contract shared by main, preload and renderer.
 *
 * Every channel is declared once here: its name plus request and response types.
 * Must stay free of runtime dependencies on Node or the DOM.
 */

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Request arguments and response type for each `invoke` channel. */
export interface IpcContract {
  [IpcChannel.AppGetVersion]: {
    request: []
    response: string
  }
}

export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

/** The API the preload script exposes on `window.api`. */
export interface HubApi {
  app: {
    getVersion: () => Promise<IpcResponse<typeof IpcChannel.AppGetVersion>>
  }
}
