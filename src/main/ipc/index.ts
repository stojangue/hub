import { registerAppIpc } from './app'
import { registerSettingsIpc } from './settings'

/** Registers all IPC handlers. Add one `register…Ipc()` call per domain. */
export function registerIpc(): void {
  registerAppIpc()
  registerSettingsIpc()
}
