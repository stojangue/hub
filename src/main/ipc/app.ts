import { app } from 'electron'
import { IpcChannel } from '@shared/ipc'
import { handle } from './handle'

export function registerAppIpc(): void {
  handle(IpcChannel.AppGetVersion, () => app.getVersion())
}
