import { app, shell } from 'electron'
import { IpcChannel } from '@shared/ipc'
import { dataFolder, dataFolderReady } from '../data-folder'
import { handle } from './handle'

export function registerAppIpc(): void {
  handle(IpcChannel.AppGetVersion, () => app.getVersion())
  handle(IpcChannel.AppDataFolder, () => dataFolder())
  handle(IpcChannel.AppOpenDataFolder, async () => {
    await dataFolderReady()
    const error = await shell.openPath(dataFolder())
    if (error) throw new Error(error)
  })
}
