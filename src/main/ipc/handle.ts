import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'

/** Typed wrapper around `ipcMain.handle`, bound to the shared IPC contract. */
export function handle<C extends IpcChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcRequest<C>
  ) => IpcResponse<C> | Promise<IpcResponse<C>>,
): void {
  ipcMain.handle(channel, (event, ...args) => handler(event, ...(args as IpcRequest<C>)))
}
