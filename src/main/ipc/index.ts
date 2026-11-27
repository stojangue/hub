import { registerAppIpc } from './app'

/** Registers all IPC handlers. Add one `register…Ipc()` call per domain. */
export function registerIpc(): void {
  registerAppIpc()
}
