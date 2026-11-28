import { IpcChannel } from '@shared/ipc'
import { getClaudeStatus, updateClaude } from '../claude-cli'
import { handle } from './handle'

export function registerClaudeIpc(): void {
  handle(IpcChannel.ClaudeStatus, () => getClaudeStatus())
  handle(IpcChannel.ClaudeUpdate, () => updateClaude())
}
