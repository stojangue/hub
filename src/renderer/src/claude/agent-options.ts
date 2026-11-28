import {
  agentDevOpsAccess,
  agentEfforts,
  agentModels,
  type AgentDevOpsAccess,
  type AgentEffort,
  type AgentModel,
} from '@shared/blocks'
import type { SelectOption } from '@renderer/components/Select'
import type { TranslateFn, TranslationKey } from '@renderer/i18n'

/*
 * Choices for an agent's model, effort and DevOps access. The settings page offers the same
 * values as presets that new agents start with.
 */

const modelKeys: Record<AgentModel, TranslationKey> = {
  default: 'agent.model.default',
  fable: 'agent.model.fable',
  opus: 'agent.model.opus',
  sonnet: 'agent.model.sonnet',
  haiku: 'agent.model.haiku',
}

const effortKeys: Record<AgentEffort, TranslationKey> = {
  default: 'agent.effort.default',
  low: 'agent.effort.low',
  medium: 'agent.effort.medium',
  high: 'agent.effort.high',
  xhigh: 'agent.effort.xhigh',
  max: 'agent.effort.max',
}

const devOpsKeys: Record<AgentDevOpsAccess, TranslationKey> = {
  none: 'agent.devops.none',
  read: 'agent.devops.read',
  write: 'agent.devops.write',
}

function options<T extends string>(
  t: TranslateFn,
  keys: Record<T, TranslationKey>,
  values: readonly T[],
): SelectOption[] {
  return values.map((value) => ({ value, label: t(keys[value]) }))
}

export const modelLabel = (t: TranslateFn, value: AgentModel) => t(modelKeys[value])
export const effortLabel = (t: TranslateFn, value: AgentEffort) => t(effortKeys[value])
export const devOpsLabel = (t: TranslateFn, value: AgentDevOpsAccess) => t(devOpsKeys[value])

export const modelOptions = (t: TranslateFn) => options(t, modelKeys, agentModels)
export const effortOptions = (t: TranslateFn) => options(t, effortKeys, agentEfforts)
export const devOpsOptions = (t: TranslateFn) => options(t, devOpsKeys, agentDevOpsAccess)
