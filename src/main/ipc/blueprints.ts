import { IpcChannel } from '@shared/ipc'
import {
  createBlueprint,
  deleteBlueprint,
  getBlueprint,
  listBlueprints,
  updateBlueprint,
} from '../blueprints'
import { handle } from './handle'

export function registerBlueprintsIpc(): void {
  handle(IpcChannel.BlueprintsList, () => listBlueprints())
  // Payloads come from the renderer, so they are validated before they are stored.
  handle(IpcChannel.BlueprintsGet, (_event, id) => getBlueprint(id))
  handle(IpcChannel.BlueprintsCreate, (_event, input) => createBlueprint(input))
  handle(IpcChannel.BlueprintsUpdate, (_event, id, input) => updateBlueprint(id, input))
  handle(IpcChannel.BlueprintsDelete, (_event, id) => deleteBlueprint(id))
}
