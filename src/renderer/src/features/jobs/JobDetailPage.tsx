import { ArrowUpRight, DraftingCompass, Info, SearchX, ClipboardList } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useBreadcrumbLabel } from '@renderer/breadcrumbs/context'
import { EmptyState } from '@renderer/components/EmptyState'
import { LinkButton } from '@renderer/components/LinkButton'
import { LoadErrorState } from '@renderer/components/LoadErrorState'
import { Skeleton } from '@renderer/components/Skeleton'
import { useT } from '@renderer/i18n'
import { formatDateTime } from '@renderer/lib/relative-time'
import { useSettings } from '@renderer/settings/context'
import { useJob } from './queries'

/** Placeholder detail view. Everything shown comes from the job and its snapshot. */
export function JobDetailPage() {
  const t = useT()
  const { settings } = useSettings()
  const { id = '' } = useParams()
  const { data, error, loading, reloading, reload } = useJob(id)
  useBreadcrumbLabel(data?.job.name ?? (data === null ? t('jobs.notFound.title') : undefined))

  if (loading) {
    return (
      <div aria-hidden className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-32 w-full rounded-xl" />
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

  const { job, sourceExists } = data
  const date = (iso: string) => (
    <time dateTime={iso} className="tabular-nums">
      {formatDateTime(iso, settings.language)}
    </time>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <ClipboardList aria-hidden className="size-4.5" />
        </div>
        <h1 className="min-w-0 truncate text-lg font-semibold">{job.name}</h1>
      </div>

      <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        <DetailRow label={t('jobs.detail.created')}>{date(job.createdAt)}</DetailRow>
        <DetailRow label={t('jobs.detail.blueprint')}>
          <span className="inline-flex items-center gap-1.5">
            <DraftingCompass aria-hidden className="size-3.5 text-muted" />
            {sourceExists ? (
              <Link
                to={`/blueprints/${job.blueprint.sourceId}`}
                title={t('jobs.detail.openBlueprint')}
                className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
              >
                {job.blueprint.name}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            ) : (
              <span className="font-medium">{job.blueprint.name}</span>
            )}
          </span>
        </DetailRow>
        <DetailRow label={t('jobs.detail.snapshotAt')}>{date(job.blueprint.snapshotAt)}</DetailRow>
      </dl>

      {!sourceExists && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[0.8125rem] text-warning"
        >
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('jobs.detail.sourceDeleted')}
        </p>
      )}

      <p className="text-[0.8125rem] text-muted">{t('jobs.detail.placeholder')}</p>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-6 px-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  )
}
