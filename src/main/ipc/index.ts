import { registerAppIpc } from './app'
import { registerBlueprintsIpc } from './blueprints'
import { registerClaudeIpc } from './claude'
import { registerFoldersIpc } from './folders'
import { registerGitHubIpc } from './github'
import { registerJobsIpc } from './jobs'
import { registerSettingsIpc } from './settings'

/** Registers all IPC handlers. Add one `register…Ipc()` call per domain. */
export function registerIpc(): void {
  registerAppIpc()
  registerSettingsIpc()
  registerGitHubIpc()
  registerClaudeIpc()
  registerFoldersIpc()
  registerBlueprintsIpc()
  registerJobsIpc()
}
