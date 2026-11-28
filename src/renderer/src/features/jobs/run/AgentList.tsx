import { CornerDownRight, Link2 } from 'lucide-react'
import type { AgentRun, RunPlan } from '@shared/runs'
import { blockPresentation } from '@renderer/features/blueprints/blocks'
import { useT } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { durationBetween } from './format'
import { StatusIcon } from './status'
import { agentStatusStyles } from './status-styles'

interface AgentListProps {
  plan: RunPlan
  /** Agent names by node ID. */
  names: Record<string, string>
  /** `null` before the first run. */
  agents: Record<string, AgentRun> | null
  selected: string | null
  onSelect: (nodeId: string) => void
  now: number
}

/**
 * Every agent in one compact list, grouped by strand. Strands run at the same time;
 * inside a chain, an agent starts after the agents named under it.
 */
export function AgentList({ plan, names, agents, selected, onSelect, now }: AgentListProps) {
  const t = useT()
  const AgentIcon = blockPresentation.agent.icon
  const parallel = plan.strands.length

  return (
    <nav aria-label={t('run.agents')} className="space-y-2 p-2">
      {parallel > 1 && (
        <p className="px-2 pt-1">
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            {t('run.parallel', { count: parallel })}
          </span>
        </p>
      )}
      {plan.strands.map((strand) => {
        const chain = strand.steps.length > 1
        return (
          <section
            key={strand.steps[0]?.nodeId}
            aria-label={chain ? t('run.chain', { count: strand.steps.length }) : undefined}
            className={cn(chain && 'rounded-lg bg-port-result/8 p-1')}
          >
            {chain && (
              <h3 className="flex items-center gap-1.5 px-2 pt-0.5 pb-1 text-xs font-medium text-port-result">
                <Link2 aria-hidden className="size-3" />
                {t('run.chain', { count: strand.steps.length })}
              </h3>
            )}
            <ul className="space-y-0.5">
              {strand.steps.map((step) => {
                const agent = agents?.[step.nodeId]
                const isSelected = step.nodeId === selected
                const duration = agent
                  ? durationBetween(agent.startedAt, agent.finishedAt, now)
                  : null
                return (
                  <li key={step.nodeId}>
                    <button
                      type="button"
                      aria-current={isSelected || undefined}
                      onClick={() => onSelect(step.nodeId)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        isSelected ? 'bg-border/60 font-medium' : 'hover:bg-border/40',
                        agent?.status === 'skipped' && 'opacity-60',
                      )}
                    >
                      {agent ? (
                        <StatusIcon style={agentStatusStyles[agent.status]} />
                      ) : (
                        <AgentIcon aria-hidden className="size-4 shrink-0 text-port-result" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{names[step.nodeId] ?? step.nodeId}</span>
                        {step.dependsOn.length > 0 && (
                          <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted">
                            <CornerDownRight aria-hidden className="size-3 shrink-0" />
                            <span className="truncate">
                              {t('run.after', {
                                names: step.dependsOn.map((id) => names[id] ?? id).join(', '),
                              })}
                            </span>
                          </span>
                        )}
                      </span>
                      {duration && (
                        <span className="shrink-0 text-xs font-normal text-muted tabular-nums">
                          {duration}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </nav>
  )
}
