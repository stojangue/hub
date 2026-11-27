import { registerAppIpc } from './app'
import { registerBlueprintsIpc } from './blueprints'
import { registerGitHubIpc } from './github'
import { registerJobsIpc } from './jobs'
import { registerSettingsIpc } from './settings'

/** Registers all IPC handlers. Add one `register…Ipc()` call per domain. */
export function registerIpc(): void {
  registerAppIpc()
  registerSettingsIpc()
  registerGitHubIpc()
  registerBlueprintsIpc()
  registerJobsIpc()
}
