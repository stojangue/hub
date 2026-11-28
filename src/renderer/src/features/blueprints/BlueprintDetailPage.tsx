import { SearchX } from 'lucide-react'
import { useParams } from 'react-router'
import { useBreadcrumbLabel } from '@renderer/breadcrumbs/context'
import { EmptyState } from '@renderer/components/EmptyState'
import { LinkButton } from '@renderer/components/LinkButton'
import { LoadErrorState } from '@renderer/components/LoadErrorState'
import { useT } from '@renderer/i18n'
import { BlueprintEditor } from './editor/BlueprintEditor'
import { useBlueprint } from './queries'

export function BlueprintDetailPage() {
  const t = useT()
  const { id = '' } = useParams()
  const { data: blueprint, error, loading, reloading, reload } = useBlueprint(id)
  useBreadcrumbLabel(
    blueprint?.name ?? (blueprint === null ? t('blueprints.notFound.title') : undefined),
  )

  if (loading) return null
  if (error) return <LoadErrorState onRetry={reload} retrying={reloading} className="h-full" />
  if (!blueprint) {
    return (
      <EmptyState
        className="h-full"
        icon={SearchX}
        title={t('blueprints.notFound.title')}
        description={t('blueprints.notFound.description')}
        action={<LinkButton to="/blueprints">{t('blueprints.backToList')}</LinkButton>}
      />
    )
  }

  return <BlueprintEditor key={blueprint.id} blueprint={blueprint} />
}
