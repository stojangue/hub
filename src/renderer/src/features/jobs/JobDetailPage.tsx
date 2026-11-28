import {
  ArrowUpRight,
  ClipboardList,
  DraftingCompass,
  Info,
  Play,
  RotateCcw,
  SearchX,
  Square,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { jobStatus } from '@shared/jobs'
import { planRun, type StartProblem } from '@shared/runs'
import { useBreadcrumbLabel } from '@renderer/breadcrumbs/context'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { LinkButton } from '@renderer/components/LinkButton'
import { LoadErrorState } from '@renderer/components/LoadErrorState'
import { Skeleton } from '@renderer/components/Skeleton'
import { blockPresentation } from '@renderer/features/blueprints/blocks'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { formatDateTime, formatRelativeTime } from '@renderer/lib/relative-time'
import { useSettings } from '@renderer/settings/context'
import { useJob, useJobRun, useNow, type JobWithSource } from './queries'
import { AgentDetails } from './run/AgentDetails'
import { AgentList } from './run/AgentList'
import { durationBetween } from './run/format'
import { StartProblems } from './run/StartProblems'
import { StatusBadge } from './run/status'
import { jobStatusStyles } from './run/status-styles'

export function JobDetailPage() {
  const t = useT()
  const { id = '' } = useParams()
  const { data, error, loading, reloading, reload } = useJob(id)
  useBreadcrumbLabel(data?.job.name ?? (data === null ? t('jobs.notFound.title') : undefined))

  if (loading) {
    return (
      <div aria-hidden className="mx-auto max-w-6xl space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (error) return <LoadErrorState onRetry={reload} retrying={reloading} />
  if (!data) {
    return (
      <EmptyState
        icon={SearchX}
        title={t('jobs.notFound.title')}
        description={t('jobs.notFound.description')}
        action={<LinkButton to="/jobs">{t('jobs.backToList')}</LinkButton>}
      />
    )
  }
  return <JobDetail key={data.job.id} data={data} />
}

/**
 * A job and its latest run: a compact list of all agents, grouped by strand, on the left,
 * and the agent picked there in full on the right.
 */
function JobDetail({ data }: { data: JobWithSource }) {
  const t = useT()
  const { settings } = useSettings()
  const { job, sourceExists } = data
  const { run, loading: runLoading } = useJobRun(job.id)
  const [problems, setProblems] = useState<StartProblem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  const content = job.blueprint.content
  const status = run?.status ?? (runLoading ? jobStatus(job) : 'ready')
  const running = status === 'running'
  const now = useNow(running)
  const plan = useMemo(() => run?.plan ?? planRun(content), [run?.plan, content])
  const steps = plan.strands.flatMap((strand) => strand.steps)
  const names = useMemo(() => {
    const result: Record<string, string> = {}
    for (const node of content.nodes) result[node.id] = node.name
    for (const agent of Object.values(run?.agents ?? {})) result[agent.nodeId] = agent.name
    return result
  }, [content.nodes, run?.agents])

  // Until one is picked, the agent that needs attention most is shown.
  const agentRuns = run ? Object.values(run.agents) : []
  const shownId =
    (picked && steps.some((step) => step.nodeId === picked) ? picked : null) ??
    agentRuns.find((agent) => agent.status === 'running')?.nodeId ??
    agentRuns.find((agent) => agent.status === 'failed')?.nodeId ??
    steps[0]?.nodeId ??
    null
  const shownNode = content.nodes.find((node) => node.id === shownId)
  const workItemNode = content.nodes.find((node) => node.type === 'workItem')
  const workItem = workItemNode ? job.workItems[workItemNode.id] : undefined

  async function start() {
    setBusy(true)
    setFailed(false)
    setProblems(null)
    try {
      const result = await api.jobs.start(job.id)
      if (!result.ok) setProblems(result.problems)
    } catch (error) {
      console.error('Failed to start the job', error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    try {
      await api.jobs.stop(job.id)
    } catch (error) {
      console.error('Failed to stop the job', error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const done = agentRuns.filter((agent) => agent.status === 'done').length
  const runDuration = run ? durationBetween(run.startedAt, run.finishedAt, now) : null
  const WorkItemIcon = blockPresentation.workItem.icon

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ClipboardList aria-hidden className="size-4.5" />
          </div>
          <h1 className="min-w-0 truncate text-lg font-semibold">{job.name}</h1>
          <StatusBadge style={jobStatusStyles[status]} />
          <span className="flex-1" />
          {steps.length > 0 &&
            (running ? (
              <Button onClick={() => void stop()} disabled={busy}>
                <Square aria-hidden className="size-3.5" />
                {t('jobs.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void start()}
                disabled={busy || runLoading}
                title={run ? t('jobs.runAgainHint') : undefined}
              >
                {run ? (
                  <RotateCcw aria-hidden className="size-3.5" />
                ) : (
                  <Play aria-hidden className="size-3.5" />
                )}
                {run ? t('jobs.runAgain') : t('jobs.run')}
              </Button>
            ))}
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-[0.8125rem] text-muted">
          <MetaItem>
            <DraftingCompass aria-hidden className="size-3.5" />
            {sourceExists ? (
              <Link
                to={`/blueprints/${job.blueprint.sourceId}`}
                title={t('jobs.detail.openBlueprint')}
                className="text-foreground hover:text-accent hover:underline"
              >
                {job.blueprint.name}
              </Link>
            ) : (
              <span title={t('jobs.detail.sourceDeleted')}>{job.blueprint.name}</span>
            )}
          </MetaItem>
          {workItemNode && (
            <MetaItem>
              <WorkItemIcon aria-hidden className="size-3.5 text-port-work-item" />
              {workItem ? (
                <a
                  href={workItem.url}
                  target="_blank"
                  rel="noreferrer"
                  title={workItem.title}
                  className="inline-flex max-w-80 items-center gap-0.5 text-foreground hover:text-accent hover:underline"
                >
                  <span className="truncate">
                    #{workItem.number} {workItem.title}
                  </span>
                  <ArrowUpRight aria-hidden className="size-3 shrink-0" />
                </a>
              ) : (
                <span className="text-warning">{t('jobs.detail.workItemMissing')}</span>
              )}
            </MetaItem>
          )}
          {run ? (
            <>
              <MetaItem>
                <time
                  dateTime={run.startedAt}
                  title={formatDateTime(run.startedAt, settings.language)}
                >
                  {t('jobs.detail.started', {
                    time: formatRelativeTime(run.startedAt, settings.language),
                  })}
                </time>
              </MetaItem>
              {runDuration && <MetaItem>{runDuration}</MetaItem>}
              {steps.length > 1 && (
                <MetaItem>{t('jobs.detail.progress', { done, total: steps.length })}</MetaItem>
              )}
            </>
          ) : (
            <MetaItem>
              <time
                dateTime={job.createdAt}
                title={formatDateTime(job.createdAt, settings.language)}
              >
                {t('jobs.detail.createdAgo', {
                  time: formatRelativeTime(job.createdAt, settings.language),
                })}
              </time>
            </MetaItem>
          )}
        </p>
      </div>

      {problems && (
        <StartProblems problems={problems} content={content} onDismiss={() => setProblems(null)} />
      )}
      {failed && (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {t('common.error')}
        </p>
      )}
      {!sourceExists && <Note>{t('jobs.detail.sourceDeleted')}</Note>}
      {!run && !runLoading && steps.length > 0 && <Note>{t('run.notRunYet')}</Note>}

      {steps.length === 0 ? (
        <Note>{t('run.noAgents')}</Note>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="space-y-4 lg:sticky lg:top-0">
            <div className="overflow-hidden rounded-xl border border-border">
              <AgentList
                plan={plan}
                names={names}
                agents={run?.agents ?? null}
                selected={shownId}
                onSelect={setPicked}
                now={now}
              />
            </div>
          </div>
          {shownNode?.type === 'agent' && (
            <AgentDetails
              key={shownNode.id}
              node={shownNode}
              job={job}
              agentRun={run?.agents[shownNode.id]}
              names={names}
              now={now}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** One item of the line under the title, separated by dots. */
function MetaItem({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 [&:not(:first-child)]:before:pr-0.5 [&:not(:first-child)]:before:text-border [&:not(:first-child)]:before:content-['·']">
      {children}
    </span>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2.5 text-[0.8125rem] text-muted">
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  )
}
