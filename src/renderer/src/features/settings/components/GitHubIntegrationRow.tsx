import { CircleCheck, CircleX, RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@renderer/components/Badge'
import { Button } from '@renderer/components/Button'
import { Skeleton } from '@renderer/components/Skeleton'
import { errorTitleKeys } from '@renderer/github/errors'
import { useGitHubStatus } from '@renderer/github/use-github-status'
import { useT } from '@renderer/i18n'
import { SettingRow } from './SettingsSection'

const INSTALL_URL = 'https://cli.github.com'

/** Shows whether the GitHub CLI is installed and signed in, with a button to check again. */
export function GitHubIntegrationRow() {
  const t = useT()
  const { data: status, error, loading, reloading, reload } = useGitHubStatus()
  const checking = loading || reloading

  let badge: ReactNode
  let description: ReactNode

  if (loading) {
    badge = <Skeleton className="h-5 w-24 rounded-full" />
    description = t('settings.github.checking')
  } else if (status?.state === 'connected') {
    const { account } = status
    badge = (
      <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3" />}>
        {t('settings.github.connected')}
      </Badge>
    )
    description = (
      <span className="inline-flex items-center gap-1.5">
        <img src={account.avatarUrl} alt="" className="size-4 rounded-full" />
        {t('settings.github.signedInAs', { login: account.login })}
      </span>
    )
  } else if (status?.state === 'notAuthenticated') {
    badge = (
      <Badge tone="warning" icon={<TriangleAlert aria-hidden className="size-3" />}>
        {t('settings.github.notAuthenticated')}
      </Badge>
    )
    description = (
      <>
        {t('settings.github.notAuthenticatedHint')}{' '}
        <code className="rounded bg-border/60 px-1 font-mono text-xs text-foreground">
          gh auth login
        </code>
      </>
    )
  } else if (status?.state === 'notInstalled') {
    badge = (
      <Badge tone="danger" icon={<CircleX aria-hidden className="size-3" />}>
        {t('settings.github.notInstalled')}
      </Badge>
    )
    description = (
      <>
        {t('settings.github.notInstalledHint')}{' '}
        <a
          href={INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          cli.github.com
        </a>
      </>
    )
  } else {
    const code = status?.state === 'error' ? status.error.code : 'unknown'
    badge = (
      <Badge tone="danger" icon={<CircleX aria-hidden className="size-3" />}>
        {t('settings.github.error')}
      </Badge>
    )
    description = error ? t('github.error.unknown') : t(errorTitleKeys[code])
  }

  return (
    <SettingRow label={t('settings.github.label')} description={description}>
      <div className="flex items-center gap-3" aria-live="polite">
        {badge}
        <Button onClick={reload} disabled={checking}>
          <RefreshCw aria-hidden className={checking ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {t('settings.github.checkAgain')}
        </Button>
      </div>
    </SettingRow>
  )
}
