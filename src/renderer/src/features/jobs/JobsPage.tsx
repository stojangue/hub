import { DraftingCompass, Plus, ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { jobStatus, type Job } from '@shared/jobs'
import { Button } from '@renderer/components/Button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { EmptyState } from '@renderer/components/EmptyState'
import { ListRow, ListRows, ListRowsSkeleton } from '@renderer/components/ListRow'
import { LoadErrorState } from '@renderer/components/LoadErrorState'
import { PageHeader } from '@renderer/components/PageHeader'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { CreateJobDialog } from './components/CreateJobDialog'
import { useJobs } from './queries'
import { jobStatusStyles } from './run/status-styles'
import { StatusIcon } from './run/status'

export function JobsPage() {
  const t = useT()
  const { data, error, loading, reloading, reload } = useJobs()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Job | null>(null)

  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus aria-hidden className="size-3.5" />
      {t('jobs.new')}
    </Button>
  )

  return (
    <div>
      <PageHeader title={t('jobs.title')} description={t('jobs.description')} action={newButton} />

      {loading ? (
        <ListRowsSkeleton />
      ) : error ? (
        <LoadErrorState onRetry={reload} retrying={reloading} />
      ) : !data?.length ? (
        <EmptyState
          icon={ClipboardList}
          title={t('jobs.empty.title')}
          description={t('jobs.empty.description')}
          className="rounded-xl border border-dashed border-border"
        />
      ) : (
        <ListRows label={t('jobs.list.label')}>
          {data.map((job) => (
            <ListRow
              key={job.id}
              to={`/jobs/${job.id}`}
              icon={<ClipboardList aria-hidden className="size-4" />}
              name={job.name}
              meta={
                <span className="inline-flex items-center gap-1">
                  <StatusIcon style={jobStatusStyles[jobStatus(job)]} className="size-3" />
                  <span className="mr-1.5">{t(jobStatusStyles[jobStatus(job)].labelKey)}</span>
                  <DraftingCompass aria-hidden className="size-3" />
                  <span className="sr-only">{t('jobs.basedOn')}: </span>
                  {job.blueprint.name}
                </span>
              }
              createdAt={job.createdAt}
              deleteLabel={t('jobs.delete.label', { name: job.name })}
              onDelete={() => setDeleting(job)}
            />
          ))}
        </ListRows>
      )}

      <CreateJobDialog open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('jobs.delete.title')}
        description={t('jobs.delete.description', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          if (!deleting) return
          await api.jobs.delete(deleting.id)
          reload()
        }}
      />
    </div>
  )
}
