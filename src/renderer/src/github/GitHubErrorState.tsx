import { CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { useT } from '@renderer/i18n'
import { errorTitleKeys, toGitHubError } from './errors'

interface GitHubErrorStateProps {
  error: unknown
  onRetry: () => void
  retrying?: boolean
  className?: string
}

/** Error state for failed GitHub requests, with the technical detail in small print. */
export function GitHubErrorState({ error, onRetry, retrying, className }: GitHubErrorStateProps) {
  const t = useT()
  const { code, message } = toGitHubError(error)
  return (
    <EmptyState
      tone="danger"
      icon={CircleAlert}
      title={t(errorTitleKeys[code])}
      className={className}
      description={
        message && <code className="font-mono text-xs break-all text-muted">{message}</code>
      }
      action={
        <Button onClick={onRetry} disabled={retrying}>
          <RefreshCw aria-hidden className={retrying ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {t('common.retry')}
        </Button>
      }
    />
  )
}
