import { Plug, RefreshCw, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@renderer/components/Button'
import { EmptyState } from '@renderer/components/EmptyState'
import { GitHubErrorState } from '@renderer/github/GitHubErrorState'
import { useGitHubStatus } from '@renderer/github/use-github-status'
import { useT } from '@renderer/i18n'
import { RepositoryBrowser } from './components/RepositoryBrowser'
import { BrowserSkeleton } from './components/skeletons'

export function DevOpsPage() {
  const t = useT()
  const { data: status, error, loading, reloading, reload } = useGitHubStatus()

  if (loading) return <BrowserSkeleton />
  if (error)
    return (
      <GitHubErrorState error={error} onRetry={reload} retrying={reloading} className="h-full" />
    )
  if (status?.state === 'error') {
    return (
      <GitHubErrorState
        error={status.error}
        onRetry={reload}
        retrying={reloading}
        className="h-full"
      />
    )
  }

  if (status?.state !== 'connected') {
    const notInstalled = status?.state === 'notInstalled'
    return (
      <EmptyState
        className="h-full"
        icon={notInstalled ? Plug : TriangleAlert}
        title={t('devops.notConnected.title')}
        description={t(
          notInstalled
            ? 'devops.notConnected.notInstalled'
            : 'devops.notConnected.notAuthenticated',
        )}
        action={
          <>
            <Link
              to="/settings"
              className="inline-flex h-7 items-center rounded-md bg-accent px-3 font-medium text-background transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('devops.notConnected.openSettings')}
            </Link>
            <Button onClick={reload} disabled={reloading}>
              <RefreshCw aria-hidden className={reloading ? 'size-3.5 animate-spin' : 'size-3.5'} />
              {t('settings.github.checkAgain')}
            </Button>
          </>
        }
      />
    )
  }

  return <RepositoryBrowser />
}
