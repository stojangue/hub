import { IpcChannel } from '@shared/ipc'
import { checkFolders, pickFolder } from '../folders'
import { handle } from './handle'

export function registerFoldersIpc(): void {
  // Payloads come from the renderer, so they are validated before they are used.
  handle(IpcChannel.FoldersPick, (event, defaultPath) => pickFolder(event, defaultPath))
  handle(IpcChannel.FoldersCheck, (_event, paths) => checkFolders(paths))
}
