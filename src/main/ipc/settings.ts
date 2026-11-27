import { IpcChannel } from '@shared/ipc'
import { getSettings, updateSettings } from '../settings'
import { handle } from './handle'

export function registerSettingsIpc(): void {
  handle(IpcChannel.SettingsGet, () => getSettings())
  // The payload comes from the renderer, so it is validated before it is applied.
  handle(IpcChannel.SettingsSet, (_event, patch) => updateSettings(patch))
}
