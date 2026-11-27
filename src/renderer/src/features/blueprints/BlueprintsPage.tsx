import { DraftingCompass, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Blueprint } from '@shared/blueprints'
import { Button } from '@renderer/components/Button'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { EmptyState } from '@renderer/components/EmptyState'
import { ListRow, ListRows, ListRowsSkeleton } from '@renderer/components/ListRow'
import { LoadErrorState } from '@renderer/components/LoadErrorState'
import { PageHeader } from '@renderer/components/PageHeader'
import { useT } from '@renderer/i18n'
import { api } from '@renderer/lib/api'
import { CreateBlueprintDialog } from './components/CreateBlueprintDialog'
import { useBlueprints } from './queries'

export function BlueprintsPage() {
  const t = useT()
  const { data, error, loading, reloading, reload } = useBlueprints()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Blueprint | null>(null)

  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus aria-hidden className="size-3.5" />
      {t('blueprints.new')}
    </Button>
  )

  return (
    <div>
      <PageHeader
        title={t('blueprints.title')}
        description={t('blueprints.description')}
        action={newButton}
      />

      {loading ? (
        <ListRowsSkeleton />
      ) : error ? (
        <LoadErrorState onRetry={reload} retrying={reloading} />
      ) : !data?.length ? (
        <EmptyState
          icon={DraftingCompass}
          title={t('blueprints.empty.title')}
          description={t('blueprints.empty.description')}
          className="rounded-xl border border-dashed border-border"
        />
      ) : (
        <ListRows label={t('blueprints.list.label')}>
          {data.map((blueprint) => (
            <ListRow
              key={blueprint.id}
              to={`/blueprints/${blueprint.id}`}
              icon={<DraftingCompass aria-hidden className="size-4" />}
              name={blueprint.name}
              createdAt={blueprint.createdAt}
              deleteLabel={t('blueprints.delete.label', { name: blueprint.name })}
              onDelete={() => setDeleting(blueprint)}
            />
          ))}
        </ListRows>
      )}

      <CreateBlueprintDialog open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('blueprints.delete.title')}
        description={t('blueprints.delete.description', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          if (!deleting) return
          await api.blueprints.delete(deleting.id)
          reload()
        }}
      />
    </div>
  )
}
