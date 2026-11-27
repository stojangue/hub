import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

interface LoadErrorStateProps {
  onRetry: () => void
  retrying?: boolean
  className?: string
}

/** Shown when local data could not be loaded from the main process. */
export function LoadErrorState({ onRetry, retrying = false, className }: LoadErrorStateProps) {
  const t = useT()
  return (
    <EmptyState
      tone="danger"
      icon={TriangleAlert}
      title={t('common.loadError')}
      className={className}
      action={
        <Button onClick={onRetry} disabled={retrying}>
          <RefreshCw aria-hidden className={retrying ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {t('common.retry')}
        </Button>
      }
    />
  )
}
