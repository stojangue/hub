import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron'

/** Opens the system's folder dialog, attached to the window that asked. */
export async function pickFolder(
  event: IpcMainInvokeEvent,
  defaultPath: unknown,
): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
    ...(typeof defaultPath === 'string' && isAbsolute(defaultPath) ? { defaultPath } : {}),
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export async function folderExists(path: string): Promise<boolean> {
  if (!isAbsolute(path)) return false
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** Validates the input, since it comes from the renderer. */
export async function checkFolders(paths: unknown): Promise<Record<string, boolean>> {
  const list = Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === 'string').slice(0, 500)
    : []
  const entries = await Promise.all(list.map(async (path) => [path, await folderExists(path)]))
  return Object.fromEntries(entries) as Record<string, boolean>
}
