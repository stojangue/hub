import { CornerDownRight, Link2, Repeat } from 'lucide-react'
import type { AgentRun, RunPlan, RunPlanStep } from '@shared/runs'
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
  /** Repeated parts of the plan, by their repeat connection. */
  loops: Record<string, { name: string; maxRounds: number }>
  /** Names of the switches' outputs, by node ID and output ID. */
  outputNames: Record<string, Record<string, string>>
  /** `null` before the first run. Keyed by plan step. */
  agents: Record<string, AgentRun> | null
  /** A plan step ID. */
  selected: string | null
  onSelect: (stepId: string) => void
  now: number
}

/**
 * Every agent in one compact list, grouped by strand. Strands run at the same time;
 * inside a chain, an agent starts after the agents named under it.
 */
export function AgentList({
  plan,
  names,
  loops,
  outputNames,
  agents,
  selected,
  onSelect,
  now,
}: AgentListProps) {
  const t = useT()
  const AgentIcon = blockPresentation.agent.icon

  const parallel = plan.strands.length
  const steps = new Map(
    plan.strands.flatMap((strand) => strand.steps).map((step) => [step.id, step]),
  )
  const stepName = (id: string) => {
    const step = steps.get(id)
    const name = names[step?.nodeId ?? id] ?? id
    return step && step.round > 1 ? `${name} (${t('run.round', { round: step.round })})` : name
  }

  function renderStep(step: RunPlanStep) {
    const agent = agents?.[step.id]
    const isSelected = step.id === selected
    const duration = agent ? durationBetween(agent.startedAt, agent.finishedAt, now) : null
    return (
      <li key={step.id}>
        <button
          type="button"
          aria-current={isSelected || undefined}
          onClick={() => onSelect(step.id)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent',
            isSelected ? 'bg-border/60 font-medium' : 'hover:bg-border/40',
            (agent?.status === 'skipped' || agent?.status === 'notTaken') && 'opacity-60',
          )}
        >
          {agent ? (
            <StatusIcon style={agentStatusStyles[agent.status]} />
          ) : (
            <AgentIcon aria-hidden className="size-4 shrink-0 text-port-result" />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{names[step.nodeId] ?? step.nodeId}</span>
              {agent?.chosenOutput && (
                <span className="shrink-0 rounded-full bg-accent/10 px-1.5 text-xs font-medium text-accent">
                  → {outputNames[step.nodeId]?.[agent.chosenOutput] ?? agent.chosenOutput}
                </span>
              )}
            </span>
            {step.dependsOn.length > 0 && (
              <span className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted">
                <CornerDownRight aria-hidden className="size-3 shrink-0" />
                <span className="truncate">
                  {t('run.after', { names: step.dependsOn.map(stepName).join(', ') })}
                </span>
              </span>
            )}
          </span>
          {duration && (
            <span className="shrink-0 text-xs font-normal text-muted tabular-nums">{duration}</span>
          )}
        </button>
      </li>
    )
  }

  /** Steps of one loop that follow each other are shown together, round by round. */
  function renderSteps(list: RunPlanStep[]) {
    const groups: { loopId: string | null; steps: RunPlanStep[] }[] = []
    for (const step of list) {
      const last = groups[groups.length - 1]
      if (last && last.loopId !== null && last.loopId === step.loopId) last.steps.push(step)
      else groups.push({ loopId: step.loopId, steps: [step] })
    }
    return groups.map((group) => {
      const loop = group.loopId ? loops[group.loopId] : undefined
      if (!group.loopId || !loop) return group.steps.map(renderStep)
      const rounds = [...new Set(group.steps.map((step) => step.round))]
      return (
        <li key={`loop:${group.steps[0]?.id}`}>
          <section
            aria-label={loop.name}
            className="rounded-md border border-dashed border-accent/40 bg-accent/4 p-1"
          >
            <h4 className="flex items-center gap-1.5 px-1.5 pt-0.5 pb-1 text-xs font-medium text-accent">
              <Repeat aria-hidden className="size-3" />
              <span className="truncate">
                {t('run.loop', { name: loop.name, rounds: loop.maxRounds })}
              </span>
            </h4>
            {rounds.map((round) => (
              <div key={round}>
                <p className="px-2 pt-1 text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
                  {t('run.round', { round })}
                </p>
                <ul className="space-y-0.5">
                  {group.steps.filter((step) => step.round === round).map(renderStep)}
                </ul>
              </div>
            ))}
          </section>
        </li>
      )
    })
  }

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
            key={strand.steps[0]?.id}
            aria-label={chain ? t('run.chain', { count: strand.steps.length }) : undefined}
            className={cn(chain && 'rounded-lg bg-port-result/8 p-1')}
          >
            {chain && (
              <h3 className="flex items-center gap-1.5 px-2 pt-0.5 pb-1 text-xs font-medium text-port-result">
                <Link2 aria-hidden className="size-3" />
                {t('run.chain', { count: strand.steps.length })}
              </h3>
            )}
            <ul className="space-y-0.5">{renderSteps(strand.steps)}</ul>
          </section>
        )
      })}
    </nav>
  )
}
